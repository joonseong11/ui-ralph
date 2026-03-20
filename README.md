# ui-ralph

AI agent skills that build UI from Figma/screenshot/text and iterate until all tests pass.

[![npm version](https://img.shields.io/npm/v/ui-ralph)](https://www.npmjs.com/package/ui-ralph)
[npm package](https://www.npmjs.com/package/ui-ralph)

## What it does

Ralph takes a design input and automatically:

1. **Extracts specs** from Figma links, screenshots, text descriptions, or existing components
2. **Generates code** with proper Tailwind classes and project conventions
3. **Runs verification** — computed styles, layout bounding box, AI vision comparison
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

## Quality Modes

- `exact`: Figma, screenshot, 또는 승인된 text reference를 기준으로 완전 일치를 목표로 한다
- `best-effort`: 구조와 의도를 우선하는 빠른 구현 모드다

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
    ↓
/ui-ralph:gen   →  Component code + E2E test
    ↓
/ui-ralph:verify →  3-stage verification (mandatory; incomplete coverage becomes UNVERIFIED)
              ① Computed style check
              ② Layout bounding box check
              ③ AI vision comparison
    ↓
  PASS? → Done
  FAIL? → Auto-fix → Re-verify (max 3 attempts)
  UNVERIFIED? → fix route/design source → Re-verify

Full PASS means the required checks actually ran. A skipped screenshot comparison or skipped Playwright coverage is not a PASS.
```

### Artifacts (temporary, auto-cleaned)

| File | Purpose |
|------|---------|
| `e2e/.ui-spec.json` | Design spec — source of truth for verification |
| `e2e/.ui-progress.json` | Pipeline progress checkpoint |
| `e2e/.ui-artifacts/design-ref.png` | Reference screenshot from design |
| `e2e/.ui-artifacts/impl-screenshot.png` | Screenshot of implementation |
| `e2e/.ui-artifacts/verification-report.md` | Detailed verification results |
| `e2e/.ui-artifacts/e2e-spec.ts` | Auto-generated E2E test |
| `e2e/test-results/` | Playwright output directory |

All artifacts are development-time only. Clean up with `/ui-ralph:clean` or:

```bash
rm -f e2e/.ui-spec.json e2e/.ui-progress.json .ui-spec.json .ui-progress.json && rm -rf e2e/.ui-artifacts/ e2e/test-results/ .ui-artifacts/ test-results/
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
