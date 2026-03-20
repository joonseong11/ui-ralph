---
description: e2e/.ui-spec.json 기준으로 구현 결과를 3단계 검증 (스타일/레이아웃/AI 비전)
---

# /ui-ralph:verify — UI 검증

구현된 컴포넌트를 `e2e/.ui-spec.json` 기준으로 3단계 검증한다.

이 단계는 선택 사항이 아니다. Playwright 설치 여부와 관계없이 반드시 실행하며, 어떤 경우에도 `e2e/.ui-artifacts/verification-report.md`를 남겨야 한다.

## 판정 원칙

- `PASS`: 필요한 검증 차원이 모두 실제로 실행되었고 통과한 경우에만 사용한다
- `FAIL`: 필요한 검증은 실행되었지만 결과가 스펙과 다를 때 사용한다
- `ERROR`: 검증 실행 자체가 실패했을 때 사용한다
- `UNVERIFIED`: 필요한 검증이 skip되었거나, 입력/경로/스크린샷 부족으로 완전한 검증이 불가능할 때 사용한다
- `UNVERIFIED`를 `PASS`처럼 요약하거나 "스크린샷 비교까지 통과"라고 표현하면 안 된다
- `qualityMode = exact`이면 승인된 reference 기준이 실제로 존재해야만 `PASS`를 낼 수 있다

## 전제 조건

**반드시** 다음 명령을 Bash 도구로 실행하여 필수 파일 존재를 확인한다:

```bash
test -f e2e/.ui-spec.json && test -f e2e/.ui-artifacts/e2e-spec.ts && echo "GATE PASS" || echo "GATE FAIL"
```

- `GATE PASS` → 계속 진행
- `GATE FAIL` → ⛔ **중단.** 누락된 파일을 확인하고 안내한다:
  - `e2e/.ui-spec.json` 없음 → "/ui-ralph:spec을 먼저 실행해주세요."
  - `e2e/.ui-artifacts/e2e-spec.ts` 없음 → "/ui-ralph:gen을 먼저 실행해주세요."
  - 이 경우 검증을 우회하거나 수동 검증으로 대체하지 않는다. 누락된 Stage를 먼저 수행한 뒤 `/ui-ralph:verify`를 다시 실행한다

**금지사항:**
- 필수 파일이 없는 상태에서 "구현은 완료되었다"고 판단하지 않는다
- 필수 파일이 없는 상태에서 수동 검증을 완료 대안으로 제안하지 않는다
- `/ui-ralph:verify`는 누락된 선행 산출물을 스스로 추론해서 보완하려고 하지 않는다. 반드시 `/ui-ralph:spec`과 `/ui-ralph:gen`을 먼저 요구한다

**dev server:** `e2e/playwright.config.ts`에 `webServer` 설정이 있으면 Playwright가 자동으로 시작한다. 없으면 사용자에게 dev server 실행을 안내한다.

## 1. Stage 1 + 2: Playwright E2E 테스트 실행

Bash 도구로 Playwright 테스트를 실행한다. **timeout을 300000ms (5분)으로 설정**하여 dev server 시작 시간을 충분히 확보한다:

```bash
npx playwright test e2e/.ui-artifacts/e2e-spec.ts --config=e2e/playwright.config.ts --reporter=list
```

**참고:** CLI에서 파일 경로를 직접 지정하면 Playwright는 config의 `testDir`을 무시하고 해당 파일을 실행한다. `use` 설정 (baseURL, viewport, deviceScaleFactor 등)은 정상 적용된다.

`e2e/playwright.config.ts`가 없으면 기본 설정으로 실행:

```bash
npx playwright test e2e/.ui-artifacts/e2e-spec.ts --reporter=list
```

**⚠ 중요 — 실패/에러 시에도 반드시 계속 진행:**
- Playwright 실행이 에러(exit code ≠ 0)로 끝나도 **중단하지 않는다**
- 에러 출력을 캡처하여 리포트에 포함한다
- 타임아웃, 컴파일 에러, 네트워크 에러 등 어떤 실패든 리포트에 기록하고 Stage 3으로 넘어간다
- Playwright가 설치되어 있지 않은 경우도 동일하게 ERROR로 취급한다. `/ui-ralph:verify` 자체를 스킵하지 않는다

테스트 결과를 파싱하여:
- 각 테스트의 PASS/FAIL 상태 확인
- 각 테스트의 SKIP 상태 확인
- FAIL인 테스트의 console.log 출력에서 실패 상세 추출
- 실행 자체가 실패한 경우: 에러 메시지를 그대로 리포트에 기록
- 스타일/레이아웃 검증이 실제로 몇 건 실행되었는지 집계한다
- style/layout 검증이 0건이거나 required test가 skip되면 최종 결과는 `UNVERIFIED`다

## 2. Stage 3: AI 비전 리뷰

`e2e/.ui-spec.json`의 `meta.designScreenshot`을 확인한다.

**designScreenshot이 파일 경로인 경우:**
1. `e2e/.ui-artifacts/impl-screenshot.png` (Stage 1에서 캡처됨)을 Read 도구로 읽는다
2. `meta.designScreenshot`이 가리키는 파일을 Read 도구로 읽는다
3. 두 이미지를 비교하여 시각적 차이점을 분석한다
4. 차이점을 목록으로 작성한다
5. 둘 중 하나라도 파일이 없으면 최종 결과는 `UNVERIFIED`다

**designScreenshot이 `inline:*` 참조인 경우:**
1. 현재 턴 컨텍스트에 남아 있는 디자인 이미지를 시각적 참조로 사용한다
2. `e2e/.ui-artifacts/impl-screenshot.png`를 Read 도구로 읽는다
3. 같은 턴에서 두 이미지를 비교하여 시각적 차이점을 분석한다
4. 인라인 참조가 현재 턴에 없거나 구현 스크린샷이 없으면 최종 결과는 `UNVERIFIED`다

**designScreenshot이 null인 경우:**
- `meta.source`가 `figma` 또는 `screenshot`이면 최종 결과는 `UNVERIFIED`다
- `meta.source`가 `text` 또는 `modify`이면 AI 비전 리뷰를 `N/A`로 기록한다
- 어떤 경우에도 "AI 비전 통과"라고 쓰지 않는다

## 3. 검증 리포트 생성

**⚠ 이 단계는 어떤 상황에서든 반드시 실행한다.** Playwright 테스트가 성공하든, 실패하든, 에러가 발생하든 리포트를 생성해야 한다.

`e2e/.ui-artifacts/verification-report.md`를 Write 도구로 생성한다.

**리포트 포맷:**

```markdown
# UI 검증 리포트
생성: {현재 시각} | 컴포넌트: {component.name}

## 실행 환경
- Playwright: {버전 또는 "N/A"}
- Dev server: {실행 상태}
- 테스트 파일: e2e/.ui-artifacts/e2e-spec.ts

## 스타일 검증 — {PASS/FAIL/ERROR} ({통과 수}/{전체 수})
| 요소 | 속성 | 스펙 | 실제 | 결과 |
|------|------|------|------|------|
| {element.id} | {property} | {expected} | {actual} | ✓/✗ |

## 레이아웃 검증 — {PASS/FAIL/ERROR} ({통과 수}/{전체 수})
| 요소 | 속성 | 스펙 | 실제 | 오차 | 결과 |
|------|------|------|------|------|------|
| {element.id} | {property} | {expected} | {actual} | {diff} | ✓/✗ |

## AI 비전 리뷰 — {PASS/FAIL/SKIP/N/A}
{차이점이 있으면 목록으로 작성}

## 검증 완전성
- Style/Layout 실행 건수: {실행 수}
- Playwright skipped tests: {건수}
- AI 비전 필요 여부: {required | optional | n/a}
- 완전성 판정: {complete | incomplete}

## 에러 로그
{Playwright 실행 중 에러가 발생했으면 에러 메시지를 여기에 기록. 정상 실행이면 "없음"}

## 수정 이력
{/ui-ralph 오케스트레이터에서 호출된 경우에만 기록. 독립 실행 시 이 섹션은 비어있음}

최종 결과: {PASS/FAIL/ERROR/UNVERIFIED}
```

**ERROR 상태:** Playwright 실행 자체가 실패한 경우 (타임아웃, 컴파일 에러 등). 각 검증 섹션을 "ERROR"로 표시하고 에러 로그에 상세 내용을 기록한다.

**UNVERIFIED 상태:**
- Playwright tests가 skip되었거나 스타일/레이아웃 검증이 0건 실행된 경우
- `verification.route`가 실제로 렌더 가능한 구체 URL이 아니었던 경우
- `meta.source`가 `figma` 또는 `screenshot`인데 `designScreenshot`이 없어서 AI 비전 리뷰를 수행하지 못한 경우
- AI 비전 리뷰가 required인데 `e2e/.ui-artifacts/design-ref.png` 또는 `e2e/.ui-artifacts/impl-screenshot.png`가 없었던 경우
- AI 비전 리뷰가 required인데 `designScreenshot`이 인라인 참조였으나 현재 턴 컨텍스트에 더 이상 남아 있지 않았던 경우
- `meta.qualityMode = exact`인데 `referenceType`이 `none`이거나 text-only 승인 reference가 없는 경우
- 위 조건 중 하나라도 있으면 "검증 통과"라고 표현하지 않는다

## 4. 결과 판정 및 출력

**리포트 파일 경로를 반드시 사용자에게 알린다.**

- **전체 PASS:** 모든 required check가 실행되어 통과했을 때만 "✓ 검증 통과. 리포트: e2e/.ui-artifacts/verification-report.md" 출력
- **FAIL:** 실패 항목을 요약하여 출력. 실패 원인과 수정 방향 제안
- **ERROR:** 실행 에러를 요약하고 해결 방법을 제안
- **UNVERIFIED:** 누락된 검증 조건을 요약하고 "△ 검증 불충분. 리포트: e2e/.ui-artifacts/verification-report.md" 출력
- `qualityMode = best-effort`이면 PASS는 best-effort 범위 통과를 뜻하며 exact parity 보장을 의미하지 않는다

**진행 상태 업데이트:** `e2e/.ui-progress.json`이 존재하면 (`/ui-ralph` 오케스트레이터에서 호출된 경우) `stages.verify.status`를 `"done"`, `stages.verify.completedAt`을 현재 시각으로 업데이트한다.

**FAIL 출력 예시:**
```
✗ 검증 실패 (2건). 리포트: e2e/.ui-artifacts/verification-report.md
  - overlay.background-color: expected "rgba(0,0,0,0.6)" got "transparent"
    → 수정: bg-black/60 클래스 추가 필요
  - imageArea.height: expected 224px got 200px (오차 24px)
    → 수정: h-224 또는 h-[224px] 적용 필요
```

**ERROR 출력 예시:**
```
✗ 검증 실행 에러. 리포트: e2e/.ui-artifacts/verification-report.md
  - 원인: Playwright 테스트 타임아웃 (dev server 시작 실패)
  - 해결: dev server가 정상 실행되는지 확인 후 /ui-ralph:verify로 재시도
```

**UNVERIFIED 출력 예시:**
```
△ 검증 불충분. 리포트: e2e/.ui-artifacts/verification-report.md
  - AI 비전 리뷰 미실행: figma 입력인데 designScreenshot이 없음
  - Playwright skipped tests: 2건
  - 해결: 구체 verification.route와 designScreenshot을 확보한 뒤 /ui-ralph:verify 재실행
```
