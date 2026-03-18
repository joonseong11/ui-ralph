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

## 최소 자기검토 절차

1. 변경한 파일을 다시 읽는다
2. 가능하면 `npm run maintainer:check`를 실행한다
3. 위 11개 케이스를 `PASS | FAIL | UNVERIFIED`로 판정한다
4. 스크립트가 잡지 못하는 의미적 리스크가 없는지 추가로 읽는다
5. `FAIL` 또는 `UNVERIFIED`가 있으면 최종 응답에서 숨기지 않는다

## 권장 점검 명령

```bash
npm run maintainer:check
rg -n "spec → gen → verify|검증\\(Stage 3\\)을 실행하지 않고|verification-report.md" commands/ui-ralph.md README.md
rg -n "Playwright 설치 여부와 관계없이|선택 사항이 아니다|ERROR 리포트" commands/ui-ralph.md commands/ui-ralph/verify.md README.md
rg -n "수동 검증|대체 수단|누락된 Stage" commands/ui-ralph.md commands/ui-ralph/verify.md
rg -n "get_metadata|OUTPUT TRUNCATED|sourceNodeId|모호하면" commands/ui-ralph/spec.md commands/ui-ralph.md
rg -n "e2e/.ui-spec.json|e2e/.ui-artifacts|e2e/.ui-progress.json|e2e/test-results|outputDir: './test-results'" README.md commands/ui-ralph.md commands/ui-ralph/spec.md commands/ui-ralph/gen.md commands/ui-ralph/verify.md commands/ui-ralph/clean.md e2e/playwright.config.ts
rg -n "UNVERIFIED|0건|skip되었|AI 비전 리뷰 미실행|required check" commands/ui-ralph.md commands/ui-ralph/verify.md README.md
rg -n "verification.route|\\[id\\]|:id|\\{id\\}|구체 URL" commands/ui-ralph/spec.md commands/ui-ralph/verify.md
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
```
