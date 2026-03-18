---
description: ui-ralph 작업 아티팩트 정리 (e2e/.ui-spec.json, e2e/.ui-artifacts/)
---

# /ui-ralph:clean — 아티팩트 정리

ui-ralph이 생성한 임시 파일을 모두 삭제한다.

## 삭제 대상

- `e2e/.ui-spec.json` — 디자인 스펙
- `e2e/.ui-progress.json` — 파이프라인 진행 상태
- `e2e/.ui-artifacts/` — 스크린샷, 검증 리포트, E2E 테스트
- `e2e/test-results/` — Playwright 출력
- 레거시 루트 산출물: `.ui-spec.json`, `.ui-progress.json`, `.ui-artifacts/`, `test-results/`

## 실행

Bash 도구로 삭제한다:

```bash
rm -f e2e/.ui-spec.json e2e/.ui-progress.json .ui-spec.json .ui-progress.json && rm -rf e2e/.ui-artifacts/ e2e/test-results/ .ui-artifacts/ test-results/
```

삭제 후 결과를 알린다:

- 파일이 있었으면: "✓ ui-ralph 아티팩트를 정리했습니다."
- 파일이 없었으면: "정리할 아티팩트가 없습니다."
