/**
 * TextDiffViewer — line-level diff between two strings.
 *
 * Minimal LCS (longest common subsequence) diff rendered unified-
 * style with `+` / `-` markers and colored bands. Purpose-built for
 * the template editing screens (PDF, Email) where operators want to
 * see what they've changed before clicking "Save as new version".
 *
 * No external dependency — the diff library footprint (diff / jsdiff)
 * is 30+ KB and we need only line-level granularity.
 *
 * Shape:
 *   <TextDiffViewer original={savedHtml} modified={draftHtml} />
 */
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

type Op = 'eq' | 'add' | 'del'
interface DiffLine { op: Op; left: number | null; right: number | null; text: string }

/** Classic O(n·m) LCS DP — fine for template bodies up to a few
 *  thousand lines. For larger inputs we'd swap in Myers diff, but
 *  that's out of scope for this use case. */
function diffLines(a: string, b: string): DiffLine[] {
  const left = a.split('\n')
  const right = b.split('\n')
  const n = left.length
  const m = right.length

  // LCS length table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  // Walk the table to emit ops
  const out: DiffLine[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      out.push({ op: 'eq', left: i + 1, right: j + 1, text: left[i] })
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ op: 'del', left: i + 1, right: null, text: left[i] })
      i++
    } else {
      out.push({ op: 'add', left: null, right: j + 1, text: right[j] })
      j++
    }
  }
  while (i < n) { out.push({ op: 'del', left: i + 1, right: null, text: left[i++] }) }
  while (j < m) { out.push({ op: 'add', left: null, right: j + 1, text: right[j++] }) }
  return out
}

interface Props {
  original: string
  modified: string
  /** Hide context lines (keep only +/- and a few surrounding). */
  hideContext?: boolean
  className?: string
}

export function TextDiffViewer({ original, modified, hideContext = false, className }: Props) {
  const lines = useMemo(() => diffLines(original, modified), [original, modified])

  const visible = useMemo(() => {
    if (!hideContext) return lines
    // Keep 2 lines of context around each +/- block.
    const out: DiffLine[] = []
    const CTX = 2
    for (let k = 0; k < lines.length; k++) {
      const l = lines[k]
      if (l.op !== 'eq') { out.push(l); continue }
      const nearChange = lines.slice(Math.max(0, k - CTX), k + CTX + 1).some((x) => x.op !== 'eq')
      if (nearChange) out.push(l)
    }
    return out
  }, [lines, hideContext])

  const added = lines.filter((l) => l.op === 'add').length
  const removed = lines.filter((l) => l.op === 'del').length

  return (
    <div className={cn('flex flex-col border border-border rounded-md overflow-hidden bg-muted/10', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30 text-[11px]">
        <span className="font-medium text-foreground">Différences</span>
        <span className="flex items-center gap-3 tabular-nums text-muted-foreground">
          <span className="text-emerald-600">+{added}</span>
          <span className="text-red-600">−{removed}</span>
        </span>
      </div>
      {visible.length === 0 || (added === 0 && removed === 0) ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          Aucune différence
        </div>
      ) : (
        <div className="overflow-auto max-h-[400px] font-mono text-[11px] leading-relaxed">
          <table className="w-full border-collapse">
            <tbody>
              {visible.map((l, idx) => (
                <tr
                  key={idx}
                  className={cn(
                    l.op === 'add' && 'bg-emerald-500/10',
                    l.op === 'del' && 'bg-red-500/10',
                  )}
                >
                  <td className="select-none text-right pr-2 pl-2 py-0.5 text-muted-foreground/60 border-r border-border w-10 text-[10px]">
                    {l.left ?? ''}
                  </td>
                  <td className="select-none text-right pr-2 pl-2 py-0.5 text-muted-foreground/60 border-r border-border w-10 text-[10px]">
                    {l.right ?? ''}
                  </td>
                  <td className="select-none w-4 pl-2 py-0.5 text-muted-foreground">
                    {l.op === 'add' ? '+' : l.op === 'del' ? '−' : ' '}
                  </td>
                  <td className="py-0.5 px-2 whitespace-pre-wrap break-all">
                    <span className={cn(
                      l.op === 'add' && 'text-emerald-800 dark:text-emerald-300',
                      l.op === 'del' && 'text-red-800 dark:text-red-300',
                    )}>
                      {l.text || ' '}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
