#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

if ! command -v rg >/dev/null 2>&1; then
  echo "UNVERIFIED: rg is required for maintainer checks"
  exit 2
fi

pass_count=0
fail_count=0

check_has() {
  pattern=$1
  shift
  rg -n --fixed-strings "$pattern" "$@" >/dev/null 2>&1
}

check_regex() {
  pattern=$1
  shift
  rg -n "$pattern" "$@" >/dev/null 2>&1
}

report() {
  case_id=$1
  status=$2
  message=$3

  echo "$case_id: $status - $message"

  if [ "$status" = "PASS" ]; then
    pass_count=$((pass_count + 1))
  else
    fail_count=$((fail_count + 1))
  fi
}

run_case() {
  case_id=$1
  shift
  if "$@"; then
    report "$case_id" "PASS" "check passed"
  else
    report "$case_id" "FAIL" "check failed"
  fi
}

case_uir_001() {
  check_has "spec → gen → verify" commands/ui-ralph.md &&
    check_has "검증(Stage 3)을 실행하지 않고" commands/ui-ralph.md &&
    check_has "### Stage 3: 검증 (필수)" commands/ui-ralph.md
}

case_uir_002() {
  check_has "e2e/.ui-spec.json exists" commands/ui-ralph.md &&
    check_has "e2e/.ui-artifacts/e2e-spec.ts" commands/ui-ralph.md commands/ui-ralph/verify.md &&
    check_has "verification report exists" commands/ui-ralph.md &&
    check_has "e2e/.ui-spec.json" commands/ui-ralph/gen.md &&
    check_has "e2e/" commands/ui-ralph.md
}

case_uir_003() {
  check_has 'Playwright 설치 여부와 관계없이 **반드시** `/ui-ralph:verify` 스킬의 절차를 실행한다.' commands/ui-ralph.md &&
    check_has "이 단계는 선택 사항이 아니다." commands/ui-ralph/verify.md &&
    check_has "mandatory; incomplete coverage becomes UNVERIFIED" README.md
}

case_uir_004() {
  check_has "수동 검증은 자동 검증의 대체 수단이 아니다." commands/ui-ralph.md &&
    check_has "수동 검증을 완료 대안으로 제안하지 않는다" commands/ui-ralph/verify.md &&
    check_has '"/ui-ralph:spec을 먼저 실행해주세요."' commands/ui-ralph/verify.md &&
    check_has '"/ui-ralph:gen을 먼저 실행해주세요."' commands/ui-ralph/verify.md
}

case_uir_005() {
  check_has "get_metadata" commands/ui-ralph/spec.md &&
    check_has "[OUTPUT TRUNCATED]" commands/ui-ralph/spec.md &&
    check_has "더 작은 하위 node들로 재조회" commands/ui-ralph/spec.md
}

case_uir_006() {
  check_has "이미지 분석만으로 확정할 수 없는" commands/ui-ralph/spec.md &&
    check_has "구현에 필요한 디테일이 모호하면 사용자에게 질문한다" commands/ui-ralph/spec.md &&
    check_has "screenshot/text 모드에서 구현에 필요한 정보가 모호하면 질문하고 멈춘다." commands/ui-ralph/spec.md
}

case_uir_007() {
  check_has "source of truth" commands/ui-ralph/spec.md &&
    check_has "sourceNodeId" commands/ui-ralph/spec.md &&
    check_has "실패 원인이 구현 문제인지, \`e2e/.ui-spec.json\`의 불완전/모호성인지 먼저 구분한다" commands/ui-ralph.md
}

case_uir_008() {
  check_has "always writes verification report" README.md &&
    check_has "mandatory; incomplete coverage becomes UNVERIFIED" README.md &&
    check_has "선택 사항이 아니다." commands/ui-ralph/verify.md &&
    ! check_regex "optional, requires Playwright" README.md commands/ui-ralph.md commands/ui-ralph/verify.md
}

case_uir_009() {
  check_has "e2e/.ui-spec.json" README.md commands/ui-ralph.md commands/ui-ralph/spec.md commands/ui-ralph/gen.md commands/ui-ralph/verify.md commands/ui-ralph/clean.md &&
    check_has "e2e/.ui-artifacts" README.md commands/ui-ralph.md commands/ui-ralph/spec.md commands/ui-ralph/gen.md commands/ui-ralph/verify.md commands/ui-ralph/clean.md &&
    check_has "e2e/.ui-progress.json" README.md commands/ui-ralph.md commands/ui-ralph/spec.md commands/ui-ralph/gen.md commands/ui-ralph/verify.md commands/ui-ralph/clean.md &&
    check_has "e2e/test-results" README.md commands/ui-ralph/clean.md &&
    check_has "outputDir: './test-results'" e2e/playwright.config.ts
}

case_uir_010() {
  check_has '결과가 `UNVERIFIED`이면 완료로 간주하지 않는다' commands/ui-ralph.md &&
    check_has '`UNVERIFIED`: 필요한 검증이 skip되었거나' commands/ui-ralph/verify.md &&
    check_has 'style/layout 검증이 0건이거나 required test가 skip되면 최종 결과는 `UNVERIFIED`다' commands/ui-ralph/verify.md &&
    check_has "incomplete coverage becomes UNVERIFIED" README.md &&
    check_has '검증 리포트를 읽고 `최종 결과: PASS | FAIL | ERROR | UNVERIFIED`를 반드시 확인한 뒤 최종 결과를 판단한다' commands/ui-ralph.md
}

case_uir_011() {
  check_has '`verification.route`: 컴포넌트가 실제로 렌더링되는 **구체 URL 경로**.' commands/ui-ralph/spec.md &&
    check_has '`verification.route`에는 `[id]`, `:id`, `{id}` 같은 미해결 동적 세그먼트를 남기면 안 된다.' commands/ui-ralph/spec.md &&
    check_has "구체 URL을 모르면 사용자에게 예시 URL을 받아 확정한다" commands/ui-ralph/spec.md
}

case_uir_012() {
  check_has "페이지 수가 많거나, 수정 파일이 많거나, 공유 컴포넌트가 많거나, 멀티페이지 작업이라는 이유로 파이프라인을 우회하지 않는다" commands/ui-ralph.md &&
    check_has '`ui-ralph`는 단일 컴포넌트 전용이 아니다' commands/ui-ralph.md &&
    check_has "규모가 크면 입력을 나누어 순차 처리해야지, spec/gen/verify를 생략하면 안 된다" commands/ui-ralph.md &&
    check_has "멀티페이지라는 이유로 Stage 1을 생략하지 않는다" commands/ui-ralph.md
}

case_uir_013() {
  check_has 'Figma URL이 있으면 `modify` 요청이나 `src/` 경로가 함께 있어도 `figma` 모드를 우선한다' commands/ui-ralph/spec.md &&
    check_has '이미지가 첨부되어 있으면 `modify` 요청이나 `src/` 경로가 함께 있어도 `screenshot` 모드를 우선한다' commands/ui-ralph/spec.md &&
    check_has '`modify` 모드는 시각적 입력(Figma URL, 이미지)이 전혀 없을 때만 선택한다' commands/ui-ralph/spec.md
}

case_uir_014() {
  check_has "inline:figma-current-turn" commands/ui-ralph/spec.md &&
    check_has "inline:user-attachment" commands/ui-ralph/spec.md &&
    check_has 'Figma/screenshot 입력에서 인라인 이미지가 확보되었는데도 `designScreenshot`을 `null`로 두면 안 된다' commands/ui-ralph/spec.md &&
    check_has 'designScreenshot이 `inline:*` 참조인 경우:' commands/ui-ralph/verify.md &&
    check_has "현재 턴 컨텍스트에 더 이상 남아 있지 않았던 경우" commands/ui-ralph/verify.md
}

case_uir_015() {
  check_has ".claude/commands/" bin/setup.js README.md &&
    check_has "AGENTS.md" bin/setup.js README.md &&
    check_has "Codex does not use Claude slash-command installation." README.md bin/setup.js &&
    check_has "ui-ralph uninstall codex" README.md &&
    check_has "managed by ui-ralph" bin/setup.js
}

echo "ui-ralph maintainer checks"

run_case "UIR-001" case_uir_001
run_case "UIR-002" case_uir_002
run_case "UIR-003" case_uir_003
run_case "UIR-004" case_uir_004
run_case "UIR-005" case_uir_005
run_case "UIR-006" case_uir_006
run_case "UIR-007" case_uir_007
run_case "UIR-008" case_uir_008
run_case "UIR-009" case_uir_009
run_case "UIR-010" case_uir_010
run_case "UIR-011" case_uir_011
run_case "UIR-012" case_uir_012
run_case "UIR-013" case_uir_013
run_case "UIR-014" case_uir_014
run_case "UIR-015" case_uir_015

echo "Summary: $pass_count passed, $fail_count failed"

if [ "$fail_count" -ne 0 ]; then
  exit 1
fi
