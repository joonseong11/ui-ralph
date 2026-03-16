# ui-ralph

AI agent skills that build UI from Figma/screenshot/text and iterate until all tests pass.

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
/ui-ralph:spec    # Extract spec only → .ui-spec.json
/ui-ralph:gen     # Generate code from spec
/ui-ralph:verify  # Run verification only
```

## Requirements

- [Claude Code](https://claude.ai/claude-code) CLI
- Node.js >= 18
- A running dev server (`npm run dev`) for verification

### Optional

- Figma MCP server — for Figma link mode
- Playwright (`npm install -D @playwright/test`) — for e2e verification

## How it works

```
Input (Figma / text / image / component)
    ↓
/ui-ralph:spec  →  .ui-spec.json (design tokens, styles, layout)
    ↓
/ui-ralph:gen   →  Component code + E2E test
    ↓
/ui-ralph:verify →  3-stage verification
              ① Computed style check
              ② Layout bounding box check
              ③ AI vision comparison
    ↓
  PASS? → Done
  FAIL? → Auto-fix → Re-verify (max 3 attempts)
```

### Artifacts (temporary, auto-cleaned)

| File | Purpose |
|------|---------|
| `.ui-spec.json` | Design spec — source of truth for verification |
| `.ui-artifacts/design-ref.png` | Reference screenshot from design |
| `.ui-artifacts/impl-screenshot.png` | Screenshot of implementation |
| `.ui-artifacts/verification-report.md` | Detailed verification results |
| `.ui-artifacts/e2e-spec.ts` | Auto-generated E2E test |

All artifacts are development-time only. Clean up with:

```bash
rm -f .ui-spec.json && rm -rf .ui-artifacts/
```

## Uninstall

```bash
npx ui-ralph uninstall
npm uninstall ui-ralph
```

## License

MIT
