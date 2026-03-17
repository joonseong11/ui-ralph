---
description: .ui-spec.json 기준으로 구현 결과를 3단계 검증 (스타일/레이아웃/AI 비전)
---

# /ui-ralph:verify — UI 검증

구현된 컴포넌트를 `.ui-spec.json` 기준으로 3단계 검증한다.

## 전제 조건

**반드시** 다음 명령을 Bash 도구로 실행하여 필수 파일 존재를 확인한다:

```bash
test -f .ui-spec.json && test -f .ui-artifacts/e2e-spec.ts && echo "GATE PASS" || echo "GATE FAIL"
```

- `GATE PASS` → 계속 진행
- `GATE FAIL` → ⛔ **중단.** 누락된 파일을 확인하고 안내한다:
  - .ui-spec.json 없음 → "/ui-ralph:spec을 먼저 실행해주세요."
  - e2e-spec.ts 없음 → "/ui-ralph:gen을 먼저 실행해주세요."

**dev server:** `e2e/playwright.config.ts`에 `webServer` 설정이 있으면 Playwright가 자동으로 시작한다. 없으면 사용자에게 dev server 실행을 안내한다.

## 1. Stage 1 + 2: Playwright E2E 테스트 실행

Bash 도구로 Playwright 테스트를 실행한다. **timeout을 300000ms (5분)으로 설정**하여 dev server 시작 시간을 충분히 확보한다:

```bash
npx playwright test .ui-artifacts/e2e-spec.ts --config=e2e/playwright.config.ts --reporter=list
```

**참고:** CLI에서 파일 경로를 직접 지정하면 Playwright는 config의 `testDir`을 무시하고 해당 파일을 실행한다. `use` 설정 (baseURL, viewport, deviceScaleFactor 등)은 정상 적용된다.

`e2e/playwright.config.ts`가 없으면 기본 설정으로 실행:

```bash
npx playwright test .ui-artifacts/e2e-spec.ts --reporter=list
```

**⚠ 중요 — 실패/에러 시에도 반드시 계속 진행:**
- Playwright 실행이 에러(exit code ≠ 0)로 끝나도 **중단하지 않는다**
- 에러 출력을 캡처하여 리포트에 포함한다
- 타임아웃, 컴파일 에러, 네트워크 에러 등 어떤 실패든 리포트에 기록하고 Stage 3으로 넘어간다

테스트 결과를 파싱하여:
- 각 테스트의 PASS/FAIL 상태 확인
- FAIL인 테스트의 console.log 출력에서 실패 상세 추출
- 실행 자체가 실패한 경우: 에러 메시지를 그대로 리포트에 기록

## 2. Stage 3: AI 비전 리뷰

`.ui-spec.json`의 `meta.designScreenshot`을 확인한다.

**designScreenshot이 있는 경우:**
1. `.ui-artifacts/impl-screenshot.png` (Stage 1에서 캡처됨)을 Read 도구로 읽는다
2. `.ui-artifacts/design-ref.png`를 Read 도구로 읽는다
3. 두 이미지를 비교하여 시각적 차이점을 분석한다
4. 차이점을 목록으로 작성한다

**designScreenshot이 null인 경우:**
- Stage 3을 스킵한다
- Stage 1+2 결과만으로 최종 판정

## 3. 검증 리포트 생성

**⚠ 이 단계는 어떤 상황에서든 반드시 실행한다.** Playwright 테스트가 성공하든, 실패하든, 에러가 발생하든 리포트를 생성해야 한다.

`.ui-artifacts/verification-report.md`를 Write 도구로 생성한다.

**리포트 포맷:**

```markdown
# UI 검증 리포트
생성: {현재 시각} | 컴포넌트: {component.name}

## 실행 환경
- Playwright: {버전 또는 "N/A"}
- Dev server: {실행 상태}
- 테스트 파일: .ui-artifacts/e2e-spec.ts

## 스타일 검증 — {PASS/FAIL/ERROR} ({통과 수}/{전체 수})
| 요소 | 속성 | 스펙 | 실제 | 결과 |
|------|------|------|------|------|
| {element.id} | {property} | {expected} | {actual} | ✓/✗ |

## 레이아웃 검증 — {PASS/FAIL/ERROR} ({통과 수}/{전체 수})
| 요소 | 속성 | 스펙 | 실제 | 오차 | 결과 |
|------|------|------|------|------|------|
| {element.id} | {property} | {expected} | {actual} | {diff} | ✓/✗ |

## AI 비전 리뷰 — {PASS/FAIL/SKIP}
{차이점이 있으면 목록으로 작성}

## 에러 로그
{Playwright 실행 중 에러가 발생했으면 에러 메시지를 여기에 기록. 정상 실행이면 "없음"}

## 수정 이력
{/ui-ralph 오케스트레이터에서 호출된 경우에만 기록. 독립 실행 시 이 섹션은 비어있음}

최종 결과: {PASS/FAIL/ERROR}
```

**ERROR 상태:** Playwright 실행 자체가 실패한 경우 (타임아웃, 컴파일 에러 등). 각 검증 섹션을 "ERROR"로 표시하고 에러 로그에 상세 내용을 기록한다.

## 4. 결과 판정 및 출력

**리포트 파일 경로를 반드시 사용자에게 알린다.**

- **전체 PASS:** "✓ 검증 통과. 리포트: .ui-artifacts/verification-report.md" 출력
- **FAIL:** 실패 항목을 요약하여 출력. 실패 원인과 수정 방향 제안
- **ERROR:** 실행 에러를 요약하고 해결 방법을 제안

**진행 상태 업데이트:** `.ui-progress.json`이 존재하면 (`/ui-ralph` 오케스트레이터에서 호출된 경우) `stages.verify.status`를 `"done"`, `stages.verify.completedAt`을 현재 시각으로 업데이트한다.

**FAIL 출력 예시:**
```
✗ 검증 실패 (2건). 리포트: .ui-artifacts/verification-report.md
  - overlay.background-color: expected "rgba(0,0,0,0.6)" got "transparent"
    → 수정: bg-black/60 클래스 추가 필요
  - imageArea.height: expected 224px got 200px (오차 24px)
    → 수정: h-224 또는 h-[224px] 적용 필요
```

**ERROR 출력 예시:**
```
✗ 검증 실행 에러. 리포트: .ui-artifacts/verification-report.md
  - 원인: Playwright 테스트 타임아웃 (dev server 시작 실패)
  - 해결: dev server가 정상 실행되는지 확인 후 /ui-ralph:verify로 재시도
```
