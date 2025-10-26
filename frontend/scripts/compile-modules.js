/**
 * Script pour compiler les modules TypeScript en JavaScript
 * avant le build Next.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.resolve(__dirname, '../../modules');
const OUTPUT_DIR = path.resolve(__dirname, '../.compiled-modules');

console.log('🔨 Compiling modules...');
console.log(`  Modules dir: ${MODULES_DIR}`);
console.log(`  Output dir: ${OUTPUT_DIR}`);

// Créer le dossier de sortie
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Trouver tous les modules
const modules = fs.readdirSync(MODULES_DIR)
  .filter(name => fs.statSync(path.join(MODULES_DIR, name)).isDirectory());

console.log(`  Found ${modules.length} module(s): ${modules.join(', ')}`);

// Compiler chaque module
modules.forEach(moduleName => {
  const modulePath = path.join(MODULES_DIR, moduleName);
  const frontendPath = path.join(modulePath, 'frontend');

  if (!fs.existsSync(frontendPath)) {
    console.log(`  ⏭️  Skipping ${moduleName} (no frontend)`);
    return;
  }

  console.log(`  📦 Compiling ${moduleName}...`);

  const outputPath = path.join(OUTPUT_DIR, moduleName);

  try {
    // Utiliser tsc pour compiler le TypeScript
    execSync(
      `npx tsc --project ${path.join(__dirname, '../tsconfig.json')} ` +
      `--outDir ${outputPath} ` +
      `--rootDir ${frontendPath} ` +
      `--moduleResolution bundler ` +
      `--module esnext ` +
      `--target es2017 ` +
      `--skipLibCheck ` +
      `--jsx preserve ` +
      `--noEmit false ` +
      `${frontendPath}/**/*.ts ${frontendPath}/**/*.tsx`,
      { stdio: 'inherit' }
    );
    console.log(`  ✅ ${moduleName} compiled`);
  } catch (error) {
    console.error(`  ❌ Failed to compile ${moduleName}:`, error.message);
  }
});

console.log('✅ Modules compilation complete');
