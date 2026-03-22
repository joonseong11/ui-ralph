# ui-ralph

AI agent skills that build UI from Figma/screenshot/text and iterate until all tests pass.

[![npm version](https://img.shields.io/npm/v/ui-ralph)](https://www.npmjs.com/package/ui-ralph)
[npm package](https://www.npmjs.com/package/ui-ralph)

## What it does

Ralph takes a design input and automatically:

1. **Extracts specs** from Figma links, screenshots, text descriptions, or existing components
2. **Generates code** with proper Tailwind classes and project conventions
3. **Runs verification** — computed styles, layout bounding box on root + critical subgroups, AI vision comparison
4. **Auto-fixes failures** — iterates up to 3 times until tests pass
5. **Reports results** — verification report + screenshots for PR

## Install

```bash
npm install -D ui-ralph
```

The postinstall script automatically copies skills to `.claude/commands/` and e2e utilities to `e2e/utils/`.
It also adds a managed `ui-ralph` block to the project root `AGENTS.md` so Codex can trigger the same pipeline.

## Usage

In Claude Code:

```
# Full pipeline — auto-detects input from conversation context
/ui-ralph

# With Figma link
[paste Figma URL] + /ui-ralph

# With screenshot
[paste image] + /ui-ralph

# Individual stages
/ui-ralph:spec    # Extract spec only → e2e/.ui-spec.json
/ui-ralph:gen     # Generate code from spec
/ui-ralph:verify  # Run verification only (always writes verification report)
/ui-ralph:clean   # Remove all artifacts
```

In Codex:

```text
ui-ralph로 진행해줘
ui-ralph:verify 실행해줘
```

Codex does not use Claude slash-command installation. Instead, the installer writes a managed block into the project root `AGENTS.md` so plain-text mentions of `ui-ralph` trigger the same workflow.

## Harness

`ui-ralph` now includes a stateful harness that enforces stage order, commits stage receipts, and blocks completion unless the current run's verification passes.

```bash
ui-ralph harness init --quality exact --source figma --ref "https://figma.com/..."
ui-ralph harness begin spec
ui-ralph harness commit spec
ui-ralph harness gate spec
ui-ralph harness begin gen
ui-ralph harness commit gen
ui-ralph harness gate gen
ui-ralph harness begin verify
ui-ralph harness commit verify
ui-ralph harness approve --by "reviewer-name"
ui-ralph harness gate verify
ui-ralph harness status
```

`ui-ralph harness begin <stage>` enters the stage's working state. `ui-ralph harness commit <stage>` writes a receipt under `e2e/.ui-artifacts/receipts/<runId>/input-N/` with file hashes and environment metadata. The gate only trusts committed artifacts from the current run, so stale spec/report files from an older run cannot slip through.

In exact mode, the example above assumes `e2e/.ui-spec.json` already contains the deterministic verification contract: `verification.authStrategy`, `verification.fixtureRefs`, `verification.externalDeps`, and `verification.browserProfile`.

The authoritative state file is `e2e/.ui-ralph-run.json`. It is now organized around a run-level FSM plus per-input FSM states rather than a single `currentStage` field:

```json
{
  "runState": "running | blocked | completed",
  "activeInputId": "input-1 | null",
  "inputs": [
    {
      "id": "input-1",
      "fsmState": "pending | spec.pending | spec.generating | spec.committed | gen.pending | gen.generating | gen.committed | verify.pending | verify.running | verify.reported | verify.awaiting_approval | blocked.awaiting_user | blocked.missing_prerequisite | repair.pending | repair.retry_exhausted | done",
      "lastVerificationResult": "PASS | FAIL | ERROR | UNVERIFIED | null"
    }
  ]
}
```

In exact mode, `ui-ralph harness gate verify` will refuse to complete unless the verification report is `PASS`, verification completeness is `complete`, AI vision is `PASS` for visual references, and a human approval file exists.

## Replay Harness

`ui-ralph` includes a replay harness for regression checking of the FSM contract.

```bash
npm run harness:replay
```

It replays at least 3 golden cases twice each, compares normalized terminal outcomes, and also verifies that `status --events-file ...` can rebuild state from `events.ndjson` without `e2e/.ui-ralph-run.json`.

## Quality Modes

- `exact`: Figma, screenshot, 또는 승인된 text reference를 기준으로 완전 일치를 목표로 한다
- `best-effort`: 구조와 의도를 우선하는 빠른 구현 모드다

Exact is also auto-promoted when the user provides multiple Figma links or frames the task as a parity audit/fix, for example "피그마와 다르다", "비교해봐", or "이전 구현이 엉망".

Exact mode should not pass on color/button-only coverage. Scene specs are expected to carry placement/alignment context, and verification should cover at least 3 categories across placement, alignment, typography, and assets before a PASS candidate is considered.

Text-only exact work is not allowed to finish directly. It must first create and get approval for a reference artifact.

## Requirements

- [Claude Code](https://claude.ai/claude-code) CLI
- [Codex CLI](https://openai.com/codex/) or Codex desktop app
- Node.js >= 18
- A running dev server (`npm run dev`) for verification

### Optional

- Figma MCP server — for Figma link mode
- Playwright (`npm install -D @playwright/test`) — for e2e verification

## How it works

```
Input (Figma / text / image / component)
    ↓
/ui-ralph:spec  →  e2e/.ui-spec.json (design tokens, styles, layout)
                + verification route/data strategy + exact/best-effort reference contract
    ↓
/ui-ralph:gen   →  Component code + E2E test
    ↓
/ui-ralph:verify →  3-stage verification (mandatory; incomplete coverage becomes UNVERIFIED)
              ① Computed style check
              ② Placement/alignment + layout bounding box check
              ③ AI vision comparison + component crop review
    ↓
  PASS? → Done
  FAIL? → Auto-fix → Re-verify (max 3 attempts)
  UNVERIFIED? → fix route/design source → Re-verify
```

Full PASS means the required checks actually ran. A skipped screenshot comparison or skipped Playwright coverage is not a PASS.

When the visual issue is about full-bleed margins, centered copy blocks, or icon/text subgroup alignment, `e2e/.ui-spec.json` should not stop at the scene root. Split those containers into separate elements, record `parentContext`, `placement`, `alignment`, and set `sceneRequirements` so exact mode cannot pass on color/button-only coverage.

### Artifacts (temporary, auto-cleaned)

| File | Purpose |
|------|---------|
| `e2e/.ui-spec.json` | Design spec — source of truth for verification |
| `e2e/.ui-progress.json` | Legacy progress mirror for older integrations; `e2e/.ui-ralph-run.json` is the only authoritative state |
| `e2e/.ui-ralph-run.json` | Harness state for the current run |
| `e2e/.ui-artifacts/design-ref.png` | Reference screenshot from design |
| `e2e/.ui-artifacts/impl-screenshot.png` | Screenshot of implementation |
| `e2e/.ui-artifacts/component-crop.png` | Cropped screenshot of the primary component or subgroup under review |
| `e2e/.ui-artifacts/verification-report.md` | Detailed verification results |
| `e2e/.ui-artifacts/e2e-spec.ts` | Auto-generated E2E test |
| `e2e/.ui-artifacts/receipts/<runId>/input-N/*.json` | Stage receipts with artifact hashes and provenance |
| `e2e/.ui-artifacts/human-approval.json` | Exact-mode human approval record for the current input |
| `e2e/test-results/` | Playwright output directory |

All artifacts are development-time only. Clean up with `/ui-ralph:clean` or:

```bash
rm -f e2e/.ui-spec.json e2e/.ui-progress.json e2e/.ui-ralph-run.json .ui-spec.json .ui-progress.json && rm -rf e2e/.ui-artifacts/ e2e/test-results/ .ui-artifacts/ test-results/
```

## Uninstall

```bash
npx ui-ralph uninstall
npm uninstall ui-ralph
```

To remove only one integration:

```bash
ui-ralph uninstall claude
ui-ralph uninstall codex
```

## License

MIT
