#!/usr/bin/env node
/**
 * Script de compilation des modules
 *
 * Ce script compile tous les modules TypeScript en JavaScript
 * pour permettre le chargement dynamique en production.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MODULES_DIR = path.resolve(__dirname, '../../modules');
const PUBLIC_MODULES_DIR = path.resolve(__dirname, '../public/modules');

console.log('🔨 Building modules...');
console.log(`  Source: ${MODULES_DIR}`);
console.log(`  Output: ${PUBLIC_MODULES_DIR}`);

// Nettoyer le dossier de sortie
if (fs.existsSync(PUBLIC_MODULES_DIR)) {
  console.log('  🧹 Cleaning output directory...');
  fs.rmSync(PUBLIC_MODULES_DIR, { recursive: true, force: true });
}
fs.mkdirSync(PUBLIC_MODULES_DIR, { recursive: true });

// Trouver tous les modules
const modules = fs.readdirSync(MODULES_DIR)
  .filter(name => {
    const fullPath = path.join(MODULES_DIR, name);
    return fs.statSync(fullPath).isDirectory();
  });

console.log(`  📦 Found ${modules.length} module(s): ${modules.join(', ')}\n`);

let compiled = 0;
let skipped = 0;
let errors = 0;

modules.forEach(moduleName => {
  const moduleFrontendPath = path.join(MODULES_DIR, moduleName, 'frontend');

  if (!fs.existsSync(moduleFrontendPath)) {
    console.log(`  ⏭️  ${moduleName}: No frontend (skipped)`);
    skipped++;
    return;
  }

  const moduleConfigPath = path.join(moduleFrontendPath, 'module.config.ts');
  if (!fs.existsSync(moduleConfigPath)) {
    console.log(`  ⏭️  ${moduleName}: No module.config.ts (skipped)`);
    skipped++;
    return;
  }

  console.log(`  🔨 Building ${moduleName}...`);

  try {
    const outputDir = path.join(PUBLIC_MODULES_DIR, moduleName);
    fs.mkdirSync(outputDir, { recursive: true });

    // Compiler avec esbuild (plus rapide que tsc)
    // Toutes les dépendances externes sont externalisées pour être chargées depuis l'app Next.js
    const esbuildCmd = `npx esbuild ${moduleConfigPath} ` +
      `--bundle ` +
      `--format=esm ` +
      `--platform=browser ` +
      `--target=es2020 ` +
      `--jsx=automatic ` +
      `--loader:.tsx=tsx ` +
      `--loader:.ts=ts ` +
      `--external:react ` +
      `--external:react-dom ` +
      `--external:next ` +
      `--external:@/* ` +
      `--external:@tabler/* ` +
      `--external:@radix-ui/* ` +
      `--external:@hookform/* ` +
      `--external:react-hook-form ` +
      `--external:zod ` +
      `--external:clsx ` +
      `--external:class-variance-authority ` +
      `--external:tailwind-merge ` +
      `--external:lucide-react ` +
      `--external:date-fns ` +
      `--packages=external ` +
      `--outfile=${path.join(outputDir, 'module.config.js')}`;

    execSync(esbuildCmd, {
      stdio: 'pipe',
      cwd: path.resolve(__dirname, '..')
    });

    console.log(`  ✅ ${moduleName}: Built successfully`);
    compiled++;
  } catch (error) {
    console.error(`  ❌ ${moduleName}: Build failed`);
    console.error(`     ${error.message}`);
    errors++;
  }
});

console.log('\n' + '='.repeat(60));
console.log('📊 Build Summary:');
console.log(`  ✅ Compiled: ${compiled}`);
console.log(`  ⏭️  Skipped: ${skipped}`);
console.log(`  ❌ Errors: ${errors}`);
console.log('='.repeat(60));

if (errors > 0) {
  process.exit(1);
}

console.log('✅ Modules build complete!');
