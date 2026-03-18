---
description: UI 개발 자동화 — 디자인 입력에서 코드 생성, 검증, 수정까지 전체 파이프라인
---

# /ui-ralph — UI 개발 자동화 오케스트레이터

디자인 입력(Figma, 텍스트, 이미지, 기존 컴포넌트)에서 코드 생성 → 검증 → 자동 수정까지 전체 파이프라인을 실행한다.

## ⛔ CRITICAL — 절대 스킵 불가

**이 파이프라인은 반드시 Stage 0 → 1 → 2 → 3 순서로 실행한다. 예외 없음.**

- 입력이 많아도, 컨텍스트가 복잡해도, 사용자가 급해 보여도 — 단계를 건너뛰지 않는다
- 페이지 수가 많거나, 수정 파일이 많거나, 공유 컴포넌트가 많거나, 멀티페이지 작업이라는 이유로 파이프라인을 우회하지 않는다
- `/ui-ralph`가 호출된 상태에서 파이프라인에 맞추기 어렵다고 판단되면 직접 구현으로 우회하지 말고, 왜 막히는지 보고한 뒤 Stage 1 기준으로 문제를 해결한다
- `e2e/.ui-spec.json`이 파일로 존재하지 않으면 코드를 작성하지 않는다
- `e2e/.ui-artifacts/e2e-spec.ts`가 파일로 존재하지 않으면 검증을 실행하지 않는다
- 검증(Stage 3)을 실행하지 않고 "완료"를 선언하지 않는다
- `e2e/.ui-artifacts/verification-report.md`가 파일로 존재하지 않으면 파이프라인 완료를 선언하지 않는다
- `/ui-ralph:verify` 결과가 `UNVERIFIED`이면 완료로 간주하지 않는다. 누락된 검증 조건을 먼저 해결해야 한다
- `e2e/` 바깥에 `.ui-spec.json`, `.ui-progress.json`, `.ui-artifacts/`, `test-results/` 같은 임시 산출물을 만들지 않는다
- `/ui-ralph` 파이프라인에서 수동 검증은 자동 검증의 대체 수단이 아니다. 필수 산출물이 없으면 이전 Stage로 되돌아가 다시 실행한다
- 각 Stage 전환 시 **Gate Check**를 Bash 도구로 반드시 실행한다
- 결과물은 사용자가 요청한 디자인 입력(Figma, 스크린샷, 텍스트 설명)과 일치해야 한다. 불완전하거나 모호한 입력을 추측으로 메우지 않는다
- Figma 입력에서 MCP 응답이 과도하게 크거나 `[OUTPUT TRUNCATED]` 등으로 불완전하면 Stage 1을 성공 처리하지 않는다. 더 작은 하위 node로 재수집한 뒤에만 `e2e/.ui-spec.json`을 작성한다
- 스크린샷/텍스트 입력에서 구현에 필요한 디테일이 모호하면 생성 전에 사용자 확인을 받는다. 모호한 상태로 Stage 2로 넘기지 않는다

**다중 입력 처리:** Figma URL, 이미지, 또는 작업 요청이 여러 개면 **하나씩 순차적으로** 전체 파이프라인(spec → gen → verify)을 완료한 후 다음 입력으로 넘어간다. 절대 한꺼번에 처리하지 않는다.

**범위 해석 규칙:**
- `ui-ralph`는 단일 컴포넌트 전용이 아니다
- 멀티페이지, 복합 플로우, 공유 컴포넌트 추출, 기존 파일 수정도 모두 파이프라인 대상이다
- 규모가 크면 입력을 나누어 순차 처리해야지, spec/gen/verify를 생략하면 안 된다

## 파이프라인 개요

```
환경 점검 → 입력 분리 → [입력 1개마다 아래 반복]
  /ui-ralph:spec → Gate 1→2 → /ui-ralph:gen → Gate 2→3 → /ui-ralph:verify → PASS/FAIL
                                                                                ├─ PASS → 다음 입력 또는 완료
                                                                                └─ FAIL → 자동 수정 → 재검증 (최대 3회)
```

## 진행 상태 추적 (e2e/.ui-progress.json)

파이프라인 시작 시 `e2e/.ui-progress.json`을 생성하고, 각 Stage 완료 시 업데이트한다. 이 파일은 단계가 실제로 실행되었는지 증명하는 체크포인트다.

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
  - 거절하면: 설치 없이 계속 진행하되, Stage 3은 반드시 실행한다. `/ui-ralph:verify`가 실행 에러를 리포트로 남긴다

**3. `e2e/.ui-progress.json` 초기화:**

Write 도구로 `e2e/.ui-progress.json`을 생성한다 (위 포맷 참조). `startedAt`을 현재 시각으로, 모든 stage status를 `"pending"`으로 설정한다.

### ⏸ Gate Check 0→1: 입력 분석 및 분리

대화 컨텍스트에서 모든 입력을 식별한다:

- Figma URL 수
- 이미지 첨부 수
- 텍스트 설명 수
- 수정 대상 컴포넌트 수

**다중 입력이 감지되면:**

1. 사용자에게 알린다: "N개의 입력을 감지했습니다. 하나씩 순차적으로 처리합니다."
2. `e2e/.ui-progress.json`의 `inputs` 배열에 모든 입력을 기록한다
3. 첫 번째 입력부터 Stage 1 → 2 → 3 전체 파이프라인을 실행한다
4. 하나의 입력이 완전히 완료된 후 다음 입력으로 넘어간다

### Stage 1: 스펙 추출

대화 컨텍스트를 분석하여 진입점을 감지한다:
- Figma URL이 있으면 → figma 모드
- 이미지가 첨부되어 있으면 → screenshot 모드
- src/ 경로 + 변경 요청이 있으면 → modify 모드
- 텍스트 설명만 있으면 → text 모드
- 아무것도 없으면 → 사용자에게 질문

감지된 진입점으로 `/ui-ralph:spec` 스킬의 절차를 따라 `e2e/.ui-spec.json`을 생성한다.

**완료 후:** `e2e/.ui-progress.json`의 `stages.spec.status`를 `"done"`, `completedAt`을 현재 시각으로 업데이트한다.

**금지사항:**
- Stage 1 없이 "일단 구현부터" 진행하지 않는다
- 멀티페이지라는 이유로 Stage 1을 생략하지 않는다
- 기존 코드 수정 작업이라는 이유로 Stage 1을 생략하지 않는다

### ⏸ Gate Check 1→2 (필수)

**반드시** 다음 명령을 Bash 도구로 실행한다:

```bash
test -f e2e/.ui-spec.json && echo "GATE PASS: e2e/.ui-spec.json exists" || echo "GATE FAIL: e2e/.ui-spec.json not found"
```

- `GATE PASS` → Stage 2로 진행
- `GATE FAIL` → ⛔ **즉시 중단.** Stage 1로 돌아가 `e2e/.ui-spec.json`을 생성한다. **`e2e/.ui-spec.json` 파일이 디스크에 존재하지 않으면 코드를 한 줄도 작성하지 않는다.**

### Stage 2: 코드 생성

`e2e/.ui-spec.json`이 생성되면 `/ui-ralph:gen` 스킬의 절차를 따라:
1. 컴포넌트 코드를 생성(또는 수정)한다
2. E2E 테스트를 `e2e/.ui-artifacts/e2e-spec.ts`에 생성한다
3. Tailwind 클래스 유효성을 검증한다

**완료 후:** `e2e/.ui-progress.json`의 `stages.gen.status`를 `"done"`, `completedAt`을 현재 시각으로 업데이트한다.

### ⏸ Gate Check 2→3 (필수)

**반드시** 다음 명령을 Bash 도구로 실행한다:

```bash
test -f e2e/.ui-spec.json && test -f e2e/.ui-artifacts/e2e-spec.ts && echo "GATE PASS: spec and e2e test exist" || echo "GATE FAIL: missing required files"
```

- `GATE PASS` → Stage 3으로 진행
- `GATE FAIL` → ⛔ **즉시 중단.** 누락된 파일의 해당 Stage를 먼저 실행한다.

### Stage 3: 검증 (필수)

Bash 도구로 Playwright 설치 여부를 확인한다:

```bash
npx playwright --version 2>/dev/null
```

Playwright 설치 여부와 관계없이 **반드시** `/ui-ralph:verify` 스킬의 절차를 실행한다.

- Playwright가 설치되어 있으면: 실제 E2E + AI 비전 검증을 수행한다
- Playwright가 없으면: `/ui-ralph:verify`가 실행 에러를 캡처하고 `e2e/.ui-artifacts/verification-report.md`에 ERROR 리포트를 작성한다
- 어떤 경우에도 Stage 3을 스킵하지 않는다
- 검증이 일부만 실행되었거나 필수 비교가 빠졌으면 `/ui-ralph:verify`는 `UNVERIFIED`를 반환해야 하며, 이를 PASS처럼 취급하지 않는다

**완료 후:** `e2e/.ui-progress.json`의 `stages.verify.status`를 `"done"`, `completedAt`을 현재 시각으로 업데이트한다.

### ⏸ Gate Check 3→Done (필수)

**반드시** 다음 명령을 Bash 도구로 실행한다:

```bash
test -f e2e/.ui-artifacts/verification-report.md && echo "GATE PASS: verification report exists" || echo "GATE FAIL: verification report missing"
```

- `GATE PASS` → 검증 리포트를 읽고 `최종 결과: PASS | FAIL | ERROR | UNVERIFIED`를 반드시 확인한 뒤 최종 결과를 판단한다
- `GATE FAIL` → ⛔ **즉시 중단.** `/ui-ralph:verify`를 다시 실행한다. **검증 리포트 파일이 `e2e/.ui-artifacts/verification-report.md`에 존재하지 않으면 완료를 선언하지 않는다.**

**리포트 판정 규칙:**
- `최종 결과: PASS`일 때만 완료 가능
- `최종 결과: FAIL`이면 자동 수정 루프 또는 수동 수정 단계로 이동
- `최종 결과: ERROR`이면 완료를 보류하고 실행 오류를 해결한다
- `최종 결과: UNVERIFIED`이면 완료를 보류하고 누락된 검증 조건을 먼저 해결한다
- 리포트를 읽지 않고 요약만으로 "검증 통과"라고 말하면 안 된다

### 자동 수정 루프 (Playwright가 있을 때만)

검증이 FAIL이면 자동 수정을 시도한다:

1. 검증 리포트에서 실패 항목을 분석한다
2. 실패 원인이 구현 문제인지, `e2e/.ui-spec.json`의 불완전/모호성인지 먼저 구분한다
   - Figma 기반 spec이 불완전하거나 truncation 가능성이 있으면 Stage 1로 돌아가 영향을 받은 node를 재수집한다
   - screenshot/text 입력이 모호해서 스펙이 확정되지 않으면 사용자에게 확인한다
3. 실패 원인이 구현 문제로 확인되면 코드 수정을 적용한다 (targeted edit — /ui-ralph:gen 재실행이 아닌 직접 편집)
   - 스타일 불일치: Tailwind 클래스 수정
   - 레이아웃 불일치: width/height/padding 조정
   - AI 비전 차이: 시각적 차이점 기반 수정
4. `/ui-ralph:verify` 재실행
5. 수정 시도 횟수를 `e2e/.ui-spec.json`의 `verification.maxAutoFixAttempts` (기본 3)과 비교

**자동 수정 시 주의사항:**
- Tailwind 클래스 수정 시 반드시 프로젝트의 `tailwind.config.ts`를 확인하여 유효한 클래스만 사용
- 수정 내용을 리포트의 "수정 이력" 섹션에 기록

### 검증 불충분 처리

`/ui-ralph:verify` 결과가 `UNVERIFIED`이면 코드 수정보다 먼저 검증 조건을 보완한다:

- `verification.route`가 동적 세그먼트(`[id]`, `:id`, `{id}`)를 포함하거나 실제로 렌더 가능한 구체 URL이 아니면 Stage 1로 돌아가 route를 확정한다
- Figma/screenshot 입력인데 `meta.designScreenshot`이 없으면 Stage 1로 돌아가 디자인 스크린샷을 다시 확보한다
- Playwright 테스트가 skip되었거나 스타일/레이아웃 검증이 0건 실행되면 원인을 해결한 뒤 `/ui-ralph:verify`를 다시 실행한다
- 이 상태를 "검증 통과"나 "스크린샷 비교 통과"라고 표현하지 않는다

### 최종 결과

- **PASS:** "✓ UI 개발 완료. /pr로 PR을 생성할 수 있습니다." 출력
- **UNVERIFIED:** 검증이 불충분한 이유를 출력하고 완료를 보류한다:
  "△ 검증 불충분. 아래 누락 조건을 해결한 후 /ui-ralph:verify를 다시 실행해주세요."
- **3회 실패:** 실패 리포트를 출력하고 개발자 개입을 요청한다:
  "✗ 자동 수정 3회 실패. 아래 항목을 수동으로 수정한 후 /ui-ralph:verify로 재검증해주세요."
  실패 항목과 시도한 수정 내역을 출력한다.
- **다중 입력:** 현재 입력의 파이프라인이 완료되면 `e2e/.ui-progress.json`의 해당 input status를 `"done"`으로 업데이트하고 다음 입력으로 넘어간다.
