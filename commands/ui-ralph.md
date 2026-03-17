---
description: UI 개발 자동화 — 디자인 입력에서 코드 생성, 검증, 수정까지 전체 파이프라인
---

# /ui-ralph — UI 개발 자동화 오케스트레이터

디자인 입력(Figma, 텍스트, 이미지, 기존 컴포넌트)에서 코드 생성 → 검증 → 자동 수정까지 전체 파이프라인을 실행한다.

## ⛔ CRITICAL — 절대 스킵 불가

**이 파이프라인은 반드시 Stage 0 → 1 → 2 → 3 순서로 실행한다. 예외 없음.**

- 입력이 많아도, 컨텍스트가 복잡해도, 사용자가 급해 보여도 — 단계를 건너뛰지 않는다
- `.ui-spec.json`이 파일로 존재하지 않으면 코드를 작성하지 않는다
- `.ui-artifacts/e2e-spec.ts`가 파일로 존재하지 않으면 검증을 실행하지 않는다
- 검증(Stage 3)을 실행하지 않고 "완료"를 선언하지 않는다
- 각 Stage 전환 시 **Gate Check**를 Bash 도구로 반드시 실행한다

**다중 입력 처리:** Figma URL, 이미지, 또는 작업 요청이 여러 개면 **하나씩 순차적으로** 전체 파이프라인(spec → gen → verify)을 완료한 후 다음 입력으로 넘어간다. 절대 한꺼번에 처리하지 않는다.

## 파이프라인 개요

```
환경 점검 → 입력 분리 → [입력 1개마다 아래 반복]
  /ui-ralph:spec → Gate 1→2 → /ui-ralph:gen → Gate 2→3 → /ui-ralph:verify → PASS/FAIL
                                                                                ├─ PASS → 다음 입력 또는 완료
                                                                                └─ FAIL → 자동 수정 → 재검증 (최대 3회)
```

## 진행 상태 추적 (.ui-progress.json)

파이프라인 시작 시 프로젝트 루트에 `.ui-progress.json`을 생성하고, 각 Stage 완료 시 업데이트한다. 이 파일은 단계가 실제로 실행되었는지 증명하는 체크포인트다.

**포맷:**

```json
{
  "pipeline": "ui-ralph",
  "startedAt": "ISO 8601",
  "currentStage": "spec | gen | verify | done",
  "stages": {
    "spec": { "status": "pending", "completedAt": null },
    "gen": { "status": "pending", "completedAt": null },
    "verify": { "status": "pending", "completedAt": null }
  },
  "inputs": [
    { "index": 1, "source": "figma | text | screenshot | modify", "ref": "URL 또는 설명", "status": "pending | in-progress | done" }
  ]
}
```

## 실행 절차

### Stage 0: 환경 점검

파이프라인 시작 전에 필수 도구의 설치 상태를 확인한다.

**1. Figma MCP 확인 (Figma URL이 감지되었을 때만):**

Figma MCP `whoami` 도구를 호출하여 연결 상태를 점검한다.

- 연결 성공 → 계속 진행
- 연결 실패 → 다음을 안내하고 **중단**:
  "⚠ Figma MCP 서버가 연결되어 있지 않습니다.
  Claude Code 설정에서 Figma MCP 서버를 추가해주세요:
  https://modelcontextprotocol.io/integrations/figma"

**2. Playwright 확인:**

Bash 도구로 확인한다:

```bash
npx playwright --version 2>/dev/null
```

- 설치됨 → 계속 진행 (자동 검증 가능)
- 설치 안됨 → 사용자에게 설치를 제안:
  "⚠ Playwright가 설치되어 있지 않습니다. 코드 생성은 가능하지만, 자동 검증을 위해 설치를 권장합니다.
  설치하시겠습니까?"
  - 사용자가 동의하면: `npm install -D @playwright/test && npx playwright install chromium` 실행
  - 거절하면: 검증 없이 계속 진행 (Stage 3 스킵)

**3. `.ui-progress.json` 초기화:**

Write 도구로 `.ui-progress.json`을 생성한다 (위 포맷 참조). `startedAt`을 현재 시각으로, 모든 stage status를 `"pending"`으로 설정한다.

### ⏸ Gate Check 0→1: 입력 분석 및 분리

대화 컨텍스트에서 모든 입력을 식별한다:

- Figma URL 수
- 이미지 첨부 수
- 텍스트 설명 수
- 수정 대상 컴포넌트 수

**다중 입력이 감지되면:**

1. 사용자에게 알린다: "N개의 입력을 감지했습니다. 하나씩 순차적으로 처리합니다."
2. `.ui-progress.json`의 `inputs` 배열에 모든 입력을 기록한다
3. 첫 번째 입력부터 Stage 1 → 2 → 3 전체 파이프라인을 실행한다
4. 하나의 입력이 완전히 완료된 후 다음 입력으로 넘어간다

### Stage 1: 스펙 추출

대화 컨텍스트를 분석하여 진입점을 감지한다:
- Figma URL이 있으면 → figma 모드
- 이미지가 첨부되어 있으면 → screenshot 모드
- src/ 경로 + 변경 요청이 있으면 → modify 모드
- 텍스트 설명만 있으면 → text 모드
- 아무것도 없으면 → 사용자에게 질문

감지된 진입점으로 `/ui-ralph:spec` 스킬의 절차를 따라 `.ui-spec.json`을 생성한다.

**완료 후:** `.ui-progress.json`의 `stages.spec.status`를 `"done"`, `completedAt`을 현재 시각으로 업데이트한다.

### ⏸ Gate Check 1→2 (필수)

**반드시** 다음 명령을 Bash 도구로 실행한다:

```bash
test -f .ui-spec.json && echo "GATE PASS: .ui-spec.json exists" || echo "GATE FAIL: .ui-spec.json not found"
```

- `GATE PASS` → Stage 2로 진행
- `GATE FAIL` → ⛔ **즉시 중단.** Stage 1로 돌아가 `.ui-spec.json`을 생성한다. **`.ui-spec.json` 파일이 디스크에 존재하지 않으면 코드를 한 줄도 작성하지 않는다.**

### Stage 2: 코드 생성

`.ui-spec.json`이 생성되면 `/ui-ralph:gen` 스킬의 절차를 따라:
1. 컴포넌트 코드를 생성(또는 수정)한다
2. E2E 테스트를 `.ui-artifacts/e2e-spec.ts`에 생성한다
3. Tailwind 클래스 유효성을 검증한다

**완료 후:** `.ui-progress.json`의 `stages.gen.status`를 `"done"`, `completedAt`을 현재 시각으로 업데이트한다.

### ⏸ Gate Check 2→3 (필수)

**반드시** 다음 명령을 Bash 도구로 실행한다:

```bash
test -f .ui-spec.json && test -f .ui-artifacts/e2e-spec.ts && echo "GATE PASS: spec and e2e test exist" || echo "GATE FAIL: missing required files"
```

- `GATE PASS` → Stage 3으로 진행
- `GATE FAIL` → ⛔ **즉시 중단.** 누락된 파일의 해당 Stage를 먼저 실행한다.

### Stage 3: 검증 (Playwright 필요)

Bash 도구로 Playwright 설치 여부를 확인한다:

```bash
npx playwright --version 2>/dev/null
```

**Playwright가 설치되어 있으면:** `/ui-ralph:verify` 스킬의 절차를 따라 3단계 검증을 실행한다.

**Playwright가 없으면:** 검증을 스킵하고 다음을 출력한다:
"✓ 코드 생성 완료. Playwright를 설치하면 자동 검증도 가능합니다: npm install -D @playwright/test"

**완료 후:** `.ui-progress.json`의 `stages.verify.status`를 `"done"` (또는 Playwright 미설치 시 `"skipped"`), `currentStage`를 `"done"`으로 업데이트한다.

### 자동 수정 루프 (Playwright가 있을 때만)

검증이 FAIL이면 자동 수정을 시도한다:

1. 검증 리포트에서 실패 항목을 분석한다
2. 실패 원인에 맞는 코드 수정을 적용한다 (targeted edit — /ui-ralph:gen 재실행이 아닌 직접 편집)
   - 스타일 불일치: Tailwind 클래스 수정
   - 레이아웃 불일치: width/height/padding 조정
   - AI 비전 차이: 시각적 차이점 기반 수정
3. `/ui-ralph:verify` 재실행
4. 수정 시도 횟수를 `.ui-spec.json`의 `verification.maxAutoFixAttempts` (기본 3)과 비교

**자동 수정 시 주의사항:**
- Tailwind 클래스 수정 시 반드시 프로젝트의 `tailwind.config.ts`를 확인하여 유효한 클래스만 사용
- 수정 내용을 리포트의 "수정 이력" 섹션에 기록

### 최종 결과

- **PASS:** "✓ UI 개발 완료. /pr로 PR을 생성할 수 있습니다." 출력
- **3회 실패:** 실패 리포트를 출력하고 개발자 개입을 요청한다:
  "✗ 자동 수정 3회 실패. 아래 항목을 수동으로 수정한 후 /ui-ralph:verify로 재검증해주세요."
  실패 항목과 시도한 수정 내역을 출력한다.
- **다중 입력:** 현재 입력의 파이프라인이 완료되면 `.ui-progress.json`의 해당 input status를 `"done"`으로 업데이트하고 다음 입력으로 넘어간다.
