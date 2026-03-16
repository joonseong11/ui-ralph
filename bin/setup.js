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

  // Remove legacy v0.1.0 command files
  const legacyFiles = ['ui-dev.md', 'ui-spec.md', 'ui-gen.md', 'ui-verify.md'];
  for (const file of legacyFiles) {
    const filePath = path.join(targetCommandsDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`  - .claude/commands/${file} (legacy, removed)`);
    }
  }

  // Install command skills (recursively copy files and directories)
  fs.mkdirSync(targetCommandsDir, { recursive: true });
  copyCommandsRecursive(sourceCommandsDir, targetCommandsDir, '');

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

  console.log('\n✓ ui-ralph installed. Use /ui-ralph in Claude Code to start.');
}

function copyCommandsRecursive(srcDir, destDir, prefix) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    const displayPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyCommandsRecursive(src, dest, displayPath);
    } else if (entry.name.endsWith('.md')) {
      if (fs.existsSync(dest)) {
        const srcContent = fs.readFileSync(src, 'utf8');
        const destContent = fs.readFileSync(dest, 'utf8');
        if (srcContent !== destContent) {
          console.log(`  skip: ${displayPath} (customized, not overwriting)`);
          continue;
        }
      }
      fs.copyFileSync(src, dest);
      console.log(`  + .claude/commands/${displayPath}`);
    }
  }
}

function uninstall() {
  const projectRoot = getProjectRoot();
  const commandsDir = path.join(projectRoot, '.claude', 'commands');

  // Remove current version files
  const filePath = path.join(commandsDir, 'ui-ralph.md');
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log('  - .claude/commands/ui-ralph.md');
  }

  const subDir = path.join(commandsDir, 'ui-ralph');
  if (fs.existsSync(subDir)) {
    fs.rmSync(subDir, { recursive: true });
    console.log('  - .claude/commands/ui-ralph/');
  }

  // Remove legacy v0.1.0 files
  const legacyFiles = ['ui-dev.md', 'ui-spec.md', 'ui-gen.md', 'ui-verify.md'];
  for (const file of legacyFiles) {
    const legacy = path.join(commandsDir, file);
    if (fs.existsSync(legacy)) {
      fs.unlinkSync(legacy);
      console.log(`  - .claude/commands/${file} (legacy)`);
    }
  }

  console.log('\n✓ ui-ralph skills removed. e2e/ utilities were left in place.');
}
