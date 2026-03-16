---
description: .ui-spec.json 기준으로 구현 결과를 3단계 검증 (스타일/레이아웃/AI 비전)
---

# /ui-ralph:verify — UI 검증

구현된 컴포넌트를 `.ui-spec.json` 기준으로 3단계 검증한다.

## 전제 조건

- `.ui-spec.json`이 프로젝트 루트에 존재해야 한다
- `.ui-artifacts/e2e-spec.ts`가 존재해야 한다

하나라도 없으면 안내한다:
- .ui-spec.json 없음 → "/ui-ralph:spec을 먼저 실행해주세요."
- e2e-spec.ts 없음 → "/ui-ralph:gen을 먼저 실행해주세요."

**dev server:** `e2e/playwright.config.ts`에 `webServer` 설정이 있으면 Playwright가 자동으로 시작한다. 없으면 사용자에게 dev server 실행을 안내한다.

## 1. Stage 1 + 2: Playwright E2E 테스트 실행

Bash 도구로 Playwright 테스트를 실행한다:

```bash
npx playwright test .ui-artifacts/e2e-spec.ts --config=e2e/playwright.config.ts --reporter=list
```

**참고:** CLI에서 파일 경로를 직접 지정하면 Playwright는 config의 `testDir`을 무시하고 해당 파일을 실행한다. `use` 설정 (baseURL, viewport, deviceScaleFactor 등)은 정상 적용된다.

`e2e/playwright.config.ts`가 없으면 기본 설정으로 실행:

```bash
npx playwright test .ui-artifacts/e2e-spec.ts --reporter=list
```

테스트 결과를 파싱하여:
- 각 테스트의 PASS/FAIL 상태 확인
- FAIL인 테스트의 console.log 출력에서 실패 상세 추출

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

`.ui-artifacts/verification-report.md`를 Write 도구로 생성한다.

**리포트 포맷:**

```markdown
# UI 검증 리포트
생성: {현재 시각} | 컴포넌트: {component.name}

## 스타일 검증 — {PASS/FAIL} ({통과 수}/{전체 수})
| 요소 | 속성 | 스펙 | 실제 | 결과 |
|------|------|------|------|------|
| {element.id} | {property} | {expected} | {actual} | ✓/✗ |

## 레이아웃 검증 — {PASS/FAIL} ({통과 수}/{전체 수})
| 요소 | 속성 | 스펙 | 실제 | 오차 | 결과 |
|------|------|------|------|------|------|
| {element.id} | {property} | {expected} | {actual} | {diff} | ✓/✗ |

## AI 비전 리뷰 — {PASS/FAIL/SKIP}
{차이점이 있으면 목록으로 작성}

## 수정 이력
{/ui-ralph 오케스트레이터에서 호출된 경우에만 기록. 독립 실행 시 이 섹션은 비어있음}

최종 결과: {PASS/FAIL}
```

## 4. 결과 판정 및 출력

- **전체 PASS:** "✓ 검증 통과. 리포트: .ui-artifacts/verification-report.md" 출력
- **FAIL:** 실패 항목을 요약하여 출력. 실패 원인과 수정 방향 제안

**FAIL 출력 예시:**
```
✗ 검증 실패 (2건)
  - overlay.background-color: expected "rgba(0,0,0,0.6)" got "transparent"
    → 수정: bg-black/60 클래스 추가 필요
  - imageArea.height: expected 224px got 200px (오차 24px)
    → 수정: h-224 또는 h-[224px] 적용 필요
```
