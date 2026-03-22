---
description: e2e/.ui-spec.json 기반으로 컴포넌트 코드 + E2E 테스트 자동 생성
---

# /ui-ralph:gen — 코드 생성

`e2e/.ui-spec.json`을 읽고 컴포넌트 코드와 E2E 테스트를 생성한다.

## 전제 조건

`e2e/.ui-ralph-run.json`이 있는 오케스트레이션 실행이라면, Stage 1 완료 직후 이미 다음 명령이 성공했어야 한다:

```bash
ui-ralph harness gate spec
```

하네스가 있는 경우 이 gate를 우회하지 않는다.

**반드시** 다음 명령을 Bash 도구로 실행하여 `e2e/.ui-spec.json` 존재를 확인한다:

```bash
test -f e2e/.ui-spec.json && echo "GATE PASS" || echo "GATE FAIL"
```

- `GATE PASS` → 계속 진행
- `GATE FAIL` → ⛔ **중단.** "/ui-ralph:spec을 먼저 실행해주세요."라고 안내한다. `e2e/.ui-spec.json` 없이 코드를 생성하지 않는다.

## 1. 스펙 로드

`e2e/.ui-spec.json`을 Read 도구로 읽고 파싱한다.

## 2. 컴포넌트 코드 생성

`component.targetPath` 경로에 컴포넌트를 생성(또는 수정)한다.

**필수 규칙:**
- 프로젝트의 CLAUDE.md가 있으면 읽어서 코딩 컨벤션을 따른다
- 각 element의 `testId`를 해당 JSX 요소에 `data-testid` 속성으로 추가
- root 외에 서브그룹 layout 검증용 element가 spec에 있으면 별도 locator를 유지한다. flush outer frame, centered block, 아이콘/텍스트 row를 루트 하나로 뭉개지 않는다
- Figma에 근거가 없는 `mx-*`, `px-*`, `w-full`, `justify-start` 같은 클래스가 새로 들어가면 경고하고 근거를 다시 확인한다
- "기존 패턴 재사용"보다 `placement`/`alignment`/Figma geometry를 우선한다
- 날짜/시간 처리는 `dayjs` 사용 (Date 객체 직접 사용 금지)

**에셋 참조 (assets 배열이 있을 때):**
- `e2e/.ui-spec.json`의 `assets` 배열에 기록된 에셋 파일을 컴포넌트에서 참조한다
- SVG 파일: React 컴포넌트로 import하거나 `<img src="...">` 또는 인라인 SVG로 사용
- PNG 파일: `<img src="...">` 또는 Next.js `Image` 컴포넌트로 사용
- import 경로는 `assets[].targetPath` 기준으로 결정한다

**Tailwind 클래스 유효성 검증 (중요):**
- 코드 생성 후 사용된 Tailwind 클래스 목록을 추출한다
- 프로젝트의 `tailwind.config.ts` (또는 `tailwind.config.js`)를 Read 도구로 읽어 커스텀 설정을 확인한다
- 존재하지 않는 클래스가 있으면 유효한 클래스로 교체한다
  - 커스텀 색상: config의 `colors` 섹션에 정의된 것만 사용
  - 간격: config의 spacing 설정 확인
- 확신이 없는 클래스는 tailwind config를 직접 읽어서 확인한다

## 3. E2E 테스트 생성

`e2e/.ui-artifacts/e2e-spec.ts` 파일을 생성한다.

**테스트 구조:**

```typescript
import { test, expect } from '@playwright/test';
import {
  validateStyles,
  validateLayout,
  validatePlacement,
  validateAlignment,
  formatValidationResult,
} from '../utils/visual-validator';

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

  // placement가 있으면 outer placement 검증 테스트 생성
  test('{element.id} placement 검증', async ({ page }) => {
    const locator = page.locator('[data-testid="{element.testId}"]');
    // parentContext가 있으면 해당 data-testid locator를 container로 연결한다
    const parentLocator = page.locator('[data-testid="{element.parentContext.testId}"]');
    const result = await validatePlacement(locator, {element.placement}, {
      tolerance: {element.placement.tolerance ?? verification.layoutTolerance},
      container: parentLocator,
    });
    console.log(formatValidationResult('{element.id} placement', result));
    expect(result.passed).toBe(true);
  });

  // alignment가 있으면 관계식 검증 테스트 생성
  test('{element.id} alignment 검증', async ({ page }) => {
    const locator = page.locator('[data-testid="{element.testId}"]');
    const result = await validateAlignment(locator, {
      // alignment spec에 있는 target testId를 locator로 해석한다
      horizontalCenterWithin: page.locator('[data-testid="{element.alignment.horizontalCenterWithin}"]'),
      leftAlignedWithin: page.locator('[data-testid="{element.alignment.leftAlignedWithin}"]'),
      gapTo: {
        target: page.locator('[data-testid="{element.alignment.gapTo.target}"]'),
        axis: '{element.alignment.gapTo.axis}',
        value: {element.alignment.gapTo.value},
      },
    }, {
      tolerance: {element.alignment.tolerance ?? verification.layoutTolerance},
    });
    console.log(formatValidationResult('{element.id} alignment', result));
    expect(result.passed).toBe(true);
  });

  // scene 루트와 핵심 컴포넌트 crop을 함께 남긴다
  test('스크린샷 캡처', async ({ page }) => {
    await page.screenshot({ path: 'e2e/.ui-artifacts/impl-screenshot.png', fullPage: false });
    await page.locator('[data-testid="{elements[0].testId}"]').screenshot({
      path: 'e2e/.ui-artifacts/component-crop.png',
    });
  });
});
```

**주의사항:**
- import 경로: `e2e/.ui-artifacts/`에서 `e2e/utils/`를 참조하므로 `../utils/visual-validator`를 사용한다
- styles 객체의 키는 반드시 kebab-case (`e2e/.ui-spec.json`과 동일)
- `validateStyles`에 `{ tolerance: verification.styleTolerance }` 전달
- `validateLayout`에 `{ tolerance: element.layout.tolerance ?? verification.layoutTolerance }` 전달
- `validatePlacement`는 `placement`와 `parentContext`를 조합해 outer placement를 검증한다
- `validateAlignment`는 `horizontalCenterWithin`, `leftAlignedWithin`, `gapTo` 관계를 직접 assertion으로 만든다
- `parentContext`나 `alignment` target이 없는 항목은 해당 속성만 조건부로 생략한 테스트를 생성한다
- `layout`은 `width`, `height`, `x`, `y`뿐 아니라 `right`, `bottom`, `centerX`, `centerY` 같은 파생 bounding-box metric도 그대로 전달한다
- layout-only subgroup element도 테스트를 생성한다. scene root만 통과시키고 서브 정렬 검사를 생략하지 않는다
- exact에서 `placement`/`alignment`가 spec에 있으면 해당 assertion을 생략하지 않는다. 0건 생성되면 Stage 2를 완료 처리하지 않는다
- `assetParity.mode = exact-svg`인 자산은 단순 색 비교 대신 렌더 결과 스냅샷 비교 경로를 남긴다
- 루트 스크린샷 외에 핵심 컴포넌트 crop (`e2e/.ui-artifacts/component-crop.png`)도 생성한다
- `{...}` 표기는 pseudo-template. 실제 생성 시 `e2e/.ui-spec.json` 값으로 치환하여 TypeScript 코드를 작성한다

## 4. authoritative state 반영

이 Stage 문서는 별도 `e2e/.ui-progress.json`을 직접 갱신하지 않는다. authoritative state 갱신은 `ui-ralph harness begin gen`, `ui-ralph harness commit gen`, `ui-ralph harness gate gen`, `ui-ralph harness block`, `ui-ralph harness resume`가 `e2e/.ui-ralph-run.json`에서 처리한다.

## 5. 하네스 receipt 기록

`e2e/.ui-ralph-run.json`이 존재하면, 먼저 다음 명령으로 Stage를 시작한다:

```bash
ui-ralph harness begin gen
```

코드와 `e2e/.ui-artifacts/e2e-spec.ts` 생성 직후 다음 명령을 실행한다:

```bash
ui-ralph harness commit gen
```

이 receipt는 현재 run의 spec hash, generated E2E spec hash, required `data-testid` 커버리지 여부를 `e2e/.ui-artifacts/receipts/<runId>/input-N/gen.json`에 기록한다. commit 없이 Stage 2를 완료 처리하지 않는다.

## 6. 완료

생성/수정된 파일 목록과 테스트 케이스 수를 사용자에게 보고한다.
