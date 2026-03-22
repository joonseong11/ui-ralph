#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const command = process.argv[2] || 'install';
const validTargets = new Set(['all', 'claude', 'codex']);
const CODEX_BLOCK_START = '<!-- ui-ralph codex:start -->';
const CODEX_BLOCK_END = '<!-- ui-ralph codex:end -->';

if (command === 'install') {
  const target = (process.argv[3] || 'all').toLowerCase();
  if (!validTargets.has(target)) {
    printUsage(1);
  }
  install(target);
} else if (command === 'uninstall') {
  const target = (process.argv[3] || 'all').toLowerCase();
  if (!validTargets.has(target)) {
    printUsage(1);
  }
  uninstall(target);
} else if (command === 'harness') {
  runHarness(process.argv.slice(3));
} else {
  printUsage(0);
}

function printUsage(exitCode) {
  console.log(`ui-ralph - AI agent skills for UI development

Usage:
  ui-ralph install [all|claude|codex]
  ui-ralph uninstall [all|claude|codex]
  ui-ralph harness <init|status|begin|commit|block|resume|approve|gate> [...]
  `);
  process.exit(exitCode);
}

function getProjectRoot() {
  return process.env.INIT_CWD || process.cwd();
}

function install(installTarget) {
  const projectRoot = getProjectRoot();

  if (installTarget === 'all' || installTarget === 'claude') {
    installClaudeCommands(projectRoot);
  }

  installProjectArtifacts(projectRoot);

  if (installTarget === 'all' || installTarget === 'codex') {
    installCodexIntegration(projectRoot);
  }

  console.log('\n✓ ui-ralph installed. Use /ui-ralph in Claude Code or mention "ui-ralph" in Codex to start.');
}

function runHarness(args) {
  const harnessPath = path.join(__dirname, '..', 'scripts', 'ui-ralph-harness.js');
  const result = spawnSync(process.execPath, [harnessPath, ...args], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

function installClaudeCommands(projectRoot) {
  const targetCommandsDir = path.join(projectRoot, '.claude', 'commands');
  const sourceCommandsDir = path.join(__dirname, '..', 'commands');

  const legacyFiles = ['ui-dev.md', 'ui-spec.md', 'ui-gen.md', 'ui-verify.md'];
  for (const file of legacyFiles) {
    const filePath = path.join(targetCommandsDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`  - .claude/commands/${file} (legacy, removed)`);
    }
  }

  fs.mkdirSync(targetCommandsDir, { recursive: true });
  copyCommandsRecursive(sourceCommandsDir, targetCommandsDir, '');
}

function installProjectArtifacts(projectRoot) {
  const targetE2eDir = path.join(projectRoot, 'e2e', 'utils');
  const sourceE2eDir = path.join(__dirname, '..', 'e2e', 'utils');

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

  const playwrightSrc = path.join(__dirname, '..', 'e2e', 'playwright.config.ts');
  const playwrightDest = path.join(projectRoot, 'e2e', 'playwright.config.ts');
  if (!fs.existsSync(playwrightDest) && fs.existsSync(playwrightSrc)) {
    fs.copyFileSync(playwrightSrc, playwrightDest);
    console.log(`  + e2e/playwright.config.ts`);
  }
}

function installCodexIntegration(projectRoot) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  upsertManagedBlock(agentsPath, renderCodexAgentsBlock());
  console.log('  + AGENTS.md (ui-ralph Codex block)');
}

function renderCodexAgentsBlock() {
  return `${CODEX_BLOCK_START}
## ui-ralph (managed by ui-ralph)

If the user mentions \`ui-ralph\`, \`/ui-ralph\`, \`/ui-ralph:spec\`, \`/ui-ralph:gen\`, \`/ui-ralph:verify\`, or \`/ui-ralph:clean\`, treat that as invoking the local ui-ralph pipeline in Codex.

- Read \`node_modules/ui-ralph/commands/ui-ralph.md\` for the full orchestrator flow
- Read the matching stage file under \`node_modules/ui-ralph/commands/ui-ralph/\` when the user asks for a direct stage
- Do not bypass the pipeline because the task is multi-page, large, or touches many files
- Use the local ui-ralph docs as the source of truth for spec/gen/verify behavior

Codex does not use Claude slash-command installation. In Codex, plain-text mentions of \`ui-ralph\` should trigger this workflow.
${CODEX_BLOCK_END}`;
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

function uninstall(uninstallTarget) {
  const projectRoot = getProjectRoot();

  if (uninstallTarget === 'all' || uninstallTarget === 'claude') {
    uninstallClaudeCommands(projectRoot);
  }

  if (uninstallTarget === 'all' || uninstallTarget === 'codex') {
    uninstallCodexIntegration(projectRoot);
  }

  console.log('\n✓ ui-ralph integrations removed. e2e/ utilities were left in place.');
}

function uninstallClaudeCommands(projectRoot) {
  const commandsDir = path.join(projectRoot, '.claude', 'commands');
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

  const legacyFiles = ['ui-dev.md', 'ui-spec.md', 'ui-gen.md', 'ui-verify.md'];
  for (const file of legacyFiles) {
    const legacy = path.join(commandsDir, file);
    if (fs.existsSync(legacy)) {
      fs.unlinkSync(legacy);
      console.log(`  - .claude/commands/${file} (legacy)`);
    }
  }
}

function uninstallCodexIntegration(projectRoot) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    return;
  }

  const content = fs.readFileSync(agentsPath, 'utf8');
  const nextContent = removeManagedBlock(content);

  if (nextContent === content) {
    return;
  }

  if (nextContent.trim().length === 0) {
    fs.unlinkSync(agentsPath);
    console.log('  - AGENTS.md (removed ui-ralph Codex block and deleted empty file)');
    return;
  }

  fs.writeFileSync(agentsPath, `${nextContent.trimEnd()}\n`);
  console.log('  - AGENTS.md (removed ui-ralph Codex block)');
}

function upsertManagedBlock(filePath, block) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';

  if (existing.includes(CODEX_BLOCK_START) && existing.includes(CODEX_BLOCK_END)) {
    const pattern = new RegExp(
      `${escapeRegExp(CODEX_BLOCK_START)}[\\s\\S]*?${escapeRegExp(CODEX_BLOCK_END)}`,
      'm'
    );
    const next = existing.replace(pattern, block);
    fs.writeFileSync(filePath, `${next.trimEnd()}\n`);
    return;
  }

  const next = existing.trim().length === 0
    ? `${block}\n`
    : `${existing.trimEnd()}\n\n${block}\n`;
  fs.writeFileSync(filePath, next);
}

function removeManagedBlock(content) {
  if (!content.includes(CODEX_BLOCK_START) || !content.includes(CODEX_BLOCK_END)) {
    return content;
  }

  const pattern = new RegExp(
    `\\n?${escapeRegExp(CODEX_BLOCK_START)}[\\s\\S]*?${escapeRegExp(CODEX_BLOCK_END)}\\n?`,
    'm'
  );
  return content.replace(pattern, '\n');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
