---
description: .ui-spec.json 기반으로 컴포넌트 코드 + E2E 테스트 자동 생성
---

# /ui-gen — 코드 생성

`.ui-spec.json`을 읽고 컴포넌트 코드와 E2E 테스트를 생성한다.

## 전제 조건

프로젝트 루트에 `.ui-spec.json`이 존재해야 한다. 없으면 "/ui-spec을 먼저 실행해주세요."라고 안내한다.

## 1. 스펙 로드

`.ui-spec.json`을 Read 도구로 읽고 파싱한다.

## 2. 컴포넌트 코드 생성

`component.targetPath` 경로에 컴포넌트를 생성(또는 수정)한다.

**필수 규칙:**
- 프로젝트의 CLAUDE.md가 있으면 읽어서 코딩 컨벤션을 따른다
- 각 element의 `testId`를 해당 JSX 요소에 `data-testid` 속성으로 추가
- 날짜/시간 처리는 `dayjs` 사용 (Date 객체 직접 사용 금지)

**Tailwind 클래스 유효성 검증 (중요):**
- 코드 생성 후 사용된 Tailwind 클래스 목록을 추출한다
- 프로젝트의 `tailwind.config.ts` (또는 `tailwind.config.js`)를 Read 도구로 읽어 커스텀 설정을 확인한다
- 존재하지 않는 클래스가 있으면 유효한 클래스로 교체한다
  - 커스텀 색상: config의 `colors` 섹션에 정의된 것만 사용
  - 간격: config의 spacing 설정 확인
- 확신이 없는 클래스는 tailwind config를 직접 읽어서 확인한다

## 3. E2E 테스트 생성

`.ui-artifacts/e2e-spec.ts` 파일을 생성한다.

**테스트 구조:**

```typescript
import { test, expect } from '@playwright/test';
import { validateStyles, validateLayout, formatValidationResult } from '../e2e/utils/visual-validator';

test.describe('{component.name} 스타일/레이아웃 검증', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('{verification.route}');
    // 컴포넌트가 렌더링될 때까지 대기
    await page.waitForSelector('[data-testid="{elements[0].testId}"]', { timeout: 10000 });
  });

  // elements 배열의 각 항목에 대해:
  // styles가 있으면 스타일 검증 테스트 생성
  test('{element.id} 스타일 검증', async ({ page }) => {
    const locator = page.locator('[data-testid="{element.testId}"]');
    const result = await validateStyles(locator, {element.styles}, { tolerance: {verification.styleTolerance} });
    console.log(formatValidationResult('{element.id} 스타일', result));
    expect(result.passed).toBe(true);
  });

  // layout이 있으면 레이아웃 검증 테스트 생성
  test('{element.id} 레이아웃 검증', async ({ page }) => {
    const locator = page.locator('[data-testid="{element.testId}"]');
    const result = await validateLayout(locator, {element.layout}, { tolerance: {element.layout.tolerance ?? verification.layoutTolerance} });
    console.log(formatValidationResult('{element.id} 레이아웃', result));
    expect(result.passed).toBe(true);
  });

  // 스크린샷 캡처 테스트
  test('스크린샷 캡처', async ({ page }) => {
    await page.screenshot({ path: '.ui-artifacts/impl-screenshot.png', fullPage: false });
  });
});
```

**주의사항:**
- import 경로: `.ui-artifacts/`는 프로젝트 루트의 직접 하위이므로 `../e2e/utils/visual-validator`로 한 단계만 올라감
- styles 객체의 키는 반드시 kebab-case (`.ui-spec.json`과 동일)
- `validateStyles`에 `{ tolerance: verification.styleTolerance }` 전달
- `validateLayout`에 `{ tolerance: element.layout.tolerance ?? verification.layoutTolerance }` 전달
- `{...}` 표기는 pseudo-template. 실제 생성 시 `.ui-spec.json` 값으로 치환하여 TypeScript 코드를 작성한다

## 4. 완료

생성/수정된 파일 목록과 테스트 케이스 수를 사용자에게 보고한다.
