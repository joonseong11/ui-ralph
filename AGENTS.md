# AGENTS.md

이 문서는 이 저장소 전체에 적용된다.

## 유지보수 변경 규칙

다음 파일이나 동작을 수정할 때는 단순 편집으로 끝내지 않는다.

- `commands/`
- `README.md`
- `e2e/`
- `bin/`
- `package.json`
- `/ui-ralph`, `/ui-ralph:spec`, `/ui-ralph:gen`, `/ui-ralph:verify`의 동작/문구/게이트/산출물

위 범주에 해당하면 반드시 [MAINTAINER_CHECKLIST.md](/Users/jujeon/dev/2410-handybus/ui-ralph/MAINTAINER_CHECKLIST.md)를 먼저 읽고, 완료 전에 모든 절대 회귀 케이스를 스스로 검토한다. 가능하면 `npm run maintainer:check`를 실행해 PASS/FAIL을 확인한다.

## 완료 보고 규칙

위 범주의 변경을 끝낸 뒤 최종 응답에는 반드시 아래를 포함한다.

- 절대 회귀 케이스별 `PASS | FAIL | UNVERIFIED`
- 검증하지 못한 항목이 있으면 그 이유
- `FAIL` 또는 `UNVERIFIED`가 있으면 "완료" 또는 "안전하다"는 식으로 단정하지 않는다

## 금지사항

- 체크리스트를 읽지 않고 `/ui-ralph` 동작 변경을 완료 처리하지 않는다
- 회귀 케이스를 하나라도 검토하지 않은 채 "문제없다"고 결론내리지 않는다
- 필수 게이트, 필수 산출물, 검증 의무를 약화시키는 변경을 무심코 허용하지 않는다
