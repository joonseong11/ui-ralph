---
description: 디자인 입력(Figma/텍스트/이미지/컴포넌트)에서 e2e/.ui-spec.json 추출
---

# /ui-ralph:spec — 디자인 스펙 추출

대화 컨텍스트에서 디자인 입력을 분석하여 `e2e/.ui-spec.json`을 생성한다.

## 정확도 우선 원칙

- `e2e/.ui-spec.json`은 요약 메모가 아니라 구현과 검증의 source of truth다. 확인된 값만 기록한다
- 사용자가 요청한 디자인과 일치하는 것이 최우선이다. 불완전한 입력이나 모호한 디테일을 추측으로 채우지 않는다
- Figma 모드에서 `get_metadata`는 구조 분해와 node 탐색용으로만 사용한다. 최종 스타일/레이아웃 값은 `get_design_context` 또는 `get_screenshot`에서 확인된 정보로만 확정한다
- Figma MCP 응답이 `[OUTPUT TRUNCATED]`, 과도한 대형 응답 경고, 또는 명백한 불완전 상태라면 해당 node는 신뢰하지 않는다. 더 작은 하위 node를 다시 조회한 뒤에만 spec을 확정한다
- screenshot/text 모드에서 구현에 필요한 정보가 모호하면 질문하고 멈춘다. 확정되지 않은 값으로 `e2e/.ui-spec.json`을 쓰지 않는다
- `ui-ralph` 임시 산출물은 모두 `e2e/` 하위에 둔다. 프로젝트 루트에 `.ui-spec.json`이나 `.ui-artifacts/`를 만들지 않는다

## 1. 사전 준비

`e2e/.ui-artifacts/` 디렉토리가 없으면 생성한다.

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

**우선순위 규칙:**
- Figma URL이 있으면 `modify` 요청이나 `src/` 경로가 함께 있어도 `figma` 모드를 우선한다
- 이미지가 첨부되어 있으면 `modify` 요청이나 `src/` 경로가 함께 있어도 `screenshot` 모드를 우선한다
- `modify` 모드는 시각적 입력(Figma URL, 이미지)이 전혀 없을 때만 선택한다
- 즉, "디자인 참조 + 기존 코드 수정" 작업은 pure `modify`가 아니라 `figma` 또는 `screenshot` 기반 수정으로 처리한다

## 3. 모드별 처리

### Figma 모드

1. URL에서 fileKey와 nodeId를 파싱한다
   - `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → nodeId의 "-"를 ":"로 변환
   - `figma.com/design/:fileKey/branch/:branchKey/:fileName` → branchKey를 fileKey로 사용
2. Figma MCP `get_metadata`로 먼저 상위 구조를 확인한다
3. root node가 작고 응답이 안정적이면 root에 대해 `get_design_context`를 호출한다
4. root node가 크거나 섹션이 많으면, `get_metadata` 결과를 기준으로 header, content, card list, footer 같은 하위 섹션 node로 분해한 뒤 `get_design_context`를 **순차적으로** 호출한다
5. Figma MCP `get_screenshot` 도구로 root 디자인 스크린샷을 캡처한다. 파일 저장이 가능하면 `e2e/.ui-artifacts/design-ref.png`로 저장하고, MCP가 이미지를 인라인으로만 반환하면 현재 턴 컨텍스트의 시각적 참조로 유지한다
6. 어떤 `get_design_context` 응답이든 `[OUTPUT TRUNCATED]`, 과도한 대형 응답 경고, 또는 명백한 누락이 보이면 그 응답을 버리고 더 작은 하위 node들로 재조회한다. 불완전한 응답으로는 `e2e/.ui-spec.json`을 쓰지 않는다
7. root 디자인 스크린샷을 확보하지 못하면 Stage 1을 완료하지 않는다. Figma 입력에서 `meta.designScreenshot`은 필수이며, 파일 경로 또는 인라인 참조여야 한다
8. 검증된 디자인 정보에서 스타일과 레이아웃을 추출하여 elements 배열을 구성한다. `get_metadata`는 분해용으로만 쓰고, 최종 값 확정에는 사용하지 않는다
9. Figma 유래 element에는 가능한 한 `sourceNodeId`를 기록하여 후속 재조회와 검증에 사용한다
10. **에셋 추출** — 디자인에서 이미지/아이콘 요소를 식별하고 파일로 추출한다 (아래 "Figma 에셋 추출" 참조)

**스타일 추출 규칙:**
- 색상: Figma의 fill/stroke를 `rgba(r, g, b, a)` 또는 `rgb(r, g, b)` 형식으로 변환
- 크기: px 단위로 변환
- CSS 속성명은 반드시 kebab-case 사용 (예: `background-color`, `border-radius`, `font-size`)
- `getComputedStyle().getPropertyValue()`에 직접 전달되므로 camelCase를 사용하면 안 된다

### Screenshot 모드

1. 첨부된 이미지를 파일로 저장할 수 있으면 `e2e/.ui-artifacts/design-ref.png`로 복사하고, 그렇지 않으면 현재 턴 컨텍스트의 인라인 참조로 유지한다
2. 이미지를 분석하여 색상, 레이아웃, 폰트 크기 등을 추정한다
3. 프로젝트의 `tailwind.config.ts`가 있으면 읽어 디자인 토큰과 매칭한다
4. 원본 이미지를 확보하지 못하면 Stage 1을 완료하지 않는다. screenshot 입력에서 `meta.designScreenshot`은 필수이며, 파일 경로 또는 인라인 참조여야 한다
5. 이미지 분석만으로 확정할 수 없는 구조, 상태, 간격, 타이포그래피가 있으면 사용자에게 확인한다
6. 확인된 값으로만 elements 배열을 구성한다

### Modify 모드

1. 대상 컴포넌트 파일을 읽는다
2. dev server가 실행 중이면 Playwright로 현재 상태의 스크린샷을 캡처하여 `e2e/.ui-artifacts/design-ref.png`로 저장한다. dev server가 없으면 스크린샷 캡처를 건너뛰고 `meta.designScreenshot`을 `null`로 설정한다.
3. 현재 코드에서 스타일 값을 추출한다
4. 변경 요청을 반영하여 elements 배열을 구성한다

### Text 모드

1. 텍스트 설명을 분석하여 컴포넌트 구조를 추정한다
2. 프로젝트의 `tailwind.config.ts`가 있으면 읽어 디자인 토큰을 참조한다
3. 구현에 필요한 디테일이 모호하면 사용자에게 질문한다
4. 확인된 값으로만 elements 배열을 구성한다
5. `meta.designScreenshot`은 `null`로 설정한다 (AI 비전 검증 스킵)

## 3-1. Figma 에셋 추출 (Figma 모드 전용)

디자인에 포함된 이미지/아이콘 요소를 식별하여 파일로 추출한다.

**에셋 분류 기준:**

| 조건 | 형식 | 예시 |
|------|------|------|
| 벡터 그래픽, 아이콘 크기 (약 48×48 이하) | SVG | 아이콘, 로고 심볼, 화살표 등 |
| 사진, 복잡한 일러스트, 중간 이상 크기 | PNG | 배경 이미지, 히어로 이미지, 썸네일 등 |

**추출 절차:**

1. `get_design_context` 결과에서 이미지/아이콘으로 보이는 자식 노드를 식별한다
2. 각 에셋 노드에 대해:
   - **SVG 추출**: 해당 노드 ID로 `get_design_context`를 호출하여 반환된 코드에서 SVG 마크업을 추출한다. SVG 코드가 있으면 Write 도구로 `.svg` 파일을 저장한다.
   - **PNG 추출**: 해당 노드 ID로 `get_screenshot`을 호출하여 이미지를 캡처한다. Bash 도구를 사용하여 파일로 저장한다.
3. 저장 위치는 프로젝트 구조에 맞게 결정한다:
   - `public/` 디렉토리가 있으면 → `public/images/`, `public/icons/`
   - `src/assets/`가 있으면 → `src/assets/images/`, `src/assets/icons/`
   - 없으면 → `e2e/.ui-artifacts/assets/`에 임시 저장하고 사용자에게 위치를 확인한다
4. 추출된 에셋 정보를 `e2e/.ui-spec.json`의 `assets` 배열에 기록한다

**주의사항:**
- SVG 추출이 불가능한 경우 (벡터 데이터가 없는 경우) PNG로 대체한다
- 에셋이 없는 디자인이면 `assets` 배열을 빈 배열 `[]`로 설정한다

## 4. 컴포넌트 정보 결정

사용자에게 확인하거나 자동 추정:
- `component.name`: PascalCase 컴포넌트 이름
- `component.targetPath`: `src/...` 경로 (기존 파일이면 해당 경로, 신규면 적절한 위치 제안)
- `component.description`: 한국어 설명

## 5. 검증 설정

- `verification.route`: 컴포넌트가 실제로 렌더링되는 **구체 URL 경로**. `targetPath`의 app router 구조에서 추론하되, 확실하지 않으면 사용자에게 질문한다.
- `verification.route`에는 `[id]`, `:id`, `{id}` 같은 미해결 동적 세그먼트를 남기면 안 된다. 이런 값이 남아 있으면 Stage 1을 완료하지 않는다
- 동적 라우트가 필요한데 구체 URL을 모르면 사용자에게 예시 URL을 받아 확정한다
- `verification.baseURL`: 기본값 `http://localhost:3000`
- `verification.viewport`: 기본값 `{ "width": 375, "height": 812 }`

## 6. e2e/.ui-spec.json 생성

`e2e/.ui-spec.json`을 Write 도구로 생성한다.

**스펙 포맷:**

```json
{
  "meta": {
    "source": "figma | text | screenshot | modify",
    "sourceRef": "입력 소스 참조",
    "designScreenshot": "e2e/.ui-artifacts/design-ref.png | inline:figma-current-turn | inline:user-attachment | null",
    "createdAt": "ISO 8601"
  },
  "component": {
    "name": "PascalCase",
    "targetPath": "src/.../Component.tsx",
    "description": "설명"
  },
  "assets": [
    {
      "nodeId": "Figma 노드 ID",
      "name": "파일명 (확장자 제외)",
      "format": "svg | png",
      "targetPath": "public/icons/icon-name.svg",
      "description": "에셋 설명"
    }
  ],
  "elements": [
    {
      "id": "camelCase 식별자",
      "testId": "kebab-case data-testid",
      "sourceNodeId": "Figma 노드 ID 또는 null",
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
- `sourceNodeId`는 Figma 기반 element의 근거 node를 기록한다. verify 단계에서 차이가 날 때 이 값을 기준으로 재조회한다
- `meta.designScreenshot`은 파일 경로일 수도 있고, 현재 턴에서만 유효한 인라인 참조(`inline:*`)일 수도 있다
- Figma/screenshot 입력에서 인라인 이미지가 확보되었는데도 `designScreenshot`을 `null`로 두면 안 된다

## 7. 진행 상태 업데이트

`e2e/.ui-progress.json`이 존재하면 (`/ui-ralph` 오케스트레이터에서 호출된 경우) `stages.spec.status`를 `"done"`, `stages.spec.completedAt`을 현재 시각으로 업데이트한다.

## 8. 완료

생성된 `e2e/.ui-spec.json`의 elements 수와 주요 내용을 사용자에게 요약한다.
