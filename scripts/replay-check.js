#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const harnessPath = path.join(__dirname, 'ui-ralph-harness.js');
const goldensRoot = path.join(repoRoot, 'e2e', 'goldens');

const caseDirs = fs
  .readdirSync(goldensRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(goldensRoot, entry.name))
  .sort();

if (caseDirs.length < 3) {
  fail(`Expected at least 3 replay golden cases under ${goldensRoot}`);
}

const results = [];

for (const caseDir of caseDirs) {
  const caseConfig = readJson(path.join(caseDir, 'case.json'));
  const firstRun = runCase(caseConfig, caseDir, 1);
  const secondRun = runCase(caseConfig, caseDir, 2);

  if (JSON.stringify(firstRun.finalState) !== JSON.stringify(secondRun.finalState)) {
    fail(
      `Replay mismatch for ${caseConfig.id}\nfirst: ${JSON.stringify(firstRun.finalState, null, 2)}\nsecond: ${JSON.stringify(secondRun.finalState, null, 2)}`
    );
  }

  results.push({
    id: caseConfig.id,
    expectation: caseConfig.expectation,
    finalState: firstRun.finalState,
  });
}

console.log('ui-ralph replay harness');
for (const result of results) {
  console.log(
    `PASS ${result.id} -> ${result.finalState.runState} / ${result.finalState.inputs
      .map((input) => `${input.id}:${input.fsmState}`)
      .join(', ')}`
  );
}

function runCase(caseConfig, caseDir, attempt) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-ralph-replay-'));
  const e2eArtifactsDir = path.join(tempRoot, 'e2e', '.ui-artifacts');
  fs.mkdirSync(e2eArtifactsDir, { recursive: true });

  copyRequiredFile(caseDir, 'spec.json', path.join(tempRoot, 'e2e', '.ui-spec.json'));
  copyRequiredFile(
    caseDir,
    'e2e-spec.ts',
    path.join(e2eArtifactsDir, 'e2e-spec.ts')
  );
  copyRequiredFile(
    caseDir,
    'verification-report.md',
    path.join(e2eArtifactsDir, 'verification-report.md')
  );
  copyIfExists(caseDir, 'design-ref.png', path.join(e2eArtifactsDir, 'design-ref.png'));
  copyIfExists(
    caseDir,
    'impl-screenshot.png',
    path.join(e2eArtifactsDir, 'impl-screenshot.png')
  );
  copyIfExists(
    caseDir,
    'inputs.json',
    path.join(tempRoot, 'e2e', 'inputs.json')
  );
  copyOptionalReferences(caseConfig, caseDir, tempRoot);

  const initArgs = caseConfig.init?.inputsFile
    ? ['init', '--quality', caseConfig.qualityMode, '--inputs-file', caseConfig.init.inputsFile]
    : ['init', '--quality', caseConfig.qualityMode, '--source', caseConfig.source, '--ref', caseConfig.ref];

  runHarness(tempRoot, initArgs, `${caseConfig.id} init`);

  for (const step of caseConfig.steps) {
    const exitCode = runHarness(tempRoot, step.args, `${caseConfig.id} ${step.args.join(' ')}`);
    const expectedExitCode = step.exitCode ?? 0;
    if (exitCode !== expectedExitCode) {
      fail(
        `Unexpected exit code for ${caseConfig.id} ${step.args.join(' ')}: expected ${expectedExitCode}, got ${exitCode}`
      );
    }
  }

  const finalState = readJson(path.join(tempRoot, 'e2e', '.ui-ralph-run.json'));
  const normalizedFinalState = normalizeState(finalState);
  assertExpectation(caseConfig, normalizedFinalState);

  const eventsPath = path.join(
    tempRoot,
    finalState.artifacts.eventsPath
  );
  fs.rmSync(path.join(tempRoot, 'e2e', '.ui-ralph-run.json'));
  const reconstructedState = readJsonFromCommand(
    tempRoot,
    ['status', '--json', '--events-file', path.relative(tempRoot, eventsPath)],
    `${caseConfig.id} status --events-file`
  );
  const normalizedReconstructedState = normalizeState(reconstructedState);

  if (
    JSON.stringify(normalizedFinalState) !==
    JSON.stringify(normalizedReconstructedState)
  ) {
    fail(
      `Event-log reconstruction mismatch for ${caseConfig.id} attempt ${attempt}\nstate: ${JSON.stringify(normalizedFinalState, null, 2)}\nreconstructed: ${JSON.stringify(normalizedReconstructedState, null, 2)}`
    );
  }

  return {
    finalState: normalizedFinalState,
  };
}

function runHarness(cwd, args, label) {
  const result = spawnSync(process.execPath, [harnessPath, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });

  if (result.error) {
    fail(`${label} failed to start: ${result.error.message}`);
  }

  return result.status ?? 1;
}

function readJsonFromCommand(cwd, args, label) {
  const result = spawnSync(process.execPath, [harnessPath, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });

  if (result.error) {
    fail(`${label} failed to start: ${result.error.message}`);
  }

  if ((result.status ?? 1) !== 0) {
    fail(`${label} failed:\n${result.stderr || result.stdout}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`${label} returned invalid JSON:\n${result.stdout}`);
  }
}

function assertExpectation(caseConfig, normalizedFinalState) {
  const expectation = caseConfig.expectation;
  const currentInput = normalizedFinalState.inputs[0];

  if (normalizedFinalState.runState !== expectation.runState) {
    fail(
      `${caseConfig.id} expected runState=${expectation.runState}, got ${normalizedFinalState.runState}`
    );
  }

  if (currentInput?.fsmState !== expectation.inputFsmState) {
    fail(
      `${caseConfig.id} expected inputFsmState=${expectation.inputFsmState}, got ${currentInput?.fsmState}`
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(expectation, 'lastVerificationResult') &&
    currentInput?.lastVerificationResult !== expectation.lastVerificationResult
  ) {
    fail(
      `${caseConfig.id} expected lastVerificationResult=${expectation.lastVerificationResult}, got ${currentInput?.lastVerificationResult}`
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(expectation, 'blockedReasonCode') &&
    normalizedFinalState.blockedReasonCode !== expectation.blockedReasonCode
  ) {
    fail(
      `${caseConfig.id} expected blockedReasonCode=${expectation.blockedReasonCode}, got ${normalizedFinalState.blockedReasonCode}`
    );
  }
}

function normalizeState(state) {
  return {
    runState: state.runState,
    blockedReasonCode: state.blockedReason?.code || null,
    inputs: (state.inputs || []).map((input) => ({
      id: input.id,
      fsmState: input.fsmState,
      resumeState: input.resumeState || null,
      repairCount: Number(input.repairCount || 0),
      lastVerificationResult: input.lastVerificationResult ?? null,
    })),
  };
}

function copyRequiredFile(caseDir, name, destination) {
  const source = path.join(caseDir, name);
  if (!fs.existsSync(source)) {
    fail(`Missing golden file: ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyIfExists(caseDir, name, destination) {
  const source = path.join(caseDir, name);
  if (!fs.existsSync(source)) {
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyOptionalReferences(caseConfig, caseDir, tempRoot) {
  const spec = readJson(path.join(caseDir, 'spec.json'));
  const fixtureRefs = spec.verification?.fixtureRefs || [];

  for (const relativePath of fixtureRefs) {
    const source = path.join(caseDir, relativePath);
    if (!fs.existsSync(source)) {
      continue;
    }
    const destination = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
