#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const command = process.argv[2];
const args = process.argv.slice(3);

const projectRoot = process.env.INIT_CWD || process.cwd();
const artifactsDir = path.join(projectRoot, 'e2e', '.ui-artifacts');
const receiptsRoot = path.join(artifactsDir, 'receipts');
const eventsFileName = 'events.ndjson';
const statePath = path.join(projectRoot, 'e2e', '.ui-ralph-run.json');
const specPath = path.join(projectRoot, 'e2e', '.ui-spec.json');
const e2eSpecPath = path.join(artifactsDir, 'e2e-spec.ts');
const reportPath = path.join(artifactsDir, 'verification-report.md');
const implScreenshotPath = path.join(artifactsDir, 'impl-screenshot.png');
const approvalPath = path.join(artifactsDir, 'human-approval.json');

const validStages = new Set(['spec', 'gen', 'verify']);
const validQualities = new Set(['exact', 'best-effort']);
const validSources = new Set(['figma', 'text', 'screenshot', 'modify']);
const validDataStrategies = new Set(['static', 'seeded', 'mocked', 'live']);
const validAuthStrategies = new Set([
  'none',
  'fixed-auth-state',
  'seeded-user',
  'mocked-auth',
]);
const exactReferenceTypes = new Set([
  'figma',
  'screenshot',
  'approved-text-reference',
]);
const TRANSITIONS = {
  'spec.pending': {
    BEGIN_SPEC: {
      target: 'spec.generating',
      actions: [clearBlockedReasonAction, setRunStateAction('running')],
    },
    ...standardBlockTransitions(),
  },
  'spec.generating': {
    SPEC_COMMITTED: {
      target: 'spec.committed',
      actions: [
        applyStageArtifacts('spec'),
        clearBlockedReasonAction,
        setRunStateAction('running'),
      ],
    },
    ...standardBlockTransitions(),
  },
  'spec.committed': {
    SPEC_GATE_PASSED: {
      target: 'gen.pending',
      actions: [clearBlockedReasonAction, setRunStateAction('running')],
    },
    ...standardBlockTransitions(),
  },
  'gen.pending': {
    BEGIN_GEN: {
      target: 'gen.generating',
      actions: [clearBlockedReasonAction, setRunStateAction('running')],
    },
    ...standardBlockTransitions(),
  },
  'gen.generating': {
    GEN_COMMITTED: {
      target: 'gen.committed',
      actions: [
        applyStageArtifacts('gen'),
        clearBlockedReasonAction,
        setRunStateAction('running'),
      ],
    },
    ...standardBlockTransitions(),
  },
  'gen.committed': {
    GEN_GATE_PASSED: {
      target: 'verify.pending',
      actions: [clearBlockedReasonAction, setRunStateAction('running')],
    },
    ...standardBlockTransitions(),
  },
  'verify.pending': {
    BEGIN_VERIFY: {
      target: 'verify.running',
      actions: [
        clearBlockedReasonAction,
        setRunStateAction('running'),
        setLastVerificationResultAction(null),
      ],
    },
    ...standardBlockTransitions(),
  },
  'verify.running': {
    VERIFY_COMMITTED: {
      target: 'verify.reported',
      actions: [
        applyStageArtifacts('verify'),
        syncLastVerificationResultFromEvent,
        clearBlockedReasonAction,
        setRunStateAction('running'),
      ],
    },
    ...standardBlockTransitions(),
  },
  'verify.reported': {
    VERIFY_REPAIR_REQUIRED: {
      target: 'repair.pending',
      actions: [
        syncLastVerificationResultFromEvent,
        setBlockedReasonFromEvent,
        setRunStateAction('blocked'),
        incrementRepairCountAction,
      ],
    },
    VERIFY_RETRY_EXHAUSTED: {
      target: 'repair.retry_exhausted',
      actions: [
        syncLastVerificationResultFromEvent,
        setBlockedReasonFromEvent,
        setRunStateAction('blocked'),
        incrementRepairCountAction,
      ],
    },
    VERIFY_AWAITING_APPROVAL: {
      target: 'verify.awaiting_approval',
      actions: [
        syncLastVerificationResultFromEvent,
        setRunStateAction('blocked'),
        setBlockedReasonFromEvent,
      ],
    },
    VERIFY_GATE_PASSED: [
      {
        guards: [hasNextInputGuard],
        target: 'done',
        actions: [
          syncLastVerificationResultFromEvent,
          markActiveInputCompletedAction,
          clearBlockedReasonAction,
          setRunStateAction('running'),
          clearResumeStateAction,
          activateNextInputAction,
        ],
      },
      {
        target: 'done',
        actions: [
          syncLastVerificationResultFromEvent,
          markActiveInputCompletedAction,
          clearBlockedReasonAction,
          clearResumeStateAction,
          completeRunAction,
        ],
      },
    ],
    ...standardBlockTransitions(),
  },
  'verify.awaiting_approval': {
    APPROVAL_RECORDED: {
      target: 'verify.reported',
      actions: [
        applyApprovalArtifactAction,
        clearBlockedReasonAction,
        clearResumeStateAction,
        setRunStateAction('running'),
      ],
    },
    ...standardBlockTransitions(),
  },
  'blocked.awaiting_user': {
    RESUME: {
      guards: [hasResumeStateGuard],
      target: resumeStateTarget,
      actions: [
        clearBlockedReasonAction,
        clearResumeStateAction,
        setRunStateAction('running'),
      ],
    },
  },
  'blocked.missing_prerequisite': {
    RESUME: {
      guards: [hasResumeStateGuard],
      target: resumeStateTarget,
      actions: [
        clearBlockedReasonAction,
        clearResumeStateAction,
        setRunStateAction('running'),
      ],
    },
  },
  'repair.pending': {
    RESUME: {
      target: 'verify.pending',
      actions: [
        clearBlockedReasonAction,
        clearResumeStateAction,
        setRunStateAction('running'),
      ],
    },
    RETRY_EXHAUSTED: {
      target: 'repair.retry_exhausted',
      actions: [
        setBlockedReasonFromEvent,
        clearResumeStateAction,
        setRunStateAction('blocked'),
      ],
    },
    ...standardBlockTransitions(),
  },
  'repair.retry_exhausted': {
    RESUME: {
      target: 'verify.pending',
      actions: [
        clearBlockedReasonAction,
        clearResumeStateAction,
        setRunStateAction('running'),
      ],
    },
  },
};

if (!command) {
  printUsage(1);
}

if (command === 'init') {
  initHarness(args);
} else if (command === 'status') {
  printStatus(args);
} else if (command === 'begin') {
  beginHarness(args);
} else if (command === 'commit' || command === 'stamp') {
  commitHarness(args);
} else if (command === 'gate') {
  runGate(args);
} else if (command === 'block') {
  blockHarness(args);
} else if (command === 'resume') {
  resumeHarness(args);
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
  ui-ralph harness status [--json] [--events-file <path>]
  ui-ralph harness begin <spec|gen|verify>
  ui-ralph harness commit <spec|gen|verify>
  ui-ralph harness approve --by <name> [--note <text>]
  ui-ralph harness block <awaiting_user|missing_prerequisite|retry_exhausted> --message <text>
  ui-ralph harness resume
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

  const runId = createRunId();
  const state = {
    harness: 'ui-ralph',
    version: 4,
    runId,
    qualityMode,
    runState: 'running',
    createdAt: new Date().toISOString(),
    completedAt: null,
    activeInputId: inputs[0] ? 'input-1' : null,
    blockedReason: null,
    lastEventId: 0,
    environment: captureEnvironment(),
    inputs: inputs.map((input, index) =>
      createInputState(input, index, index === 0)
    ),
    artifacts: {
      statePath: rel(statePath),
      specPath: rel(specPath),
      e2eSpecPath: rel(e2eSpecPath),
      reportPath: rel(reportPath),
      approvalPath: rel(approvalPath),
      receiptsRoot: rel(receiptsRoot),
      eventsPath: rel(eventsLogPathForRun(runId)),
    },
  };

  recordSystemEvent(state, {
    type: 'RUN_INITIALIZED',
    qualityMode: state.qualityMode,
    inputCount: state.inputs.length,
    environment: state.environment,
  });
  writeJson(statePath, state);
  console.log(`Harness initialized: ${rel(statePath)}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Quality mode: ${qualityMode}`);
  console.log(`Inputs: ${inputs.length}`);
}

function printStatus(argv) {
  const options = parseArgs(argv);
  const state = options['events-file']
    ? rebuildStateFromEventsFile(options['events-file'])
    : readState();
  const currentInput = getActiveInput(state);

  if (options.json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  console.log(`Harness state: ${rel(statePath)}`);
  console.log(`Run ID: ${state.runId}`);
  console.log(`Quality mode: ${state.qualityMode}`);
  console.log(`Run state: ${state.runState}`);
  console.log(`Current stage: ${getCurrentStageLabel(state)}`);
  console.log(`Last event: ${state.lastEventId}`);
  if (state.blockedReason?.message) {
    console.log(`Blocked reason: ${state.blockedReason.message}`);
  }
  if (currentInput) {
    console.log(
      `Current input: #${currentInput.index} ${currentInput.source} ${currentInput.ref} (${currentInput.fsmState})`
    );
  }
  for (const input of state.inputs) {
    const resultInfo = input.lastVerificationResult
      ? ` (${input.lastVerificationResult})`
      : '';
    console.log(
      `input #${input.index}: ${input.fsmState}${resultInfo} ${input.source} ${input.ref}`
    );
  }
}

function beginHarness(argv) {
  const stage = argv[0];

  if (!validStages.has(stage)) {
    exitWith(`Invalid begin stage: ${stage}`);
  }

  const state = readState();
  const currentInput = getActiveInputOrExit(state);

  if (!canBeginStage(currentInput.fsmState, stage)) {
    exitWith(
      `Cannot begin ${stage}: active input state is ${currentInput.fsmState}`
    );
  }

  dispatch(state, { type: `BEGIN_${stage.toUpperCase()}` });
  writeJson(statePath, state);

  console.log(`BEGIN PASS: ${stage} started for ${currentInput.id}`);
}

function commitHarness(argv) {
  const stage = argv[0];

  if (!validStages.has(stage)) {
    exitWith(`Invalid commit stage: ${stage}`);
  }

  const state = readState();
  const currentInput = getActiveInputOrExit(state);

  if (!canCommitStage(currentInput.fsmState, stage)) {
    exitWith(
      `Cannot commit ${stage}: active input state is ${currentInput.fsmState}`
    );
  }

  if (stage === 'spec') {
    commitSpec(state);
  } else if (stage === 'gen') {
    commitGen(state);
  } else {
    commitVerify(state);
  }
}

function blockHarness(argv) {
  const reason = String(argv[0] || '').trim();
  const options = parseArgs(argv.slice(1));
  const state = readState();
  const currentInput = getActiveInputOrExit(state);
  const message = String(options.message || '').trim();

  if (!reason) {
    exitWith(
      'Harness block requires <awaiting_user|missing_prerequisite|retry_exhausted>.'
    );
  }

  if (!message) {
    exitWith('Harness block requires --message <text>.');
  }

  if (reason === 'awaiting_user') {
    dispatch(state, {
      type: 'BLOCK_AWAITING_USER',
      blockedReason: {
        code: 'awaiting_user',
        inputId: currentInput.id,
        message,
      },
    });
  } else if (reason === 'missing_prerequisite') {
    dispatch(state, {
      type: 'BLOCK_MISSING_PREREQUISITE',
      blockedReason: {
        code: 'missing_prerequisite',
        inputId: currentInput.id,
        message,
      },
    });
  } else if (reason === 'retry_exhausted') {
    dispatch(state, {
      type: 'RETRY_EXHAUSTED',
      blockedReason: {
        code: 'retry_exhausted',
        inputId: currentInput.id,
        message,
      },
    });
  } else {
    exitWith(`Unsupported block reason: ${reason}`);
  }

  writeJson(statePath, state);
  console.log(`BLOCK PASS: ${reason} for ${currentInput.id}`);
}

function resumeHarness() {
  const state = readState();
  const currentInput = getActiveInputOrExit(state);

  if (!canResumeState(currentInput.fsmState)) {
    exitWith(`Cannot resume from state ${currentInput.fsmState}`);
  }

  dispatch(state, { type: 'RESUME' });
  writeJson(statePath, state);
  console.log(`RESUME PASS: ${currentInput.id} resumed`);
}

function runGate(argv) {
  const stage = argv[0];

  if (!validStages.has(stage)) {
    exitWith(`Invalid gate stage: ${stage}`);
  }

  const state = readState();

  if (state.runState === 'completed') {
    console.log('Harness already completed.');
    return;
  }

  const currentInput = getActiveInputOrExit(state);
  if (!canGateStage(currentInput.fsmState, stage)) {
    exitWith(
      `Stage order violation: active input state is ${currentInput.fsmState}, cannot gate ${stage}`
    );
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
  const currentInput = getActiveInputOrExit(state);
  const currentInputIndex = getActiveInputIndex(state);
  const approver = String(options.by || '').trim();
  const note = String(options.note || '').trim();

  if (!approver) {
    exitWith('Harness approve requires --by <name>.');
  }

  if (state.qualityMode !== 'exact') {
    exitWith('Human approval is only required in exact mode.');
  }

  if (
    currentInput.fsmState !== 'verify.reported' &&
    currentInput.fsmState !== 'verify.awaiting_approval'
  ) {
    exitWith(
      `Human approval is only valid after verification reporting. Active input state: ${currentInput.fsmState}`
    );
  }

  if (currentInput.lastVerificationResult !== 'PASS') {
    exitWith(
      `Human approval requires a PASS verification result. Current result: ${currentInput.lastVerificationResult || 'missing'}`
    );
  }

  const approval = {
    approved: true,
    by: approver,
    note,
    approvedAt: new Date().toISOString(),
    runId: state.runId,
    currentInputIndex,
  };

  ensureDir(path.dirname(approvalPath));
  fs.writeFileSync(approvalPath, `${JSON.stringify(approval, null, 2)}\n`);

  const archivedPath = path.join(
    receiptInputDir(state),
    'human-approval.json'
  );
  writeJson(archivedPath, approval);
  dispatch(state, {
    type: 'APPROVAL_RECORDED',
    approval,
    approvalArtifact: {
      approvalPath: rel(approvalPath),
      receiptPath: rel(archivedPath),
      approvedAt: approval.approvedAt,
      by: approver,
    },
  });
  writeJson(statePath, state);

  console.log(`Approval recorded: ${rel(approvalPath)}`);
}

function commitSpec(state) {
  if (!fs.existsSync(specPath)) {
    exitWith(`Missing spec file: ${rel(specPath)}`);
  }

  const spec = readJson(specPath);
  assertQualityConsistency(state, spec);
  assertSpecStructure(spec);
  const currentInput = getActiveInputOrExit(state);
  const currentInputIndex = getActiveInputIndex(state);

  const receipt = {
    schemaVersion: 1,
    harness: 'ui-ralph',
    runId: state.runId,
    stage: 'spec',
    currentInputIndex,
    stampedAt: new Date().toISOString(),
    qualityMode: state.qualityMode,
    input: currentInput,
    environment: state.environment,
    files: {
      specPath: rel(specPath),
      specSha256: sha256File(specPath),
      designScreenshotSha256: designScreenshotHash(spec.meta?.designScreenshot),
    },
    summary: {
      source: spec.meta?.source || null,
      referenceType: spec.meta?.referenceType || 'none',
      designScreenshot: spec.meta?.designScreenshot || null,
      componentName: spec.component?.name || null,
      componentTargetPath: spec.component?.targetPath || null,
      verificationRoute: spec.verification?.route || null,
      verificationDataStrategy: spec.verification?.dataStrategy || null,
      elementCount: Array.isArray(spec.elements) ? spec.elements.length : 0,
    },
  };

  const receiptPath = writeStageReceipt(state, 'spec', receipt);
  dispatch(state, {
    type: 'SPEC_COMMITTED',
    stageArtifacts: {
      spec: {
        receiptPath: rel(receiptPath),
        specSha256: receipt.files.specSha256,
        designScreenshotSha256: receipt.files.designScreenshotSha256,
      },
    },
  });
  writeJson(statePath, state);

  console.log(`COMMIT PASS: ${rel(receiptPath)}`);
}

function commitGen(state) {
  if (!fs.existsSync(specPath)) {
    exitWith(`Missing spec file: ${rel(specPath)}`);
  }

  if (!fs.existsSync(e2eSpecPath)) {
    exitWith(`Missing E2E spec file: ${rel(e2eSpecPath)}`);
  }

  const spec = readJson(specPath);
  assertQualityConsistency(state, spec);
  assertSpecStructure(spec);
  const currentInput = getActiveInputOrExit(state);
  const currentInputIndex = getActiveInputIndex(state);

  const specReceipt = readStageReceipt(state, 'spec');
  assertReceiptBase(specReceipt, state, 'spec');
  assertReceiptFileHash(specReceipt.files.specSha256, specPath, 'spec');

  const e2eSpecContent = fs.readFileSync(e2eSpecPath, 'utf8');
  const coverage = buildGeneratedTestCoverage(spec, e2eSpecContent);

  const receipt = {
    schemaVersion: 1,
    harness: 'ui-ralph',
    runId: state.runId,
    stage: 'gen',
    currentInputIndex,
    stampedAt: new Date().toISOString(),
    qualityMode: state.qualityMode,
    input: currentInput,
    environment: state.environment,
    files: {
      specPath: rel(specPath),
      specSha256: specReceipt.files.specSha256,
      e2eSpecPath: rel(e2eSpecPath),
      e2eSpecSha256: sha256File(e2eSpecPath),
    },
    coverage,
  };

  const receiptPath = writeStageReceipt(state, 'gen', receipt);
  dispatch(state, {
    type: 'GEN_COMMITTED',
    stageArtifacts: {
      gen: {
        receiptPath: rel(receiptPath),
        e2eSpecSha256: receipt.files.e2eSpecSha256,
      },
    },
  });
  writeJson(statePath, state);

  console.log(`COMMIT PASS: ${rel(receiptPath)}`);
}

function commitVerify(state) {
  if (!fs.existsSync(reportPath)) {
    exitWith(`Missing verification report: ${rel(reportPath)}`);
  }

  const specReceipt = readStageReceipt(state, 'spec');
  const genReceipt = readStageReceipt(state, 'gen');
  const currentInput = getActiveInputOrExit(state);
  const currentInputIndex = getActiveInputIndex(state);

  assertReceiptBase(specReceipt, state, 'spec');
  assertReceiptBase(genReceipt, state, 'gen');
  assertReceiptFileHash(specReceipt.files.specSha256, specPath, 'spec');
  assertReceiptFileHash(genReceipt.files.e2eSpecSha256, e2eSpecPath, 'gen');

  const report = fs.readFileSync(reportPath, 'utf8');
  const result = parseVerificationResult(report);
  const verification = parseVerificationMetadata(report);

  if (!result) {
    exitWith(`Could not parse final result from ${rel(reportPath)}`);
  }

  const receipt = {
    schemaVersion: 1,
    harness: 'ui-ralph',
    runId: state.runId,
    stage: 'verify',
    currentInputIndex,
    stampedAt: new Date().toISOString(),
    qualityMode: state.qualityMode,
    input: currentInput,
    environment: state.environment,
    files: {
      reportPath: rel(reportPath),
      reportSha256: sha256File(reportPath),
      specSha256: specReceipt.files.specSha256,
      e2eSpecSha256: genReceipt.files.e2eSpecSha256,
      implScreenshotSha256: fs.existsSync(implScreenshotPath)
        ? sha256File(implScreenshotPath)
        : null,
    },
    result,
    completeness: verification.completeness,
    aiVision: verification.aiVision,
  };

  const receiptPath = writeStageReceipt(state, 'verify', receipt);
  dispatch(state, {
    type: 'VERIFY_COMMITTED',
    result,
    stageArtifacts: {
      verify: {
        receiptPath: rel(receiptPath),
        reportSha256: receipt.files.reportSha256,
        implScreenshotSha256: receipt.files.implScreenshotSha256,
        result,
      },
    },
  });
  writeJson(statePath, state);

  console.log(`COMMIT PASS: ${rel(receiptPath)}`);
}

function gateSpec(state) {
  if (!fs.existsSync(specPath)) {
    exitWith(`Missing spec file: ${rel(specPath)}`);
  }

  const receipt = readStageReceipt(state, 'spec');
  assertReceiptBase(receipt, state, 'spec');
  assertReceiptFileHash(receipt.files.specSha256, specPath, 'spec');

  const spec = readJson(specPath);
  assertQualityConsistency(state, spec);
  assertSpecStructure(spec);

  dispatch(state, { type: 'SPEC_GATE_PASSED' });

  writeJson(statePath, state);
  console.log(`GATE PASS: ${rel(specPath)} is valid for run ${state.runId}`);
}

function gateGen(state) {
  if (!fs.existsSync(specPath)) {
    exitWith(`Missing spec file: ${rel(specPath)}`);
  }

  if (!fs.existsSync(e2eSpecPath)) {
    exitWith(`Missing E2E spec file: ${rel(e2eSpecPath)}`);
  }

  const specReceipt = readStageReceipt(state, 'spec');
  const receipt = readStageReceipt(state, 'gen');

  assertReceiptBase(specReceipt, state, 'spec');
  assertReceiptBase(receipt, state, 'gen');
  assertReceiptFileHash(specReceipt.files.specSha256, specPath, 'spec');
  assertReceiptFileHash(receipt.files.specSha256, specPath, 'gen/spec');
  assertReceiptFileHash(receipt.files.e2eSpecSha256, e2eSpecPath, 'gen');

  dispatch(state, { type: 'GEN_GATE_PASSED' });

  writeJson(statePath, state);
  console.log(`GATE PASS: ${rel(e2eSpecPath)} is valid for run ${state.runId}`);
}

function gateVerify(state) {
  if (!fs.existsSync(specPath)) {
    exitWith(`Missing spec file: ${rel(specPath)}`);
  }

  if (!fs.existsSync(e2eSpecPath)) {
    exitWith(`Missing E2E spec file: ${rel(e2eSpecPath)}`);
  }

  if (!fs.existsSync(reportPath)) {
    exitWith(`Missing verification report: ${rel(reportPath)}`);
  }

  const receipt = readStageReceipt(state, 'verify');
  const spec = fs.existsSync(specPath) ? readJson(specPath) : { meta: {} };

  assertReceiptBase(receipt, state, 'verify');
  assertReceiptFileHash(receipt.files.specSha256, specPath, 'verify/spec');
  assertReceiptFileHash(receipt.files.e2eSpecSha256, e2eSpecPath, 'verify/gen');
  assertReceiptFileHash(receipt.files.reportSha256, reportPath, 'verify');
  if (receipt.files.implScreenshotSha256) {
    assertReceiptFileHash(
      receipt.files.implScreenshotSha256,
      implScreenshotPath,
      'verify/impl-screenshot'
    );
  }
  assertQualityConsistency(state, spec);
  assertSpecStructure(spec);
  assertVerificationConsistency(spec, receipt);

  if (receipt.result !== 'PASS') {
    const currentInput = getActiveInputOrExit(state);
    const maxAutoFixAttempts =
      Number(spec.verification?.maxAutoFixAttempts || 3) || 3;
    const nextRepairCount = Number(currentInput.repairCount || 0) + 1;
    dispatch(state, {
      type:
        nextRepairCount >= maxAutoFixAttempts
          ? 'VERIFY_RETRY_EXHAUSTED'
          : 'VERIFY_REPAIR_REQUIRED',
      result: receipt.result,
      blockedReason: {
        code:
          nextRepairCount >= maxAutoFixAttempts
            ? 'retry_exhausted'
            : 'repair_pending',
        inputId: getActiveInputOrExit(state).id,
        message:
          nextRepairCount >= maxAutoFixAttempts
            ? `Verification retry budget exhausted after ${receipt.result}`
            : `Verification requires repair after ${receipt.result}`,
      },
    });
    writeJson(statePath, state);
    exitWith(`Verification did not pass: ${receipt.result}`);
  }

  const exactAcceptance = evaluateExactAcceptance(state, spec, receipt);
  if (!exactAcceptance.ok) {
    dispatch(state, {
      type: exactAcceptance.blockedReason
        ? 'VERIFY_AWAITING_APPROVAL'
        : 'VERIFY_REPAIR_REQUIRED',
      result: receipt.result,
      blockedReason:
        exactAcceptance.blockedReason || {
          code: 'repair_pending',
          inputId: getActiveInputOrExit(state).id,
          message: exactAcceptance.message,
        },
    });
    writeJson(statePath, state);
    exitWith(exactAcceptance.message);
  }

  const hadNextInput = hasNextInputGuard(state);
  const nextInputIndex = getActiveInputIndex(state) + 1;
  dispatch(state, {
    type: 'VERIFY_GATE_PASSED',
    result: receipt.result,
  });
  writeJson(statePath, state);
  if (hadNextInput) {
    console.log(
      `GATE PASS: verification passed, advancing to input #${state.inputs[nextInputIndex].index}`
    );
    return;
  }

  console.log('GATE PASS: verification passed, harness completed');
}

function assertQualityConsistency(state, spec) {
  const meta = spec.meta || {};
  const specQuality = meta.qualityMode;
  const referenceType = meta.referenceType || 'none';
  const source = meta.source;
  const designScreenshot = meta.designScreenshot;

  if (specQuality !== state.qualityMode) {
    exitWith(
      `Spec qualityMode mismatch: expected ${state.qualityMode}, got ${specQuality || 'missing'}`
    );
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

function assertSpecStructure(spec) {
  const meta = spec.meta || {};
  const component = spec.component || {};
  const hasScenes = Array.isArray(spec.scenes) && spec.scenes.length > 0;
  const elements = Array.isArray(spec.elements) ? spec.elements : [];
  const verification = spec.verification || {};
  const sceneCoverage = spec.sceneCoverage || null;

  if (!validSources.has(meta.source)) {
    exitWith(`Spec meta.source must be one of ${Array.from(validSources).join(', ')}`);
  }

  if (!component.name || !component.targetPath) {
    exitWith('Spec component.name and component.targetPath are required');
  }

  if (!verification.baseURL || !verification.route) {
    exitWith('Spec verification.baseURL and verification.route are required');
  }

  if (!validDataStrategies.has(verification.dataStrategy)) {
    exitWith(
      `Spec verification.dataStrategy must be one of ${Array.from(validDataStrategies).join(', ')}`
    );
  }

  if (
    verification.authStrategy !== undefined &&
    !validAuthStrategies.has(verification.authStrategy)
  ) {
    exitWith(
      `Spec verification.authStrategy must be one of ${Array.from(validAuthStrategies).join(', ')}`
    );
  }

  if (
    verification.fixtureRefs !== undefined &&
    !Array.isArray(verification.fixtureRefs)
  ) {
    exitWith('Spec verification.fixtureRefs must be an array');
  }

  if (
    verification.externalDeps !== undefined &&
    !Array.isArray(verification.externalDeps)
  ) {
    exitWith('Spec verification.externalDeps must be an array');
  }

  if (
    verification.browserProfile !== undefined &&
    (typeof verification.browserProfile !== 'object' ||
      verification.browserProfile === null ||
      Array.isArray(verification.browserProfile))
  ) {
    exitWith('Spec verification.browserProfile must be an object');
  }

  if (meta.qualityMode === 'exact' && verification.dataStrategy === 'live') {
    exitWith('Exact mode cannot use verification.dataStrategy=live');
  }

  if (meta.qualityMode === 'exact') {
    if (!verification.authStrategy) {
      exitWith('Exact mode requires verification.authStrategy');
    }

    if (!Array.isArray(verification.fixtureRefs)) {
      exitWith('Exact mode requires verification.fixtureRefs');
    }

    if (!Array.isArray(verification.externalDeps)) {
      exitWith('Exact mode requires verification.externalDeps');
    }

    if (!verification.browserProfile || !verification.browserProfile.name) {
      exitWith('Exact mode requires verification.browserProfile.name');
    }

    for (const fixtureRef of verification.fixtureRefs) {
      const fixturePath = path.resolve(projectRoot, fixtureRef);
      if (!fs.existsSync(fixturePath)) {
        exitWith(`Exact mode fixtureRef does not exist: ${fixtureRef}`);
      }
    }

    if (verification.authStrategy === 'fixed-auth-state') {
      const hasAuthState = verification.fixtureRefs.some((fixtureRef) =>
        /auth|storage-state/i.test(path.basename(fixtureRef))
      );
      if (!hasAuthState) {
        exitWith(
          'Exact mode with verification.authStrategy=fixed-auth-state requires an auth-state fixtureRef'
        );
      }
    }
  }

  if (hasDynamicSegment(verification.route)) {
    exitWith(`verification.route must be concrete: ${verification.route}`);
  }

  if (!hasScenes && elements.length === 0) {
    exitWith('Spec must contain at least one verifiable element or use scenes[]');
  }

  if (meta.qualityMode === 'exact' && hasScenes) {
    if (!sceneCoverage || sceneCoverage.status !== 'complete') {
      exitWith('Exact scene-based specs require sceneCoverage.status=complete');
    }
    if (Number(sceneCoverage.inputReferenceCount || 0) > Number(sceneCoverage.mappedReferenceCount || 0)) {
      exitWith('Exact scene-based specs cannot leave input references unmapped');
    }
    if (Array.isArray(sceneCoverage.unmappedReferences) && sceneCoverage.unmappedReferences.length > 0) {
      exitWith('Exact scene-based specs cannot contain unmappedReferences');
    }
  }

  const testIds = new Set();
  const sceneList = hasScenes ? spec.scenes : [{ id: 'root', elements, verification }];
  for (const scene of sceneList) {
    if (!scene || typeof scene !== 'object') {
      exitWith('Each scene must be an object');
    }
    if (hasScenes && (!scene.id || !scene.sourceRef)) {
      exitWith('Each scene requires id and sourceRef');
    }
    const sceneElements = Array.isArray(scene.elements) ? scene.elements : [];
    const sceneVerification = scene.verification || verification;
    if (sceneElements.length === 0) {
      exitWith(`Scene must contain at least one verifiable element: ${scene.id || 'unknown'}`);
    }
    if (!sceneVerification.baseURL || !sceneVerification.route) {
      exitWith(`Scene verification.baseURL and verification.route are required: ${scene.id || 'unknown'}`);
    }
    for (const element of sceneElements) {
      if (!element || typeof element !== 'object') {
        exitWith('Each spec element must be an object');
      }
      if (!element.id || !element.testId) {
        exitWith('Each spec element requires id and testId');
      }
      if (testIds.has(element.testId)) {
        exitWith(`Duplicate element testId in spec: ${element.testId}`);
      }
      testIds.add(element.testId);
    }
  }

  if ((meta.source === 'figma' || meta.source === 'screenshot') && !meta.designScreenshot) {
    exitWith('Figma/screenshot specs require meta.designScreenshot');
  }
}

function assertVerificationConsistency(spec, receipt) {
  const source = spec.meta?.source;

  if (receipt.result === 'PASS' && receipt.completeness !== 'complete') {
    exitWith(
      `PASS verification must report completeness=complete, got ${receipt.completeness || 'missing'}`
    );
  }

  if (
    receipt.result === 'PASS' &&
    (source === 'figma' || source === 'screenshot') &&
    receipt.aiVision !== 'PASS'
  ) {
    exitWith(
      `PASS verification for ${source} inputs requires AI vision PASS, got ${receipt.aiVision || 'missing'}`
    );
  }
}

function evaluateExactAcceptance(state, spec, verification) {
  const meta = spec.meta || {};
  const referenceType = meta.referenceType || 'none';

  if (state.qualityMode !== 'exact') {
    return { ok: true };
  }

  if (verification.completeness !== 'complete') {
    return {
      ok: false,
      message: `Exact mode requires complete verification, got ${verification.completeness || 'missing'}`,
    };
  }

  if (
    (referenceType === 'figma' || referenceType === 'screenshot') &&
    verification.aiVision !== 'PASS'
  ) {
    return {
      ok: false,
      message: `Exact mode requires AI vision PASS for ${referenceType}, got ${verification.aiVision || 'missing'}`,
    };
  }

  const blockedReason = {
    code: 'awaiting_approval',
    inputId: state.activeInputId,
  };

  if (!fs.existsSync(approvalPath)) {
    return {
      ok: false,
      blockedReason: {
        ...blockedReason,
        message: `Exact mode requires human approval: ${rel(approvalPath)}`,
      },
      message: `Exact mode requires human approval: ${rel(approvalPath)}`,
    };
  }

  const approval = readJson(approvalPath);
  if (!approval || approval.approved !== true) {
    return {
      ok: false,
      blockedReason: {
        ...blockedReason,
        message: `Exact mode requires approved human approval file: ${rel(approvalPath)}`,
      },
      message: `Exact mode requires approved human approval file: ${rel(approvalPath)}`,
    };
  }

  if (approval.runId !== state.runId) {
    return {
      ok: false,
      blockedReason: {
        ...blockedReason,
        message: `Human approval runId mismatch in ${rel(approvalPath)}`,
      },
      message: `Human approval runId mismatch in ${rel(approvalPath)}`,
    };
  }

  if (approval.currentInputIndex !== getActiveInputIndex(state)) {
    return {
      ok: false,
      blockedReason: {
        ...blockedReason,
        message: `Human approval does not match current input index in ${rel(approvalPath)}`,
      },
      message: `Human approval does not match current input index in ${rel(approvalPath)}`,
    };
  }

  return { ok: true };
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

  if (!validSources.has(source)) {
    exitWith(
      `Each input.source must be one of ${Array.from(validSources).join(', ')}`
    );
  }

  return { source, ref };
}

function buildGeneratedTestCoverage(spec, e2eSpecContent) {
  const elements = Array.isArray(spec.elements) ? spec.elements : [];
  const missingTestIds = [];

  for (const element of elements) {
    if (!e2eSpecContent.includes(element.testId)) {
      missingTestIds.push(element.testId);
    }
  }

  if (missingTestIds.length > 0) {
    exitWith(
      `Generated E2E spec is missing testIds from spec: ${missingTestIds.join(', ')}`
    );
  }

  const requiresStyleAssertions = elements.some(
    (element) =>
      element.styles &&
      typeof element.styles === 'object' &&
      Object.keys(element.styles).length > 0
  );
  const requiresLayoutAssertions = elements.some(
    (element) => element.layout && typeof element.layout === 'object'
  );

  if (requiresStyleAssertions && !e2eSpecContent.includes('validateStyles')) {
    exitWith('Generated E2E spec must reference validateStyles');
  }

  if (requiresLayoutAssertions && !e2eSpecContent.includes('validateLayout')) {
    exitWith('Generated E2E spec must reference validateLayout');
  }

  if (!e2eSpecContent.includes('impl-screenshot.png')) {
    exitWith('Generated E2E spec must capture impl-screenshot.png');
  }

  return {
    elementCount: elements.length,
    requiredTestIdCount: elements.length,
    requiresStyleAssertions,
    requiresLayoutAssertions,
    capturesImplementationScreenshot: true,
  };
}

function parseVerificationResult(report) {
  const match = report.match(/^최종 결과:\s*(PASS|FAIL|ERROR|UNVERIFIED)\s*$/m);
  return match ? match[1] : null;
}

function parseVerificationMetadata(report) {
  const completeness = report.match(
    /^-\s*완전성 판정:\s*(complete|incomplete)\s*$/m
  );
  const aiVision = report.match(/^## AI 비전 리뷰 —\s*(PASS|FAIL|SKIP|N\/A)\s*$/m);

  return {
    completeness: completeness ? completeness[1] : null,
    aiVision: aiVision ? aiVision[1] : null,
  };
}

function readState() {
  if (!fs.existsSync(statePath)) {
    exitWith(
      `Harness state not found: ${rel(statePath)}. Run "ui-ralph harness init" first.`
    );
  }

  return normalizeState(readJson(statePath));
}

function dispatch(state, event) {
  const currentInput = getActiveInputOrExit(state);
  const before = createEventSnapshot(state);
  event._fromState = currentInput.fsmState;
  const transition = resolveTransition(currentInput.fsmState, state, event);
  const nextTarget = transition.target
    ? typeof transition.target === 'function'
      ? transition.target(state, event)
      : transition.target
    : null;

  if (nextTarget) {
    currentInput.fsmState = nextTarget;
  }

  for (const action of transition.actions || []) {
    action(state, event);
  }

  appendEventRecord(state, event, before);
}

function resolveTransition(fsmState, state, event) {
  const eventMap = TRANSITIONS[fsmState];
  if (!eventMap) {
    exitWith(`No transitions registered for state ${fsmState}`);
  }

  const candidates = toArray(eventMap[event.type]);
  if (candidates.length === 0) {
    exitWith(`No transition defined for state ${fsmState} on event ${event.type}`);
  }

  for (const candidate of candidates) {
    const guards = candidate.guards || [];
    if (guards.every((guard) => guard(state, event))) {
      return candidate;
    }
  }

  exitWith(
    `No transition matched for state ${fsmState} on event ${event.type}`
  );
}

function createInputState(input, index, isActive) {
  return {
    id: `input-${index + 1}`,
    index: index + 1,
    source: input.source,
    ref: input.ref,
    fsmState: isActive ? 'spec.pending' : 'pending',
    resumeState: null,
    repairCount: 0,
    lastVerificationResult: null,
    completedAt: null,
    artifacts: {},
  };
}

function toArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getActiveInputIndex(state) {
  if (!state.activeInputId) {
    return -1;
  }

  return state.inputs.findIndex((input) => input.id === state.activeInputId);
}

function getActiveInput(state) {
  const activeInputIndex = getActiveInputIndex(state);
  if (activeInputIndex === -1) {
    return null;
  }

  return state.inputs[activeInputIndex] || null;
}

function getActiveInputOrExit(state) {
  const currentInput = getActiveInput(state);
  if (!currentInput) {
    exitWith(`Harness has no active input in ${rel(statePath)}`);
  }

  return currentInput;
}

function getCurrentStageLabel(state) {
  const currentInput = getActiveInput(state);
  if (!currentInput) {
    return state.runState === 'completed' ? 'done' : 'idle';
  }

  if (currentInput.fsmState === 'pending' || currentInput.fsmState === 'done') {
    return currentInput.fsmState;
  }

  return currentInput.fsmState.split('.')[0];
}

function canBeginStage(fsmState, stage) {
  const allowedStates = {
    spec: new Set(['spec.pending']),
    gen: new Set(['gen.pending']),
    verify: new Set(['verify.pending']),
  };

  return allowedStates[stage]?.has(fsmState) === true;
}

function canCommitStage(fsmState, stage) {
  const allowedStates = {
    spec: new Set(['spec.generating']),
    gen: new Set(['gen.generating']),
    verify: new Set(['verify.running']),
  };

  return allowedStates[stage]?.has(fsmState) === true;
}

function canGateStage(fsmState, stage) {
  const allowedStates = {
    spec: new Set(['spec.committed']),
    gen: new Set(['gen.committed']),
    verify: new Set(['verify.reported']),
  };

  return allowedStates[stage]?.has(fsmState) === true;
}

function canResumeState(fsmState) {
  return new Set([
    'blocked.awaiting_user',
    'blocked.missing_prerequisite',
    'repair.pending',
    'repair.retry_exhausted',
  ]).has(fsmState);
}

function setActiveInputArtifacts(state, stage, payload) {
  const currentInput = getActiveInputOrExit(state);
  currentInput.artifacts = currentInput.artifacts || {};
  currentInput.artifacts[stage] = payload;
}

function standardBlockTransitions() {
  return {
    BLOCK_AWAITING_USER: blockedTransition('blocked.awaiting_user'),
    BLOCK_MISSING_PREREQUISITE: blockedTransition('blocked.missing_prerequisite'),
  };
}

function blockedTransition(target) {
  return {
    target,
    actions: [
      rememberResumeStateAction,
      setBlockedReasonFromEvent,
      setRunStateAction('blocked'),
    ],
  };
}

function setRunStateAction(runState) {
  return (state) => {
    state.runState = runState;
  };
}

function clearBlockedReasonAction(state) {
  state.blockedReason = null;
}

function setBlockedReasonFromEvent(state, event) {
  state.blockedReason = event.blockedReason || null;
}

function rememberResumeStateAction(state, event) {
  const currentInput = getActiveInputOrExit(state);
  currentInput.resumeState = event.resumeState || event._fromState || null;
}

function clearResumeStateAction(state) {
  const currentInput = getActiveInputOrExit(state);
  currentInput.resumeState = null;
}

function setLastVerificationResultAction(result) {
  return (state) => {
    const currentInput = getActiveInputOrExit(state);
    currentInput.lastVerificationResult = result;
  };
}

function syncLastVerificationResultFromEvent(state, event) {
  if (!Object.prototype.hasOwnProperty.call(event, 'result')) {
    return;
  }

  const currentInput = getActiveInputOrExit(state);
  currentInput.lastVerificationResult = event.result;
}

function applyStageArtifacts(stage) {
  return (state, event) => {
    const payload = event.stageArtifacts?.[stage];
    if (!payload) {
      exitWith(`Missing ${stage} artifact payload for event ${event.type}`);
    }

    setActiveInputArtifacts(state, stage, payload);
  };
}

function applyApprovalArtifactAction(state, event) {
  const currentInput = getActiveInputOrExit(state);
  if (!event.approvalArtifact) {
    exitWith(`Missing approval artifact payload for event ${event.type}`);
  }

  currentInput.artifacts = currentInput.artifacts || {};
  currentInput.artifacts.approval = event.approvalArtifact;
}

function markActiveInputCompletedAction(state) {
  const currentInput = getActiveInputOrExit(state);
  currentInput.completedAt = new Date().toISOString();
}

function incrementRepairCountAction(state) {
  const currentInput = getActiveInputOrExit(state);
  currentInput.repairCount = Number(currentInput.repairCount || 0) + 1;
}

function hasResumeStateGuard(state) {
  const currentInput = getActiveInputOrExit(state);
  return Boolean(currentInput.resumeState);
}

function resumeStateTarget(state) {
  const currentInput = getActiveInputOrExit(state);
  return currentInput.resumeState || 'spec.pending';
}

function hasNextInputGuard(state) {
  const currentInputIndex = getActiveInputIndex(state);
  return currentInputIndex !== -1 && currentInputIndex < state.inputs.length - 1;
}

function activateNextInputAction(state) {
  const currentInputIndex = getActiveInputIndex(state);
  if (currentInputIndex === -1 || currentInputIndex >= state.inputs.length - 1) {
    exitWith('Cannot activate next input: no remaining inputs');
  }

  const nextInput = state.inputs[currentInputIndex + 1];
  nextInput.fsmState = 'spec.pending';
  state.activeInputId = nextInput.id;
}

function completeRunAction(state) {
  state.runState = 'completed';
  state.completedAt = new Date().toISOString();
  state.activeInputId = null;
}

function readStageReceipt(state, stage) {
  const filePath = receiptPathFor(state, stage);
  if (!fs.existsSync(filePath)) {
    exitWith(
      `Missing ${stage} receipt for run ${state.runId}: ${rel(filePath)}. Run "ui-ralph harness commit ${stage}" first.`
    );
  }

  const receipt = readJson(filePath);
  receipt.__path = filePath;
  return receipt;
}

function writeStageReceipt(state, stage, receipt) {
  const filePath = receiptPathFor(state, stage);
  writeJson(filePath, receipt);
  return filePath;
}

function receiptPathFor(state, stage) {
  return path.join(receiptInputDir(state), `${stage}.json`);
}

function receiptInputDir(state) {
  const activeInputIndex = getActiveInputIndex(state);
  if (activeInputIndex === -1) {
    exitWith(`Harness has no active input for receipt path in ${rel(statePath)}`);
  }

  return path.join(
    receiptsRoot,
    state.runId,
    `input-${activeInputIndex + 1}`
  );
}

function eventsLogPathForRun(runId) {
  return path.join(receiptsRoot, runId, eventsFileName);
}

function assertReceiptBase(receipt, state, stage) {
  if (!receipt || receipt.harness !== 'ui-ralph') {
    exitWith(`Invalid ${stage} receipt: missing ui-ralph harness marker`);
  }

  if (receipt.runId !== state.runId) {
    exitWith(
      `${stage} receipt runId mismatch: expected ${state.runId}, got ${receipt.runId || 'missing'}`
    );
  }

  if (receipt.stage !== stage) {
    exitWith(`${stage} receipt stage mismatch: got ${receipt.stage || 'missing'}`);
  }

  if (receipt.currentInputIndex !== getActiveInputIndex(state)) {
    exitWith(
      `${stage} receipt input index mismatch: expected ${getActiveInputIndex(state)}, got ${receipt.currentInputIndex}`
    );
  }
}

function normalizeState(state) {
  if (
    state &&
    state.version === 4 &&
    typeof state.runState === 'string' &&
    Array.isArray(state.inputs) &&
    state.inputs.every((input) => typeof input.fsmState === 'string')
  ) {
    if (typeof state.lastEventId !== 'number') {
      state.lastEventId = 0;
    }
    if (!state.artifacts?.eventsPath && state.runId) {
      state.artifacts = {
        ...state.artifacts,
        eventsPath: rel(eventsLogPathForRun(state.runId)),
      };
    }
    return state;
  }

  return migrateLegacyState(state);
}

function rebuildStateFromEventsFile(eventsFileOption) {
  const filePath = path.resolve(projectRoot, eventsFileOption);
  if (!fs.existsSync(filePath)) {
    exitWith(`Events log not found: ${filePath}`);
  }

  const records = readEventsLog(filePath);
  return rebuildStateFromEvents(records, filePath);
}

function readEventsLog(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) {
    exitWith(`Events log is empty: ${filePath}`);
  }

  return content
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        exitWith(`Invalid JSON in events log at line ${index + 1}: ${filePath}`);
      }
    });
}

function rebuildStateFromEvents(records, filePath) {
  if (!Array.isArray(records) || records.length === 0) {
    exitWith(`No events available to rebuild state: ${filePath}`);
  }

  const first = records[0];
  const last = records[records.length - 1];
  const after = last.after;

  if (!after || !Array.isArray(after.inputs)) {
    exitWith(`Events log cannot rebuild state, missing after snapshot: ${filePath}`);
  }

  return normalizeState({
    harness: 'ui-ralph',
    version: 4,
    runId: last.runId,
    qualityMode: after.qualityMode || first.payload?.qualityMode || null,
    runState: after.runState,
    createdAt: first.at,
    completedAt: after.completedAt || null,
    activeInputId: after.activeInputId || null,
    blockedReason: after.blockedReason || null,
    lastEventId: last.eventId || records.length,
    environment: first.payload?.environment || null,
    inputs: after.inputs.map((input) => ({
      id: input.id,
      index: input.index,
      source: input.source,
      ref: input.ref,
      fsmState: input.fsmState,
      resumeState: input.resumeState || null,
      repairCount: Number(input.repairCount || 0),
      lastVerificationResult: input.lastVerificationResult ?? null,
      completedAt: input.completedAt || null,
      artifacts: {},
    })),
    artifacts: {
      statePath: rel(statePath),
      specPath: rel(specPath),
      e2eSpecPath: rel(e2eSpecPath),
      reportPath: rel(reportPath),
      approvalPath: rel(approvalPath),
      receiptsRoot: rel(receiptsRoot),
      eventsPath: rel(filePath),
    },
  });
}

function migrateLegacyState(state) {
  if (!state || !Array.isArray(state.inputs)) {
    return state;
  }

  const activeInputIndex = Math.min(
    Math.max(Number(state.currentInputIndex || 0), 0),
    Math.max(state.inputs.length - 1, 0)
  );
  const runCompleted = state.currentStage === 'done';

  const inputs = state.inputs.map((input, index) => ({
    id: input.id || `input-${index + 1}`,
    index: input.index || index + 1,
    source: input.source,
    ref: input.ref,
    fsmState: deriveLegacyFsmState(state, input, index, activeInputIndex),
    resumeState: input.resumeState || null,
    repairCount: Number(input.repairCount || 0),
    lastVerificationResult:
      input.lastVerificationResult ||
      input.artifacts?.verify?.result ||
      (index === activeInputIndex ? state.stages?.verify?.result || null : null),
    completedAt:
      input.completedAt ||
      (input.status === 'done' || index < activeInputIndex || runCompleted
        ? state.stages?.verify?.completedAt || null
        : null),
    artifacts: input.artifacts || {},
  }));

  return {
    harness: state.harness || 'ui-ralph',
    version: 4,
    runId: state.runId,
    qualityMode: state.qualityMode,
    runState: runCompleted ? 'completed' : 'running',
    createdAt: state.createdAt,
    completedAt: runCompleted ? state.stages?.verify?.completedAt || null : null,
    activeInputId: runCompleted ? null : inputs[activeInputIndex]?.id || null,
    blockedReason: null,
    lastEventId: 0,
    environment: state.environment || captureEnvironment(),
    inputs,
    artifacts: state.artifacts || {
      statePath: rel(statePath),
      specPath: rel(specPath),
      e2eSpecPath: rel(e2eSpecPath),
      reportPath: rel(reportPath),
      approvalPath: rel(approvalPath),
      receiptsRoot: rel(receiptsRoot),
      eventsPath: rel(eventsLogPathForRun(state.runId)),
    },
  };
}

function deriveLegacyFsmState(state, input, inputIndex, activeInputIndex) {
  if (input.fsmState) {
    switch (input.fsmState) {
      case 'spec.generating':
        return 'spec.pending';
      case 'spec.stamped':
        return 'spec.committed';
      case 'gen.generating':
        return 'gen.pending';
      case 'gen.stamped':
        return 'gen.committed';
      case 'verify.running':
        return 'verify.pending';
      case 'pending':
        return inputIndex === activeInputIndex ? 'spec.pending' : 'pending';
      default:
        return input.fsmState;
    }
  }

  if (input.status === 'done' || inputIndex < activeInputIndex) {
    return 'done';
  }

  if (inputIndex > activeInputIndex || input.status === 'pending') {
    return 'pending';
  }

  switch (state.currentStage) {
    case 'spec':
      return state.stages?.spec?.status === 'stamped'
        ? 'spec.committed'
        : 'spec.pending';
    case 'gen':
      return state.stages?.gen?.status === 'stamped'
        ? 'gen.committed'
        : 'gen.pending';
    case 'verify':
      return state.stages?.verify?.status === 'stamped' ||
        state.stages?.verify?.result
        ? 'verify.reported'
        : 'verify.pending';
    case 'done':
      return 'done';
    default:
      return 'spec.pending';
  }
}

function recordSystemEvent(state, event) {
  appendEventRecord(state, event, null);
}

function appendEventRecord(state, event, before) {
  state.lastEventId += 1;
  const record = {
    eventId: state.lastEventId,
    at: new Date().toISOString(),
    type: event.type,
    runId: state.runId,
    activeInputId: state.activeInputId,
    payload: sanitizeEventPayload(event),
    before,
    after: createEventSnapshot(state),
  };

  const filePath = eventsLogPathForRun(state.runId);
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function sanitizeEventPayload(event) {
  const payload = {};

  for (const [key, value] of Object.entries(event)) {
    if (key === 'type' || key.startsWith('_')) {
      continue;
    }
    payload[key] = value;
  }

  return payload;
}

function createEventSnapshot(state) {
  return {
    qualityMode: state.qualityMode,
    runState: state.runState,
    activeInputId: state.activeInputId,
    blockedReason: state.blockedReason || null,
    lastEventId: state.lastEventId,
    completedAt: state.completedAt || null,
    inputs: state.inputs.map((input) => ({
      id: input.id,
      index: input.index,
      source: input.source,
      ref: input.ref,
      fsmState: input.fsmState,
      resumeState: input.resumeState || null,
      repairCount: Number(input.repairCount || 0),
      lastVerificationResult: input.lastVerificationResult ?? null,
      completedAt: input.completedAt || null,
      artifactKeys: Object.keys(input.artifacts || {}).sort(),
    })),
  };
}

function assertReceiptFileHash(expectedHash, filePath, label) {
  if (!expectedHash) {
    exitWith(`Missing ${label} hash in receipt`);
  }

  const actualHash = sha256File(filePath);
  if (expectedHash !== actualHash) {
    exitWith(
      `${label} artifact changed after commit: expected ${expectedHash}, got ${actualHash}`
    );
  }
}

function hasDynamicSegment(route) {
  return /\[[^\]]+\]|:[A-Za-z0-9_]+|\{[^}]+\}/.test(String(route || ''));
}

function designScreenshotHash(designScreenshot) {
  if (!designScreenshot || String(designScreenshot).startsWith('inline:')) {
    return null;
  }

  const screenshotPath = path.resolve(projectRoot, designScreenshot);
  if (!fs.existsSync(screenshotPath)) {
    exitWith(`designScreenshot file not found: ${designScreenshot}`);
  }

  return sha256File(screenshotPath);
}

function createRunId() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return `${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
}

function captureEnvironment() {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'unknown';
  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const agentModel =
    process.env.CODEX_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    null;

  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    locale,
    timeZone,
    ci: Boolean(process.env.CI),
    agentModel,
    npmUserAgent: process.env.npm_config_user_agent || null,
  };
}

function sha256File(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
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
