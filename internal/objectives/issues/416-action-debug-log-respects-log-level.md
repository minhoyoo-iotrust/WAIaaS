# #416 — Action Provider 디버그 로그가 log_level 설정을 무시하고 항상 출력

- **유형**: BUG
- **심각도**: MEDIUM
- **영향**: 데몬 콘솔에 Pendle 마켓 전체 응답 등 대량 debug 로그 출력
- **컴포넌트**: `packages/daemon/src/lifecycle/daemon-startup.ts`, `packages/core/src/interfaces/logger.ts`
- **선행 이슈**: #412 (Action Provider 디버그 로깅 추가)

## 현상

Admin Settings `log_level`이 `info`로 설정되어 있는데도 Action Provider의 debug 로그가 콘솔에 출력된다:
```
[actions] GET v1/markets/all → 200 {"response":{"markets":[... 수백 개 마켓 데이터 ...]}}
[actions] DriftSdkWrapper.getClient: initializing {"rpcUrl":"https://api.mainnet-beta.solana.com","subAccount":0}
```

## 원인

1. `daemon-startup.ts`에서 `ConsoleLogger('actions')`를 `log_level` 설정과 무관하게 항상 생성하여 전달
2. `ConsoleLogger`에 로그 레벨 필터링 기능 없음 — `debug()` 호출이 그대로 `console.debug()` 출력

## 수정 방향

1. **daemon-startup.ts**: `log_level` 설정이 `debug`일 때만 logger를 생성하여 전달. 그 외에는 `undefined` (로깅 비활성화)
2. **환경변수 오버라이드**: `WAIAAS_ACTION_DEBUG=true` 환경변수로 `log_level` 설정과 무관하게 debug 강제 활성화 (개발/트러블슈팅용)
3. **hot-reload 대응**: `log_level`이 런타임에 변경되면 Action Provider 재등록 시 logger 전달 여부 반영

우선순위: `환경변수 > Admin Settings > 기본값(info)`

## 테스트 항목

- [ ] `log_level=info` 시 Action Provider debug 로그 미출력
- [ ] `log_level=debug` 시 Action Provider debug 로그 정상 출력
- [ ] `WAIAAS_ACTION_DEBUG=true` 시 `log_level` 무관하게 debug 출력
- [ ] hot-reload로 `log_level` 변경 시 즉시 반영
