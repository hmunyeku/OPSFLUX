#!/usr/bin/env node
/**
 * Playwright scenario runner.
 *
 * Input:
 *   - /input/scenarios.json  → array of { id, name, criticality, script_language, script_content, timeout_seconds }
 *   - env TARGET_URL         → passed to each scenario as `targetUrl`
 *
 * Output:
 *   - /output/screenshots/<scenario_id>-<step>.png
 *   - /output/videos/<scenario_id>.webm
 *   - /output/results.json   → [{ scenario_id, name, criticality, status, duration_seconds, error_excerpt, screenshots, video, console_errors }]
 *
 * The script for each scenario is wrapped inside an async function with
 * `page` and `targetUrl` in scope, so authors don't have to deal with
 * browser setup. Python scenarios are rejected in v1 (TypeScript only).
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const INPUT_PATH = '/input/scenarios.json'
const OUTPUT_DIR = '/output'
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots')
const VIDEOS_DIR = path.join(OUTPUT_DIR, 'videos')

async function main() {
  const targetUrl = process.env.TARGET_URL
  if (!targetUrl) {
    console.error('TARGET_URL env var is required')
    process.exit(2)
  }

  const scenarios = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'))
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true })
  await fs.mkdir(VIDEOS_DIR, { recursive: true })

  const results = []
  const browser = await chromium.launch({ headless: true })

  for (const scenario of scenarios) {
    const started = Date.now()
    const scenarioId = scenario.id
    const entry = {
      scenario_id: scenarioId,
      name: scenario.name,
      criticality: scenario.criticality,
      status: 'pending',
      duration_seconds: 0,
      error_excerpt: null,
      screenshots: [],
      video: null,
      console_errors: [],
      target_url: targetUrl,
    }

    if (scenario.script_language !== 'typescript') {
      entry.status = 'skipped'
      entry.error_excerpt = `Unsupported script_language: ${scenario.script_language}`
      results.push(entry)
      continue
    }

    const context = await browser.newContext({
      recordVideo: { dir: VIDEOS_DIR, size: { width: 1280, height: 720 } },
      viewport: { width: 1280, height: 720 },
    })

    // Capture console errors
    context.on('console', (msg) => {
      if (msg.type() === 'error') entry.console_errors.push(msg.text())
    })

    const page = await context.newPage()
    const screenshot = async (label) => {
      const fp = path.join(SCREENSHOTS_DIR, `${scenarioId}-${label}.png`)
      await page.screenshot({ path: fp, fullPage: false })
      entry.screenshots.push(fp)
    }

    try {
      // Wrap the user script in an async function and execute. The
      // function body receives `{ page, targetUrl, expect, screenshot }`.
      const fn = new Function(
        'page',
        'targetUrl',
        'expect',
        'screenshot',
        `return (async () => { ${scenario.script_content} })()`,
      )
      const { expect } = await import('@playwright/test')
      const timeoutMs = (scenario.timeout_seconds || 60) * 1000
      await Promise.race([
        fn(page, targetUrl, expect, screenshot),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Scenario timed out after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ])
      entry.status = 'passed'
    } catch (err) {
      entry.status = 'failed'
      entry.error_excerpt = String(err?.stack || err).slice(0, 2000)
      try {
        await screenshot('failure')
      } catch {}
    } finally {
      entry.duration_seconds = Math.round((Date.now() - started) / 1000)
      try {
        await context.close()
        const video = page.video()
        if (video) {
          entry.video = await video.path()
        }
      } catch {}
      results.push(entry)
    }
  }

  await browser.close()
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'results.json'),
    JSON.stringify(results, null, 2),
  )
}

main().catch((err) => {
  console.error('runner crashed:', err)
  process.exit(1)
})
