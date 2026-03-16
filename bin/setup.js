#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const command = process.argv[2] || 'install';

if (command === 'install') {
  install();
} else if (command === 'uninstall') {
  uninstall();
} else {
  console.log(`ui-ralph - AI agent skills for UI development

Usage:
  ui-ralph install     Install skills to .claude/commands/
  ui-ralph uninstall   Remove installed skills
  `);
}

function getProjectRoot() {
  return process.env.INIT_CWD || process.cwd();
}

function install() {
  const projectRoot = getProjectRoot();
  const targetCommandsDir = path.join(projectRoot, '.claude', 'commands');
  const targetE2eDir = path.join(projectRoot, 'e2e', 'utils');

  const sourceCommandsDir = path.join(__dirname, '..', 'commands');
  const sourceE2eDir = path.join(__dirname, '..', 'e2e', 'utils');

  // Install command skills
  fs.mkdirSync(targetCommandsDir, { recursive: true });
  const skills = fs.readdirSync(sourceCommandsDir).filter(f => f.endsWith('.md'));

  for (const file of skills) {
    const src = path.join(sourceCommandsDir, file);
    const dest = path.join(targetCommandsDir, file);

    // Don't overwrite if user has customized
    if (fs.existsSync(dest)) {
      const srcContent = fs.readFileSync(src, 'utf8');
      const destContent = fs.readFileSync(dest, 'utf8');
      if (srcContent !== destContent) {
        console.log(`  skip: ${file} (customized, not overwriting)`);
        continue;
      }
    }

    fs.copyFileSync(src, dest);
    console.log(`  + .claude/commands/${file}`);
  }

  // Install e2e utilities
  fs.mkdirSync(targetE2eDir, { recursive: true });
  const utilFile = 'visual-validator.ts';
  const utilSrc = path.join(sourceE2eDir, utilFile);
  const utilDest = path.join(targetE2eDir, utilFile);

  if (!fs.existsSync(utilDest)) {
    fs.copyFileSync(utilSrc, utilDest);
    console.log(`  + e2e/utils/${utilFile}`);
  } else {
    console.log(`  skip: e2e/utils/${utilFile} (already exists)`);
  }

  // Install playwright config if not exists
  const playwrightSrc = path.join(__dirname, '..', 'e2e', 'playwright.config.ts');
  const playwrightDest = path.join(projectRoot, 'e2e', 'playwright.config.ts');
  if (!fs.existsSync(playwrightDest) && fs.existsSync(playwrightSrc)) {
    fs.copyFileSync(playwrightSrc, playwrightDest);
    console.log(`  + e2e/playwright.config.ts`);
  }

  console.log('\n✓ ui-ralph installed. Use /ui-dev in Claude Code to start.');
}

function uninstall() {
  const projectRoot = getProjectRoot();
  const commandsDir = path.join(projectRoot, '.claude', 'commands');

  const skillFiles = ['ui-dev.md', 'ui-spec.md', 'ui-gen.md', 'ui-verify.md'];

  for (const file of skillFiles) {
    const filePath = path.join(commandsDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`  - .claude/commands/${file}`);
    }
  }

  console.log('\n✓ ui-ralph skills removed. e2e/ utilities were left in place.');
}
