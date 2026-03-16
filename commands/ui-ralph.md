---
description: UI 개발 자동화 — 디자인 입력에서 코드 생성, 검증, 수정까지 전체 파이프라인
---

# /ui-ralph — UI 개발 자동화 오케스트레이터

디자인 입력(Figma, 텍스트, 이미지, 기존 컴포넌트)에서 코드 생성 → 검증 → 자동 수정까지 전체 파이프라인을 실행한다.

## 파이프라인 개요

```
입력 감지 → /ui-ralph:spec → /ui-ralph:gen → Playwright 있음?
                                                  ├─ Yes → /ui-ralph:verify → PASS/FAIL
                                                  │                             ├─ PASS → 완료
                                                  │                             └─ FAIL → 자동 수정 → 재검증 (최대 3회)
                                                  └─ No → 코드 생성 완료 (검증 스킵)
```

## 실행 절차

### Stage 1: 스펙 추출

대화 컨텍스트를 분석하여 진입점을 감지한다:
- Figma URL이 있으면 → figma 모드
- 이미지가 첨부되어 있으면 → screenshot 모드
- src/ 경로 + 변경 요청이 있으면 → modify 모드
- 텍스트 설명만 있으면 → text 모드
- 아무것도 없으면 → 사용자에게 질문

감지된 진입점으로 `/ui-ralph:spec` 스킬의 절차를 따라 `.ui-spec.json`을 생성한다.

### Stage 2: 코드 생성

`.ui-spec.json`이 생성되면 `/ui-ralph:gen` 스킬의 절차를 따라:
1. 컴포넌트 코드를 생성(또는 수정)한다
2. E2E 테스트를 `.ui-artifacts/e2e-spec.ts`에 생성한다
3. Tailwind 클래스 유효성을 검증한다

### Stage 3: 검증 (Playwright 필요)

Bash 도구로 Playwright 설치 여부를 확인한다:

```bash
npx playwright --version 2>/dev/null
```

**Playwright가 설치되어 있으면:** `/ui-ralph:verify` 스킬의 절차를 따라 3단계 검증을 실행한다.

**Playwright가 없으면:** 검증을 스킵하고 다음을 출력한다:
"✓ 코드 생성 완료. Playwright를 설치하면 자동 검증도 가능합니다: npm install -D @playwright/test"

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
