# ui-ralph Maintainer Checklist

`ui-ralph` 자체를 수정할 때 사용하는 절대 회귀 체크리스트다.

이 문서의 목적은 "업데이트는 했지만 파이프라인 보장이 약해졌다"는 종류의 회귀를 막는 것이다.

## 사용 시점

아래 중 하나라도 수정하면 이 체크리스트를 반드시 적용한다.

- `commands/ui-ralph.md`
- `commands/ui-ralph/spec.md`
- `commands/ui-ralph/gen.md`
- `commands/ui-ralph/verify.md`
- `README.md`
- `e2e/`
- `bin/setup.js`
- `package.json`
- `/ui-ralph`의 단계, 게이트, 산출물, 검증 흐름과 관련된 설명이나 구현

## 절대 회귀 케이스

### UIR-001 Stage Order Is Strict

기준:
- `/ui-ralph`는 항상 `spec -> gen -> verify` 순서를 강제해야 한다
- 어떤 이유로도 Stage 2나 Stage 3를 건너뛴 채 완료 처리하면 실패다

확인 포인트:
- `commands/ui-ralph.md`에 단계 순서와 skip 금지 문구가 남아 있는가
- 최종 완료 전에 verify가 필수로 남아 있는가

### UIR-002 Artifact Gates Exist

기준:
- Stage 1 -> 2 전에 `e2e/.ui-spec.json`이 필요하다
- Stage 2 -> 3 전에 `e2e/.ui-artifacts/e2e-spec.ts`가 필요하다
- Done 전에 `e2e/.ui-artifacts/verification-report.md`가 필요하다
- `ui-ralph` 임시 산출물은 `e2e/` 하위에만 있어야 한다

확인 포인트:
- `commands/ui-ralph.md`
- `commands/ui-ralph/gen.md`
- `commands/ui-ralph/verify.md`

### UIR-003 Verify Is Mandatory

기준:
- Stage 3은 선택 사항이 아니다
- Playwright가 없어도 `/ui-ralph:verify`는 실행되어야 한다
- Playwright 부재는 skip이 아니라 ERROR 리포트로 남아야 한다

확인 포인트:
- `commands/ui-ralph.md`
- `commands/ui-ralph/verify.md`
- `README.md`

### UIR-004 Missing Prerequisites Cannot Be Bypassed

기준:
- `e2e/.ui-spec.json` 또는 `e2e/.ui-artifacts/e2e-spec.ts`가 없으면 `/ui-ralph:verify`는 중단해야 한다
- 이 경우 수동 검증을 완료 대안으로 제안하면 실패다
- 누락된 Stage를 다시 실행하도록만 안내해야 한다

확인 포인트:
- `commands/ui-ralph/verify.md`
- `commands/ui-ralph.md`

### UIR-005 Figma Retrieval Fails Closed

기준:
- 큰 Figma는 `get_metadata`로 먼저 구조를 본다
- `[OUTPUT TRUNCATED]` 또는 불완전 응답은 신뢰하면 안 된다
- 불완전 응답으로 `e2e/.ui-spec.json`을 만들면 실패다
- 필요 시 더 작은 하위 node로 재수집해야 한다

확인 포인트:
- `commands/ui-ralph/spec.md`

### UIR-006 Screenshot And Text Inputs Fail Closed On Ambiguity

기준:
- screenshot/text 입력이 모호하면 추측하지 않는다
- 구현에 필요한 디테일이 빠졌으면 사용자 확인을 받아야 한다

확인 포인트:
- `commands/ui-ralph/spec.md`

### UIR-007 Spec Remains Source Of Truth

기준:
- `e2e/.ui-spec.json`은 구현/검증의 source of truth여야 한다
- Figma element는 가능하면 `sourceNodeId`를 남겨 재조회 가능해야 한다
- verify 차이가 spec 불완전성 때문이면 코드보다 spec 재수집이 먼저다

확인 포인트:
- `commands/ui-ralph/spec.md`
- `commands/ui-ralph.md`

### UIR-008 Cross-Document Wording Stays Consistent

기준:
- `README.md`, `commands/ui-ralph.md`, `commands/ui-ralph/verify.md`가 서로 모순되면 실패다
- 한 문서에선 "verify 필수", 다른 문서에선 "optional"이면 실패다

확인 포인트:
- `README.md`
- `commands/ui-ralph.md`
- `commands/ui-ralph/verify.md`

### UIR-009 Artifacts Stay Under e2e

기준:
- 루트에 `.ui-spec.json`, `.ui-progress.json`, `.ui-artifacts/`, `test-results/`를 만들도록 유도하면 실패다
- 산출물 경로 설명과 clean 경로는 모두 `e2e/` 하위로 통일되어야 한다
- `e2e/.ui-ralph-run.json` 같은 하네스 상태도 clean 대상에 포함되어야 한다
- `e2e/.ui-ralph-run.json`이 authoritative state여야 한다
- `e2e/.ui-progress.json`은 남더라도 레거시 mirror 또는 파생 산출물로만 취급해야 한다
- Playwright `outputDir`는 `e2e/test-results`로 향해야 한다

확인 포인트:
- `README.md`
- `commands/ui-ralph.md`
- `commands/ui-ralph/spec.md`
- `commands/ui-ralph/gen.md`
- `commands/ui-ralph/verify.md`
- `commands/ui-ralph/clean.md`
- `e2e/playwright.config.ts`

### UIR-010 Verification Cannot False-Pass

기준:
- `PASS`는 필요한 검증이 모두 실제 실행된 경우에만 허용된다
- Playwright skipped tests, 0건 실행, 누락된 AI 비전 리뷰는 `UNVERIFIED`여야 한다
- Figma/screenshot 입력에서 스크린샷 비교가 실행되지 않았는데 "검증 통과"라고 하면 실패다
- 검증 리포트의 `최종 결과`를 읽지 않고 요약만으로 PASS 처리하면 실패다

확인 포인트:
- `commands/ui-ralph.md`
- `commands/ui-ralph/verify.md`
- `README.md`

### UIR-011 Verification Route Must Be Concrete

기준:
- `verification.route`는 실제로 여는 구체 URL이어야 한다
- `[id]`, `:id`, `{id}` 같은 미해결 동적 세그먼트가 남아 있으면 실패다
- 구체 URL을 모르면 Stage 1에서 사용자 확인을 받아야 한다

확인 포인트:
- `commands/ui-ralph/spec.md`
- `commands/ui-ralph/verify.md`

### UIR-012 Multi-Page Work Cannot Bypass Pipeline

기준:
- 멀티페이지, 복합 플로우, 공유 컴포넌트, 수정 파일 수는 `/ui-ralph` 우회 사유가 아니다
- 규모가 크면 입력을 나누어 순차 처리해야 한다
- "이 태스크는 ui-ralph에 맞지 않는다"며 spec/gen/verify 없이 직접 구현하면 실패다

확인 포인트:
- `commands/ui-ralph.md`

### UIR-013 Visual Source Takes Priority Over Pure Modify

기준:
- Figma URL이나 이미지가 함께 있으면 `modify`보다 `figma`/`screenshot` 모드가 우선이어야 한다
- "디자인 참조 + 기존 코드 수정" 작업에서 pure `modify`로 떨어져 `designScreenshot = null`이 되면 실패다
- 시각적 입력이 있는데도 AI 비전 리뷰가 불가능한 경로로 분기하면 실패다

확인 포인트:
- `commands/ui-ralph/spec.md`

### UIR-014 Inline Visual References Are Valid Inputs

기준:
- Figma/screenshot 입력에서 인라인 이미지가 확보되었는데 `designScreenshot = null`로 버리면 실패다
- 파일 저장이 안 되더라도 현재 턴의 인라인 시각 참조로 AI 비전 리뷰를 수행할 수 있어야 한다
- 인라인 참조가 턴을 넘어 유지되지 않으면 `UNVERIFIED`로 처리해야 한다

확인 포인트:
- `commands/ui-ralph/spec.md`
- `commands/ui-ralph/verify.md`

### UIR-015 Claude And Codex Entry Points Stay Installed

기준:
- installer가 Claude용 `.claude/commands/` 설치를 계속 지원해야 한다
- installer가 Codex용 루트 `AGENTS.md` 관리 블록도 지원해야 한다
- README에 Claude와 Codex 사용 방법이 모두 문서화되어 있어야 한다
- Codex에서는 slash command 복제가 아니라 `AGENTS.md` 트리거 방식임을 명확히 설명해야 한다

확인 포인트:
- `bin/setup.js`
- `README.md`

### UIR-016 Exact And Best-Effort Modes Stay Distinct

기준:
- exact mode와 best-effort mode의 의미가 문서에 분리되어 있어야 한다
- exact mode는 승인된 reference 없이 PASS를 낼 수 없다고 명시해야 한다
- text-only exact는 승인용 기준안 없이는 완료 불가여야 한다

확인 포인트:
- `commands/ui-ralph.md`
- `commands/ui-ralph/spec.md`
- `commands/ui-ralph/verify.md`
- `README.md`

### UIR-017 Harness Enforces Stage Gates

기준:
- 문서가 하네스(`ui-ralph harness ...`) 사용을 요구해야 한다
- Gate Check가 단순 파일 존재 확인이 아니라 하네스 gate 명령을 사용해야 한다
- 각 Stage 시작 시 `ui-ralph harness begin <stage>`, 완료 직후 `ui-ralph harness commit <stage>`로 FSM 상태와 receipt를 남기게 해야 한다
- receipt는 현재 run의 `runId`와 artifact hash를 기록해야 한다
- 이전 run에서 남은 spec/report 파일만으로 gate가 통과되면 실패다
- block/resume/approve가 상태 머신과 연결돼 있어야 한다
- 하네스 스크립트가 `spec -> gen -> verify` 순서를 실제로 집행해야 한다
- verification report가 PASS가 아니면 하네스가 완료를 허용하면 안 된다

확인 포인트:
- `bin/setup.js`
- `scripts/ui-ralph-harness.js`
- `commands/ui-ralph.md`
- `README.md`

### UIR-018 Exact Mode Requires Human Approval

기준:
- exact mode에서는 verification PASS만으로 완료되면 안 된다
- `human-approval.json` 같은 승인 기록이 있어야 하네스가 완료를 허용해야 한다
- Figma/screenshot exact는 AI 비전 PASS와 complete verification이 같이 요구되어야 한다

확인 포인트:
- `scripts/ui-ralph-harness.js`
- `commands/ui-ralph.md`
- `commands/ui-ralph/verify.md`
- `README.md`

## 최소 자기검토 절차

1. 변경한 파일을 다시 읽는다
2. 가능하면 `npm run maintainer:check`를 실행한다
3. 위 18개 케이스를 `PASS | FAIL | UNVERIFIED`로 판정한다
4. 스크립트가 잡지 못하는 의미적 리스크가 없는지 추가로 읽는다
5. `FAIL` 또는 `UNVERIFIED`가 있으면 최종 응답에서 숨기지 않는다

## 권장 점검 명령

```bash
npm run maintainer:check
rg -n "spec → gen → verify|검증\\(Stage 3\\)을 실행하지 않고|verification-report.md" commands/ui-ralph.md README.md
rg -n "Playwright 설치 여부와 관계없이|선택 사항이 아니다|ERROR 리포트" commands/ui-ralph.md commands/ui-ralph/verify.md README.md
rg -n "수동 검증|대체 수단|누락된 Stage" commands/ui-ralph.md commands/ui-ralph/verify.md
rg -n "get_metadata|OUTPUT TRUNCATED|sourceNodeId|모호하면" commands/ui-ralph/spec.md commands/ui-ralph.md
rg -n "e2e/.ui-spec.json|e2e/.ui-artifacts|e2e/.ui-ralph-run.json|e2e/test-results|outputDir: './test-results'" README.md commands/ui-ralph.md commands/ui-ralph/spec.md commands/ui-ralph/gen.md commands/ui-ralph/verify.md commands/ui-ralph/clean.md e2e/playwright.config.ts
rg -n "e2e/.ui-progress.json|legacy|mirror|authoritative state" README.md commands/ui-ralph.md commands/ui-ralph/clean.md
rg -n "UNVERIFIED|0건|skip되었|AI 비전 리뷰 미실행|required check" commands/ui-ralph.md commands/ui-ralph/verify.md README.md
rg -n "verification.route|\\[id\\]|:id|\\{id\\}|구체 URL" commands/ui-ralph/spec.md commands/ui-ralph/verify.md
rg -n "단일 컴포넌트 전용이 아니다|멀티페이지|공유 컴포넌트|우회하지 않는다|입력을 나누어 순차 처리" commands/ui-ralph.md
rg -n "우선순위 규칙|modify보다|figma 모드를 우선|screenshot 모드를 우선|pure `modify`" commands/ui-ralph/spec.md
rg -n "inline:figma-current-turn|inline:user-attachment|인라인 참조|현재 턴 컨텍스트|designScreenshot을 `null`로 두면 안 된다" commands/ui-ralph/spec.md commands/ui-ralph/verify.md
rg -n "\\.claude/commands|AGENTS.md|Codex does not use Claude slash-command installation|ui-ralph uninstall codex|mention[s]? of `ui-ralph`" README.md bin/setup.js
rg -n "qualityMode|referenceType|exact|best-effort|approved-text-reference|text-reference.md" commands/ui-ralph.md commands/ui-ralph/spec.md commands/ui-ralph/verify.md README.md
rg -n "ui-ralph harness|\\.ui-ralph-run.json|begin spec|begin gen|begin verify|commit spec|commit gen|commit verify|block awaiting_user|resume|gate spec|gate gen|gate verify|stateful harness|receipts/" README.md commands/ui-ralph.md commands/ui-ralph/spec.md commands/ui-ralph/gen.md commands/ui-ralph/verify.md scripts/ui-ralph-harness.js bin/setup.js
rg -n "human-approval.json|harness approve|complete verification|AI vision PASS" README.md commands/ui-ralph.md commands/ui-ralph/verify.md scripts/ui-ralph-harness.js
```

## 최종 보고 형식

최종 응답에는 아래 형식으로 자체 점검 결과를 포함한다.

```text
Self-review
- UIR-001: PASS
- UIR-002: PASS
- UIR-003: PASS
- UIR-004: PASS
- UIR-005: PASS
- UIR-006: PASS
- UIR-007: PASS
- UIR-008: PASS
- UIR-009: PASS
- UIR-010: PASS
- UIR-011: PASS
- UIR-012: PASS
- UIR-013: PASS
- UIR-014: PASS
- UIR-015: PASS
- UIR-016: PASS
- UIR-017: PASS
- UIR-018: PASS
```
