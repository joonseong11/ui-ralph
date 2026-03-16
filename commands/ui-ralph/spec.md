---
description: 디자인 입력(Figma/텍스트/이미지/컴포넌트)에서 .ui-spec.json 추출
---

# /ui-ralph:spec — 디자인 스펙 추출

대화 컨텍스트에서 디자인 입력을 분석하여 `.ui-spec.json`을 생성한다.

## 1. 사전 준비

`.ui-artifacts/` 디렉토리가 없으면 생성한다.

## 2. 진입점 감지

대화 컨텍스트를 분석하여 진입점을 자동 판단한다:

| 감지 조건 | 모드 |
|-----------|------|
| `figma.com` URL이 있음 | figma |
| 이미지가 첨부됨 | screenshot |
| `src/` 경로 + 변경 요청이 있음 | modify |
| 텍스트 설명만 있음 | text |
| 아무것도 없음 | 질문으로 확인 |

감지 결과를 사용자에게 한 줄로 알린다: "Figma 링크를 감지했습니다. 스펙을 추출합니다."

아무것도 감지되지 않으면 질문한다: "어떤 방식으로 UI를 만들까요? (Figma 링크, 텍스트 설명, 이미지 첨부, 기존 컴포넌트 수정)"

## 3. 모드별 처리

### Figma 모드

1. URL에서 fileKey와 nodeId를 파싱한다
   - `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → nodeId의 "-"를 ":"로 변환
   - `figma.com/design/:fileKey/branch/:branchKey/:fileName` → branchKey를 fileKey로 사용
2. Figma MCP `get_design_context` 도구로 디자인 정보를 가져온다
3. Figma MCP `get_screenshot` 도구로 디자인 스크린샷을 캡처한다
4. 스크린샷을 `.ui-artifacts/design-ref.png`로 저장한다
5. 디자인 정보에서 스타일과 레이아웃을 추출하여 elements 배열을 구성한다

**스타일 추출 규칙:**
- 색상: Figma의 fill/stroke를 `rgba(r, g, b, a)` 또는 `rgb(r, g, b)` 형식으로 변환
- 크기: px 단위로 변환
- CSS 속성명은 반드시 kebab-case 사용 (예: `background-color`, `border-radius`, `font-size`)
- `getComputedStyle().getPropertyValue()`에 직접 전달되므로 camelCase를 사용하면 안 된다

### Screenshot 모드

1. 첨부된 이미지를 `.ui-artifacts/design-ref.png`로 복사한다
2. 이미지를 분석하여 색상, 레이아웃, 폰트 크기 등을 추정한다
3. 프로젝트의 `tailwind.config.ts`가 있으면 읽어 디자인 토큰과 매칭한다
4. 추정값으로 elements 배열을 구성한다

### Modify 모드

1. 대상 컴포넌트 파일을 읽는다
2. dev server가 실행 중이면 Playwright로 현재 상태의 스크린샷을 캡처하여 `.ui-artifacts/design-ref.png`로 저장한다. dev server가 없으면 스크린샷 캡처를 건너뛰고 `meta.designScreenshot`을 `null`로 설정한다.
3. 현재 코드에서 스타일 값을 추출한다
4. 변경 요청을 반영하여 elements 배열을 구성한다

### Text 모드

1. 텍스트 설명을 분석하여 컴포넌트 구조를 추정한다
2. 프로젝트의 `tailwind.config.ts`가 있으면 읽어 디자인 토큰을 참조한다
3. 추정값으로 elements 배열을 구성한다
4. `meta.designScreenshot`은 `null`로 설정한다 (AI 비전 검증 스킵)

## 4. 컴포넌트 정보 결정

사용자에게 확인하거나 자동 추정:
- `component.name`: PascalCase 컴포넌트 이름
- `component.targetPath`: `src/...` 경로 (기존 파일이면 해당 경로, 신규면 적절한 위치 제안)
- `component.description`: 한국어 설명

## 5. 검증 설정

- `verification.route`: 컴포넌트가 렌더링되는 페이지의 URL 경로. `targetPath`의 app router 구조에서 추론하되, 확실하지 않으면 사용자에게 질문한다.
- `verification.baseURL`: 기본값 `http://localhost:3000`
- `verification.viewport`: 기본값 `{ "width": 375, "height": 812 }`

## 6. .ui-spec.json 생성

프로젝트 루트에 `.ui-spec.json`을 Write 도구로 생성한다.

**스펙 포맷:**

```json
{
  "meta": {
    "source": "figma | text | screenshot | modify",
    "sourceRef": "입력 소스 참조",
    "designScreenshot": ".ui-artifacts/design-ref.png 또는 null",
    "createdAt": "ISO 8601"
  },
  "component": {
    "name": "PascalCase",
    "targetPath": "src/.../Component.tsx",
    "description": "설명"
  },
  "elements": [
    {
      "id": "camelCase 식별자",
      "testId": "kebab-case data-testid",
      "styles": {
        "background-color": "rgba/rgb 값",
        "border-radius": "px 값",
        "font-size": "px 값"
      },
      "layout": {
        "width": 375,
        "height": 224,
        "tolerance": 2
      }
    }
  ],
  "verification": {
    "viewport": { "width": 375, "height": 812 },
    "baseURL": "http://localhost:3000",
    "route": "/",
    "styleTolerance": 1,
    "layoutTolerance": 2,
    "maxAutoFixAttempts": 3
  }
}
```

**필드 규칙:**
- `styles` 키는 kebab-case CSS 속성명 (예: `background-color`, 절대 `backgroundColor` 아님)
- `styles` 값은 `getComputedStyle()`이 반환하는 형식 (예: `rgb(255, 255, 255)`, `18px`)
- `layout` 필드는 선택적. 지정된 속성만 검증
- `tolerance`는 element 레벨 또는 `verification` 레벨에서 설정. element 레벨이 우선

## 7. 완료

생성된 `.ui-spec.json`의 elements 수와 주요 내용을 사용자에게 요약한다.
