#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const command = process.argv[2];
const args = process.argv.slice(3);

const projectRoot = process.env.INIT_CWD || process.cwd();
const statePath = path.join(projectRoot, 'e2e', '.ui-ralph-run.json');
const specPath = path.join(projectRoot, 'e2e', '.ui-spec.json');
const e2eSpecPath = path.join(projectRoot, 'e2e', '.ui-artifacts', 'e2e-spec.ts');
const reportPath = path.join(projectRoot, 'e2e', '.ui-artifacts', 'verification-report.md');
const approvalPath = path.join(projectRoot, 'e2e', '.ui-artifacts', 'human-approval.json');

const validStages = new Set(['spec', 'gen', 'verify']);
const validQualities = new Set(['exact', 'best-effort']);
const exactReferenceTypes = new Set([
  'figma',
  'screenshot',
  'approved-text-reference',
]);

if (!command) {
  printUsage(1);
}

if (command === 'init') {
  initHarness(args);
} else if (command === 'status') {
  printStatus(args);
} else if (command === 'gate') {
  runGate(args);
} else if (command === 'approve') {
  approveHarness(args);
} else {
  printUsage(1);
}

function printUsage(exitCode) {
  console.log(`ui-ralph harness

Usage:
  ui-ralph harness init --quality <exact|best-effort> --source <figma|text|screenshot|modify> --ref <value>
  ui-ralph harness init --quality <exact|best-effort> --inputs-file <path>
  ui-ralph harness status [--json]
  ui-ralph harness approve --by <name> [--note <text>]
  ui-ralph harness gate <spec|gen|verify>
`);
  process.exit(exitCode);
}

function initHarness(argv) {
  const options = parseArgs(argv);
  const qualityMode = options.quality || 'best-effort';
  const inputs = buildInputs(options);

  if (!validQualities.has(qualityMode)) {
    exitWith(`Invalid quality mode: ${qualityMode}`);
  }

  if (inputs.length === 0) {
    exitWith('Harness init requires at least one input.');
  }

  ensureDir(path.dirname(statePath));

  const state = {
    harness: 'ui-ralph',
    version: 1,
    qualityMode,
    createdAt: new Date().toISOString(),
    currentStage: 'spec',
    currentInputIndex: 0,
    inputs: inputs.map((input, index) => ({
      index: index + 1,
      source: input.source,
      ref: input.ref,
      status: index === 0 ? 'in_progress' : 'pending',
    })),
    stages: freshStages(),
    artifacts: {
      statePath: rel(statePath),
      specPath: rel(specPath),
      e2eSpecPath: rel(e2eSpecPath),
      reportPath: rel(reportPath),
      approvalPath: rel(approvalPath),
    },
  };

  writeJson(statePath, state);
  console.log(`Harness initialized: ${rel(statePath)}`);
  console.log(`Quality mode: ${qualityMode}`);
  console.log(`Inputs: ${inputs.length}`);
}

function printStatus(argv) {
  const options = parseArgs(argv);
  const state = readState();
  const currentInput = state.inputs[state.currentInputIndex] || null;

  if (options.json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  console.log(`Harness state: ${rel(statePath)}`);
  console.log(`Quality mode: ${state.qualityMode}`);
  console.log(`Current stage: ${state.currentStage}`);
  if (currentInput) {
    console.log(`Current input: #${currentInput.index} ${currentInput.source} ${currentInput.ref}`);
  }
  for (const [stageName, stage] of Object.entries(state.stages)) {
    console.log(`${stageName}: ${stage.status}${stage.result ? ` (${stage.result})` : ''}`);
  }
}

function runGate(argv) {
  const stage = argv[0];

  if (!validStages.has(stage)) {
    exitWith(`Invalid gate stage: ${stage}`);
  }

  const state = readState();

  if (state.currentStage === 'done') {
    console.log('Harness already completed.');
    return;
  }

  if (stage !== state.currentStage) {
    exitWith(`Stage order violation: expected ${state.currentStage}, got ${stage}`);
  }

  if (stage === 'spec') {
    gateSpec(state);
  } else if (stage === 'gen') {
    gateGen(state);
  } else if (stage === 'verify') {
    gateVerify(state);
  }
}

function approveHarness(argv) {
  const options = parseArgs(argv);
  const state = readState();
  const approver = String(options.by || '').trim();
  const note = String(options.note || '').trim();

  if (!approver) {
    exitWith('Harness approve requires --by <name>.');
  }

  if (state.qualityMode !== 'exact') {
    exitWith('Human approval is only required in exact mode.');
  }

  const approval = {
    approved: true,
    by: approver,
    note,
    approvedAt: new Date().toISOString(),
    currentInputIndex: state.currentInputIndex,
  };

  ensureDir(path.dirname(approvalPath));
  fs.writeFileSync(approvalPath, `${JSON.stringify(approval, null, 2)}\n`);
  console.log(`Approval recorded: ${rel(approvalPath)}`);
}

function gateSpec(state) {
  if (!fs.existsSync(specPath)) {
    exitWith(`Missing spec file: ${rel(specPath)}`);
  }

  const spec = readJson(specPath);
  assertQualityConsistency(state, spec);

  state.stages.spec = {
    status: 'done',
    completedAt: new Date().toISOString(),
  };
  state.currentStage = 'gen';

  writeJson(statePath, state);
  console.log(`GATE PASS: ${rel(specPath)} is valid`);
}

function gateGen(state) {
  if (!fs.existsSync(specPath)) {
    exitWith(`Missing spec file: ${rel(specPath)}`);
  }

  if (!fs.existsSync(e2eSpecPath)) {
    exitWith(`Missing E2E spec file: ${rel(e2eSpecPath)}`);
  }

  state.stages.gen = {
    status: 'done',
    completedAt: new Date().toISOString(),
  };
  state.currentStage = 'verify';

  writeJson(statePath, state);
  console.log(`GATE PASS: ${rel(e2eSpecPath)} exists`);
}

function gateVerify(state) {
  if (!fs.existsSync(reportPath)) {
    exitWith(`Missing verification report: ${rel(reportPath)}`);
  }

  const report = fs.readFileSync(reportPath, 'utf8');
  const result = parseVerificationResult(report);
  const verification = parseVerificationMetadata(report);
  const spec = fs.existsSync(specPath) ? readJson(specPath) : { meta: {} };

  if (!result) {
    exitWith(`Could not parse final result from ${rel(reportPath)}`);
  }

  if (result !== 'PASS') {
    state.stages.verify = {
      status: 'done',
      result,
      completedAt: new Date().toISOString(),
    };
    writeJson(statePath, state);
    exitWith(`Verification did not pass: ${result}`);
  }

  assertExactAcceptance(state, spec, verification);

  state.stages.verify = {
    status: 'done',
    result,
    completedAt: new Date().toISOString(),
  };

  const currentInput = state.inputs[state.currentInputIndex];
  if (currentInput) {
    currentInput.status = 'done';
  }

  if (state.currentInputIndex < state.inputs.length - 1) {
    state.currentInputIndex += 1;
    state.inputs[state.currentInputIndex].status = 'in_progress';
    state.currentStage = 'spec';
    state.stages = freshStages();
    writeJson(statePath, state);
    console.log(`GATE PASS: verification passed, advancing to input #${state.currentInputIndex + 1}`);
    return;
  }

  state.currentStage = 'done';
  writeJson(statePath, state);
  console.log('GATE PASS: verification passed, harness completed');
}

function assertQualityConsistency(state, spec) {
  const meta = spec.meta || {};
  const specQuality = meta.qualityMode;
  const referenceType = meta.referenceType || 'none';
  const source = meta.source;
  const designScreenshot = meta.designScreenshot;

  if (specQuality !== state.qualityMode) {
    exitWith(`Spec qualityMode mismatch: expected ${state.qualityMode}, got ${specQuality || 'missing'}`);
  }

  if (state.qualityMode === 'exact') {
    if (!exactReferenceTypes.has(referenceType)) {
      exitWith(`Exact mode requires approved referenceType, got ${referenceType}`);
    }

    if ((source === 'figma' || source === 'screenshot') && !designScreenshot) {
      exitWith('Exact mode requires designScreenshot for figma/screenshot inputs');
    }

    if (source === 'text' && referenceType !== 'approved-text-reference') {
      exitWith('Text-only exact mode requires approved-text-reference');
    }
  }
}

function assertExactAcceptance(state, spec, verification) {
  const meta = spec.meta || {};
  const referenceType = meta.referenceType || 'none';

  if (state.qualityMode !== 'exact') {
    return;
  }

  if (verification.completeness !== 'complete') {
    exitWith(`Exact mode requires complete verification, got ${verification.completeness || 'missing'}`);
  }

  if ((referenceType === 'figma' || referenceType === 'screenshot') && verification.aiVision !== 'PASS') {
    exitWith(`Exact mode requires AI vision PASS for ${referenceType}, got ${verification.aiVision || 'missing'}`);
  }

  if (!fs.existsSync(approvalPath)) {
    exitWith(`Exact mode requires human approval: ${rel(approvalPath)}`);
  }

  const approval = readJson(approvalPath);
  if (!approval || approval.approved !== true) {
    exitWith(`Exact mode requires approved human approval file: ${rel(approvalPath)}`);
  }

  if (approval.currentInputIndex !== state.currentInputIndex) {
    exitWith(`Human approval does not match current input index in ${rel(approvalPath)}`);
  }
}

function buildInputs(options) {
  if (options['inputs-file']) {
    const inputFile = path.resolve(projectRoot, options['inputs-file']);
    const parsed = readJson(inputFile);

    if (!Array.isArray(parsed)) {
      exitWith(`inputs-file must contain an array: ${inputFile}`);
    }

    return parsed.map(normalizeInput);
  }

  if (!options.source || !options.ref) {
    exitWith('Harness init requires --source and --ref, or --inputs-file.');
  }

  return [normalizeInput({ source: options.source, ref: options.ref })];
}

function normalizeInput(input) {
  if (!input || typeof input !== 'object') {
    exitWith('Each input must be an object with source and ref.');
  }

  const source = String(input.source || '').trim();
  const ref = String(input.ref || '').trim();

  if (!source || !ref) {
    exitWith('Each input requires non-empty source and ref.');
  }

  return { source, ref };
}

function parseVerificationResult(report) {
  const match = report.match(/^최종 결과:\s*(PASS|FAIL|ERROR|UNVERIFIED)\s*$/m);
  return match ? match[1] : null;
}

function parseVerificationMetadata(report) {
  const completeness = report.match(/^-\s*완전성 판정:\s*(complete|incomplete)\s*$/m);
  const aiVision = report.match(/^## AI 비전 리뷰 —\s*(PASS|FAIL|SKIP|N\/A)\s*$/m);

  return {
    completeness: completeness ? completeness[1] : null,
    aiVision: aiVision ? aiVision[1] : null,
  };
}

function freshStages() {
  return {
    spec: { status: 'pending', completedAt: null },
    gen: { status: 'pending', completedAt: null },
    verify: { status: 'pending', result: null, completedAt: null },
  };
}

function readState() {
  if (!fs.existsSync(statePath)) {
    exitWith(`Harness state not found: ${rel(statePath)}. Run "ui-ralph harness init" first.`);
  }

  return readJson(statePath);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return options;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function rel(filePath) {
  return path.relative(projectRoot, filePath) || '.';
}

function exitWith(message) {
  console.error(message);
  process.exit(1);
}
