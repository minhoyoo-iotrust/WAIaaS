# #419 — DeFi UAT 6시나리오 반복 검증 및 수정 루프

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-08, defi-09, defi-10, defi-14, defi-15, defi-16
- **최대 반복 횟수**: 5회
- **탈출 조건**: 5회 초과 시 WONTFIX 또는 mock 기반 전환 검토

## 현상

DeFi UAT 6개 시나리오가 여러 차례 수정에도 불구하고 PASS를 달성하지 못했다. 이슈 #413~#417이 코드상 FIXED 되었으나, 수정 후 재검증(UAT 재실행)이 한 번도 수행되지 않은 상태다.

| 시나리오 | 설명 | 최종 상태 | 관련 이슈 |
|----------|------|-----------|-----------|
| defi-08 | Kamino Lending (USDC Supply) | FAIL (never passed) | #413 FIXED |
| defi-09 | Pendle Yield Trading (PT Buy) | FAIL (6회 재발) | #414 FIXED |
| defi-10 | Drift Perpetual Trading | FAIL (RPC 429) | #415 FIXED |
| defi-14 | DCent 2-hop Auto-Routing | PARTIAL (dryRun만 PASS) | #409 |
| defi-15 | DCent Crosschain EVM→Solana | FAIL (root cause 미확인) | — |
| defi-16 | DCent Solana Swap | FAIL (chain guard) | #417 FIXED |

## 수정 방향

### 반복 루프 프로세스

각 라운드마다 아래 단계를 순서대로 실행한다:

1. **빌드**: `pnpm turbo run build`
2. **데몬 기동**: `~/.waiaas` 기존 데이터 사용, 개발 빌드로 기동
3. **UAT 실행**: 대상 6개 시나리오 실행
4. **실패 분석**: 에러 로그 + API 요청/응답 로그 기반 root cause 파악
5. **코드 수정**: 원인 코드 수정
6. **테스트 추가**: 수정 사항에 대한 단위/통합 테스트 작성
7. **테스트 통과 확인**: `pnpm turbo run test` 실행
8. **커밋**: 수정 사항 atomic commit
9. **PASS/FAIL 판정**: PASS된 시나리오는 목록에서 제외, FAIL이면 1번으로

### 라운드 종료 조건

- **성공**: 6개 시나리오 전부 PASS
- **최대 반복**: 5회 도달 시 미통과 시나리오에 대해:
  - 외부 API 의존성 문제 → WONTFIX + 사유 기록
  - mock 기반 테스트로 전환 가능 → 별도 이슈 등록
  - DCent 팀 지원 필요 → 디버그 로그 첨부하여 요청

### DCent API 디버그 로그 파일 덤프

DCent 관련 시나리오(defi-14, defi-15, defi-16) 실패 시 디센트팀에 전달할 수 있도록 요청/응답 로그를 파일로 저장한다.

1. **덤프 위치**: `~/.waiaas/logs/dcent-debug/{timestamp}-{scenario-id}.json`
2. **덤프 내용**:
   - HTTP request: method, URL, headers (API key 마스킹), body
   - HTTP response: status, headers, body (원본 JSON)
   - 타임스탬프, 소요 시간, 에러 메시지
3. **트리거**: DCent ActionApiClient 호출이 에러를 반환하거나 UAT 검증이 실패한 경우
4. **구현 방식**: 기존 #412의 debug 로깅 인프라 위에 파일 덤프 레이어 추가
   - `ActionApiClient`에 `dumpToFile` 옵션 추가
   - `WAIAAS_DCENT_DEBUG_DUMP=true` 환경 변수 또는 config.toml `[dcent] debug_dump = true`로 활성화
5. **디센트팀 전달 포맷**: 시나리오별 JSON 파일, 요청/응답 쌍 배열

```json
{
  "scenario": "defi-15",
  "timestamp": "2026-03-23T10:30:00Z",
  "daemon_version": "2.12.0-rc.1",
  "calls": [
    {
      "seq": 1,
      "method": "POST",
      "url": "https://api.dcentwallet.com/swap/v3/get_quotes",
      "request": { "fromId": "ETHEREUM", "toId": "SOLANA", "amount": "1000000" },
      "response": { "status": 200, "body": { "quotes": [] } },
      "duration_ms": 342
    }
  ]
}
```

## 기대 효과

- FIXED 이슈들의 실제 동작 검증 완료
- DCent 관련 미해결 문제에 대해 디센트팀과 데이터 기반 커뮤니케이션 가능
- 반복 상한(5회)으로 무한 루프 방지

## 테스트 항목

### DCent 디버그 덤프
- [ ] `WAIAAS_DCENT_DEBUG_DUMP=true` 설정 시 `~/.waiaas/logs/dcent-debug/` 에 JSON 파일 생성
- [ ] 덤프 파일에 request URL, body, response status, body가 모두 포함
- [ ] API key 등 민감 헤더가 마스킹 처리
- [ ] 설정 미활성화 시 파일 미생성 (기존 동작 유지)

### UAT 재검증
- [ ] defi-08: Kamino USDC Supply 정상 완료
- [ ] defi-09: Pendle PT Buy 정상 완료
- [ ] defi-10: Drift Perp 정상 완료 (RPC Pool 경유)
- [ ] defi-14: DCent 2-hop 견적+실행 정상 완료
- [ ] defi-15: DCent Crosschain EVM→Solana 정상 완료 또는 WONTFIX 사유 기록
- [ ] defi-16: DCent Solana Swap 정상 완료
