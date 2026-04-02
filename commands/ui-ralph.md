---
description: UI 개발 자동화 — 디자인 입력에서 코드 생성, 검증, 수정까지 전체 파이프라인
---

# /ui-ralph — UI 개발 자동화 오케스트레이터

디자인 입력(Figma, 텍스트, 이미지, 기존 컴포넌트)에서 코드 생성 → 검증 → 자동 수정까지 전체 파이프라인을 실행한다.

## ⛔ CRITICAL — 절대 스킵 불가

**이 파이프라인은 반드시 Stage 0 → Plan → 1 → 2 → 3 순서로 실행한다. 예외 없음.**

- 입력이 많아도, 컨텍스트가 복잡해도, 사용자가 급해 보여도 — 단계를 건너뛰지 않는다
- 페이지 수가 많거나, 수정 파일이 많거나, 공유 컴포넌트가 많거나, 멀티페이지 작업이라는 이유로 파이프라인을 우회하지 않는다
- `/ui-ralph`가 호출된 상태에서 파이프라인에 맞추기 어렵다고 판단되면 직접 구현으로 우회하지 말고, 왜 막히는지 보고한 뒤 Stage 1 기준으로 문제를 해결한다
- `e2e/.ui-spec.json`이 파일로 존재하지 않으면 코드를 작성하지 않는다
- `e2e/.ui-artifacts/e2e-spec.ts`가 파일로 존재하지 않으면 검증을 실행하지 않는다
- 검증(Stage 3)을 실행하지 않고 "완료"를 선언하지 않는다
- `e2e/.ui-artifacts/verification-report.md`가 파일로 존재하지 않으면 파이프라인 완료를 선언하지 않는다
- `/ui-ralph:verify` 결과가 `UNVERIFIED`이면 완료로 간주하지 않는다. 누락된 검증 조건을 먼저 해결해야 한다
- `e2e/` 바깥에 `.ui-spec.json`, `.ui-progress.json`(레거시 mirror), `.ui-artifacts/`, `test-results/` 같은 임시 산출물을 만들지 않는다
- `/ui-ralph` 파이프라인에서 수동 검증은 자동 검증의 대체 수단이 아니다. 필수 산출물이 없으면 이전 Stage로 되돌아가 다시 실행한다
- 각 Stage 전환 시 **Gate Check**를 Bash 도구로 반드시 실행한다
- 결과물은 사용자가 요청한 디자인 입력(Figma, 스크린샷, 텍스트 설명)과 일치해야 한다. 불완전하거나 모호한 입력을 추측으로 메우지 않는다
- scene root만 PASS여도 full-bleed outer frame, centered block, 텍스트/아이콘 subgroup 같은 핵심 서브 레이아웃 검증이 없으면 완료로 간주하지 않는다
- 색상 검증과 레이아웃 검증을 혼동하지 않는다. 정렬/폭/중심축 문제는 bounding-box 기준을 별도 요소로 검증해야 한다
- Figma 입력에서 MCP 응답이 과도하게 크거나 `[OUTPUT TRUNCATED]` 등으로 불완전하면 Stage 1을 성공 처리하지 않는다. 더 작은 하위 node로 재수집한 뒤에만 `e2e/.ui-spec.json`을 작성한다
- 스크린샷/텍스트 입력에서 구현에 필요한 디테일이 모호하면 생성 전에 사용자 확인을 받는다. 모호한 상태로 Stage 2로 넘기지 않는다

**다중 입력 처리:** Figma URL, 이미지, 또는 작업 요청이 여러 개면 **하나씩 순차적으로** 전체 파이프라인(spec → gen → verify)을 완료한 후 다음 입력으로 넘어간다. 절대 한꺼번에 처리하지 않는다.

**범위 해석 규칙:**
- `ui-ralph`는 단일 컴포넌트 전용이 아니다
- 멀티페이지, 복합 플로우, 공유 컴포넌트 추출, 기존 파일 수정도 모두 파이프라인 대상이다
- 규모가 크면 입력을 나누어 순차 처리해야지, spec/gen/verify를 생략하면 안 된다

## 품질 모드

- `exact`: "피그마와 똑같이", "디테일까지", "pixel-perfect", "같을 때까지 반복" 같은 요구일 때 사용한다
- `best-effort`: 빠른 시안, 구조 확인, 러프한 구현일 때 사용한다

**exact 자동 승격 규칙:**
- Figma 링크가 여러 개면 기본값을 `best-effort`로 두지 않고 `exact` 후보로 올린다
- 사용자가 "이전 구현이 엉망", "피그마와 다르다", "비교해봐", "맞춰봐", "원본과 다르다" 같이 비교/복구 성격으로 말하면 명시적 pixel-perfect 문구가 없어도 `exact`로 해석한다
- 기존 구현과 reference를 대조해 결함을 줄이려는 태스크는 빠른 시안 생성보다 parity 검증이 목적이므로 `best-effort`로 낮추지 않는다

**exact 모드 규칙:**
- Figma/screenshot/승인된 text reference 같은 기준안이 있어야 한다
- text-only exact 요청은 승인된 기준안 없이는 완료를 선언할 수 없다
- `UNVERIFIED` 상태를 exact 완료처럼 취급하면 안 된다
- deterministic verification contract(`dataStrategy`, `authStrategy`, `fixtureRefs`, `externalDeps`, `browserProfile`)가 없으면 verify로 진행하지 않는다
- `verification.sceneRequirements.minCategories` 이상으로 카테고리 커버리지가 확보돼야 PASS 후보가 된다
- `verification.sceneRequirements.mustCheckPlacement` 또는 `mustCheckAlignment`가 참인데 관련 assertion 수가 0이면 PASS 후보가 아니다

**best-effort 모드 규칙:**
- text-only 요청도 진행할 수 있다
- 결과는 의도 충족 중심이며 exact visual parity를 보장하지 않는다

## 파이프라인 개요

```
환경 점검 → plan → 입력 분리 → [입력 1개마다 아래 반복]
  /ui-ralph:spec → Gate 1→2 → /ui-ralph:gen → Gate 2→3 → /ui-ralph:verify → PASS/FAIL
                                                                                ├─ PASS → 다음 입력 또는 완료
                                                                                └─ FAIL → 자동 수정 → 재검증 (최대 3회)
```

## 실행 하네스

문서 규칙만으로는 충분하지 않다. `/ui-ralph`는 반드시 상태 기반 실행 하네스를 함께 사용한다.

- 상태 파일: `e2e/.ui-ralph-run.json`
- receipt 경로: `e2e/.ui-artifacts/receipts/<runId>/input-N/<spec|gen|verify>.json`
- 명령: `ui-ralph harness init`, `ui-ralph harness status`, `ui-ralph harness begin <spec|gen|verify>`, `ui-ralph harness commit <spec|gen|verify>`, `ui-ralph harness block <awaiting_user|missing_prerequisite|retry_exhausted>`, `ui-ralph harness resume`, `ui-ralph harness approve`, `ui-ralph harness gate <spec|gen|verify>`
- `e2e/.ui-ralph-run.json`만 authoritative state다. 예전 `e2e/.ui-progress.json`이 남아 있어도 gate/status는 그것을 읽지 않는다
- 각 Stage를 실제로 시작할 때 `ui-ralph harness begin <stage>`, 산출물을 만들고 나면 `ui-ralph harness commit <stage>`를 실행해 현재 run의 파일 해시와 환경 메타데이터를 receipt로 남긴다
- Gate Check는 단순 `test -f`보다 이 하네스 결과를 우선한다. receipt가 없거나 hash가 바뀌면 다음 Stage로 진행하지 않는다
- 하네스가 PASS를 내지 않으면 다음 Stage로 진행하지 않는다

## 상태 추적 (authoritative: e2e/.ui-ralph-run.json)

진행 상태의 source of truth는 `e2e/.ui-ralph-run.json` 하나다. 하네스는 `runState`와 각 input의 `fsmState`를 직접 갱신한다.

- `runState`: `running | blocked | completed`
- `activeInputId`: 현재 처리 중인 입력
- `inputs[].fsmState`: 해당 입력의 FSM 상태
- `inputs[].lastVerificationResult`: 가장 최근 verify 결과
- `inputs[].resumeState`: block/resume 시 복귀할 상태
- `inputs[].repairCount`: verify 실패 이후 repair 진입 횟수

`e2e/.ui-progress.json`은 과거 호환용 mirror가 남아 있을 수 있지만, 필요할 때 `e2e/.ui-ralph-run.json`에서 파생 생성되는 부가 산출물일 뿐이다. 하네스 gate/status는 오직 `e2e/.ui-ralph-run.json`만 읽는다.

**포맷:**

```json
{
  "harness": "ui-ralph",
  "version": 3,
  "runId": "20260322T120000Z-abcd1234",
  "runState": "running | blocked | completed",
  "activeInputId": "input-1 | null",
  "inputs": [
    {
      "id": "input-1",
      "index": 1,
      "source": "figma | text | screenshot | modify",
      "ref": "URL 또는 설명",
      "fsmState": "pending | spec.pending | spec.generating | spec.committed | gen.pending | gen.generating | gen.committed | verify.pending | verify.running | verify.reported | verify.awaiting_approval | blocked.awaiting_user | blocked.missing_prerequisite | repair.pending | repair.retry_exhausted | done",
      "resumeState": "spec.generating | gen.generating | verify.pending | null",
      "repairCount": 0,
      "lastVerificationResult": "PASS | FAIL | ERROR | UNVERIFIED | null"
    }
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

**3. authoritative state 초기화:**

별도 progress 파일을 초기화하지 않는다. `ui-ralph harness init`가 `e2e/.ui-ralph-run.json`을 만들고 첫 input을 `spec.pending` 상태로 둔다.

필요하면 오래된 호환용 `e2e/.ui-progress.json`은 `e2e/.ui-ralph-run.json`에서 파생 생성할 수 있지만, 하네스는 그것을 source of truth로 읽지 않는다.

**4. 하네스 초기화:**

반드시 다음 명령으로 실행 하네스를 초기화한다.

```bash
ui-ralph harness init --quality exact|best-effort --source figma|text|screenshot|modify --ref "<입력 참조>"
```

입력이 여러 개면 `--inputs-file`로 JSON 배열 파일을 넘긴다.

### Plan Stage: 설계 방향 제시 및 질의

spec으로 바로 들어가지 않는다. 먼저 요청 프롬프트를 읽고 아래를 사용자에게 짧게 정리한다.

- 요구사항 요약
- 설계상 부족한 지점
- 여러 구현 방법이 가능한 지점
- 추천 구현 방향
- 작업 시작 전에 확인이 필요한 질문

**Plan Stage 규칙:**
- 요구사항이 충분하지 않으면 spec으로 넘어가지 않는다
- 상태/분기/API/라우트/데이터 전략/디자인 기준/기존 재사용 범위가 애매하면 먼저 질문한다
- 선택 가능한 구현 방법이 2개 이상이면 장단점을 짧게 보여주고 사용자 선택을 받는다
- 사용자 응답으로 보완된 내용을 기준으로 다시 plan을 갱신한다
- 필요한 정보가 모두 찰 때까지 이 질의 루프를 반복한다
- 충분히 명확해졌을 때만 Stage 1로 간다

**Plan Stage 출력 형식:**
- `요약:` 이 작업이 무엇인지
- `부족한 점:` 아직 비어 있는 결정 사항
- `구현 옵션:` 있으면 2~3개까지
- `추천:` 지금 가장 적절한 방향
- `질문:` 바로 답해야 하는 항목
- `착수 가능 여부:` `yes | no`

요구사항이 아직 부족하면 다음 명령으로 상태를 남긴다:

```bash
ui-ralph harness block awaiting_user --message "plan stage requires more detail before spec"
```

사용자 응답을 받으면:

```bash
ui-ralph harness resume
```

### ⏸ Gate Check 0→1: 입력 분석 및 분리

대화 컨텍스트에서 모든 입력을 식별한다:

- Figma URL 수
- 이미지 첨부 수
- 텍스트 설명 수
- 수정 대상 컴포넌트 수

**다중 입력이 감지되면:**

1. 사용자에게 알린다: "N개의 입력을 감지했습니다. 하나씩 순차적으로 처리합니다."
2. `ui-ralph harness init --inputs-file ...` 또는 동등한 방식으로 `e2e/.ui-ralph-run.json`의 `inputs` 배열에 모든 입력을 기록한다
3. 첫 번째 입력부터 Stage 1 → 2 → 3 전체 파이프라인을 실행한다
4. 하나의 입력이 완전히 완료된 후 다음 입력으로 넘어간다

**품질 모드 감지:**
- exact visual parity를 요구하면 `qualityMode = exact`
- Figma 링크가 여러 개거나, 사용자가 "이전 구현이 엉망", "피그마와 다르다", "비교해봐", "맞춰봐", "원본과 다르다"라고 말하면 기본값을 `exact`로 올린다
- 그렇지 않으면 `qualityMode = best-effort`

### Stage 1: 스펙 추출

대화 컨텍스트를 분석하여 진입점을 감지한다:
- Figma URL이 있으면 → figma 모드
- 이미지가 첨부되어 있으면 → screenshot 모드
- src/ 경로 + 변경 요청이 있으면 → modify 모드
- 텍스트 설명만 있으면 → text 모드
- 아무것도 없으면 → 사용자에게 질문

감지된 진입점으로 `/ui-ralph:spec` 스킬의 절차를 따라 `e2e/.ui-spec.json`을 생성한다.

- Stage 1에서는 root/background/button만 기록하지 않는다
- flush/full-bleed, center axis, subgroup row 정렬에 영향을 주는 container는 별도 element로 올리고 `x`, `width`, `right`, `centerX` 같은 geometry를 남긴다
- outer placement가 parent context에 의존하면 `placement`, `alignment`, `parentContext`를 같이 기록한다
- scene마다 `verification.sceneRequirements`를 채워 exact minimum coverage를 명시한다
- SVG/PNG parity가 중요한 자산은 `assetParity`로 exact 수준을 적는다
- 기존 카드/리스트 패턴에서 들고 온 `mx-*`, `mt-*`, `w-full` 같은 습관성 클래스보다 reference geometry를 우선한다

**상태 반영:** 이 Stage는 `ui-ralph harness begin spec`로 `spec.generating`에 진입하고, `ui-ralph harness commit spec`가 active input을 `spec.committed`로 바꾼다. `ui-ralph harness gate spec`가 통과되면 같은 input은 `gen.pending`으로 전이된다.

**하네스 실행 순서:** 스펙 추출 전에 먼저 다음 명령을 실행한다.

```bash
ui-ralph harness begin spec
```

`e2e/.ui-spec.json` 작성이 끝나면 반드시 다음 명령을 실행한다.

```bash
ui-ralph harness commit spec
```

입력이 모호하거나 사용자 확인 없이는 진행할 수 없으면 다음 명령으로 멈춤을 상태로 남긴다.

```bash
ui-ralph harness block awaiting_user --message "<왜 사용자 확인이 필요한지>"
```

사용자 응답을 받은 뒤에는 다음으로 재개한다.

```bash
ui-ralph harness resume
```

**금지사항:**
- Stage 1 없이 "일단 구현부터" 진행하지 않는다
- 멀티페이지라는 이유로 Stage 1을 생략하지 않는다
- 기존 코드 수정 작업이라는 이유로 Stage 1을 생략하지 않는다

### ⏸ Gate Check 1→2 (필수)

**반드시** 다음 명령을 Bash 도구로 실행한다:

```bash
ui-ralph harness gate spec
```

- `GATE PASS` → Stage 2로 진행
- `GATE FAIL` → ⛔ **즉시 중단.** Stage 1로 돌아가 `e2e/.ui-spec.json`을 생성한다. **`e2e/.ui-spec.json` 파일이 디스크에 존재하지 않으면 코드를 한 줄도 작성하지 않는다.**

### Stage 2: 코드 생성

`e2e/.ui-spec.json`이 생성되면 `/ui-ralph:gen` 스킬의 절차를 따라:
1. 컴포넌트 코드를 생성(또는 수정)한다
2. E2E 테스트를 `e2e/.ui-artifacts/e2e-spec.ts`에 생성한다
3. Tailwind 클래스 유효성을 검증한다
4. `placement`/`alignment` relation과 component crop screenshot 경로를 포함한다

**상태 반영:** 이 Stage는 `ui-ralph harness begin gen`로 `gen.generating`에 진입하고, `ui-ralph harness commit gen`가 active input을 `gen.committed`로 바꾼다. `ui-ralph harness gate gen`가 통과되면 같은 input은 `verify.pending`으로 전이된다.

**하네스 실행 순서:** 코드 생성을 시작하기 전에 먼저 다음 명령을 실행한다.

```bash
ui-ralph harness begin gen
```

코드와 `e2e/.ui-artifacts/e2e-spec.ts` 생성이 끝나면 반드시 다음 명령을 실행한다.

```bash
ui-ralph harness commit gen
```

### ⏸ Gate Check 2→3 (필수)

**반드시** 다음 명령을 Bash 도구로 실행한다:

```bash
ui-ralph harness gate gen
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
- 레이아웃 required check에는 subgroup bounding-box metric(`x`, `width`, `right`, `centerX` 등)도 포함된다
- exact에서는 `placement`/`alignment` assertion 수, exact 카테고리 수, component crop screenshot, difference ledger까지 확인해야 한다

**상태 반영:** 이 Stage는 `ui-ralph harness begin verify`로 `verify.running`에 진입하고, `ui-ralph harness commit verify`가 active input을 `verify.reported`로 바꾸고 `lastVerificationResult`를 기록한다. exact mode에서 승인 기록이 없으면 input은 `verify.awaiting_approval`로 전이될 수 있다. 검증 FAIL은 `repair.pending`, 재시도 한도 초과는 `repair.retry_exhausted`로 기록할 수 있다.

**하네스 실행 순서:** 검증을 시작하기 전에 먼저 다음 명령을 실행한다.

```bash
ui-ralph harness begin verify
```

`e2e/.ui-artifacts/verification-report.md`를 쓴 직후 반드시 다음 명령을 실행한다.

```bash
ui-ralph harness commit verify
```

### ⏸ Gate Check 3→Done (필수)

**반드시** 다음 명령을 Bash 도구로 실행한다:

```bash
ui-ralph harness gate verify
```

- `GATE PASS` → 검증 리포트를 읽고 `최종 결과: PASS | FAIL | ERROR | UNVERIFIED`를 반드시 확인한 뒤 최종 결과를 판단한다
- `GATE FAIL` → ⛔ **즉시 중단.** `/ui-ralph:verify`를 다시 실행한다. **검증 리포트 파일이 `e2e/.ui-artifacts/verification-report.md`에 존재하지 않으면 완료를 선언하지 않는다.**

**리포트 판정 규칙:**
- `최종 결과: PASS`일 때만 완료 가능
- `최종 결과: FAIL`이면 자동 수정 루프 또는 수동 수정 단계로 이동
- `최종 결과: ERROR`이면 완료를 보류하고 실행 오류를 해결한다
- `최종 결과: UNVERIFIED`이면 완료를 보류하고 누락된 검증 조건을 먼저 해결한다
- 리포트를 읽지 않고 요약만으로 "검증 통과"라고 말하면 안 된다
- `qualityMode = exact`인데 승인된 reference 없이 PASS를 선언하면 안 된다
- `qualityMode = exact`이면 `ui-ralph harness approve --by <name>`로 사람 승인을 기록하기 전에는 완료할 수 없다
- `Difference Ledger`가 없거나 `남은 차이`가 0건이 아니면 PASS로 완료하지 않는다

### 자동 수정 루프 (Playwright가 있을 때만)

검증이 FAIL이면 자동 수정을 시도한다:

1. 검증 리포트에서 실패 항목을 분석한다
2. 실패 원인이 구현 문제인지, `e2e/.ui-spec.json`의 불완전/모호성인지 먼저 구분한다
   - Figma 기반 spec이 불완전하거나 truncation 가능성이 있으면 Stage 1로 돌아가 영향을 받은 node를 재수집한다
   - screenshot/text 입력이 모호해서 스펙이 확정되지 않으면 사용자에게 확인한다
3. 실패 원인이 구현 문제로 확인되면 코드 수정을 적용한다 (targeted edit — /ui-ralph:gen 재실행이 아닌 직접 편집)
   - 스타일 불일치: Tailwind 클래스 수정
   - 레이아웃 불일치: width/height/padding/x-position/center-axis 조정
   - 기존 패턴 재사용으로 생긴 `mx-*`, `mt-*`, `px-*`, `w-full`, `justify-start` 같은 클래스가 기준 geometry를 깨뜨렸는지 먼저 확인
   - AI 비전 차이: 시각적 차이점 기반 수정
4. 하네스는 이 입력을 `repair.pending`으로 기록한다. 수정이 끝났으면 다음 순서로 verify를 다시 수행한다:
   `ui-ralph harness resume` → `ui-ralph harness begin verify` → `ui-ralph harness commit verify` → `ui-ralph harness gate verify`
5. 수정 시도 횟수를 `e2e/.ui-spec.json`의 `verification.maxAutoFixAttempts` (기본 3)과 비교

**자동 수정 시 주의사항:**
- Tailwind 클래스 수정 시 반드시 프로젝트의 `tailwind.config.ts`를 확인하여 유효한 클래스만 사용
- 수정 내용을 리포트의 "수정 이력" 섹션에 기록

### 검증 불충분 처리

`/ui-ralph:verify` 결과가 `UNVERIFIED`이면 코드 수정보다 먼저 검증 조건을 보완한다:

- `verification.route`가 동적 세그먼트(`[id]`, `:id`, `{id}`)를 포함하거나 실제로 렌더 가능한 구체 URL이 아니면 Stage 1로 돌아가 route를 확정한다
- Figma/screenshot 입력인데 `meta.designScreenshot`이 없으면 Stage 1로 돌아가 디자인 스크린샷을 다시 확보한다
- Playwright 테스트가 skip되었거나 스타일/레이아웃 검증이 0건 실행되면 원인을 해결한 뒤 `/ui-ralph:verify`를 다시 실행한다
- exact인데 `placement`/`alignment` assertion 수가 0이거나 exact 카테고리 수가 부족하면 Stage 1 스펙을 다시 수집한다
- 이런 경우는 `blocked.missing_prerequisite` 또는 `blocked.awaiting_user` 상태로 기록하고, 해결 후 `ui-ralph harness resume`로 복귀한다
- 이 상태를 "검증 통과"나 "스크린샷 비교 통과"라고 표현하지 않는다

### 최종 결과

- **PASS:** "✓ UI 개발 완료. /pr로 PR을 생성할 수 있습니다." 출력
- **UNVERIFIED:** 검증이 불충분한 이유를 출력하고 완료를 보류한다:
  "△ 검증 불충분. 아래 누락 조건을 해결한 후 /ui-ralph:verify를 다시 실행해주세요."
- **3회 실패:** 실패 리포트를 출력하고 하네스 상태를 `repair.retry_exhausted`로 남긴 뒤 개발자 개입을 요청한다:
  "✗ 자동 수정 3회 실패. 아래 항목을 수동으로 수정한 후 /ui-ralph:verify로 재검증해주세요."
  실패 항목과 시도한 수정 내역을 출력한다.
- **다중 입력:** 현재 입력의 파이프라인이 완료되면 active input의 `fsmState`는 `done`이 되고, 하네스가 다음 input을 `spec.pending`으로 전이한다. 실제 작업 시작은 `ui-ralph harness begin spec`가 담당한다.
