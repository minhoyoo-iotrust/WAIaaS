# 453 — Dev.to 공개 API CDN 캐시로 신규 블로그 글이 사이트에 반영되지 않음

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** OPEN
- **발견일:** 2026-03-25
- **관련 파일:** `site/build.mjs` (fetchDevtoBlogPosts, L239–323)

## 현상

GitHub Pages 배포 워크플로우(`Deploy GitHub Pages`) 실행 시 Dev.to에 새로 발행한 블로그 글이 사이트에 반영되지 않음.
- Dev.to에 6개 발행 완료, 빌드에서는 3개만 가져옴
- 새 글 3개 (2026-03-24 발행)가 누락:
  - `gasless-ai-agents-with-erc-4337-account-abstraction`
  - `one-agent-multiple-chains-evm-solana-wallet-infrastructure`
  - `how-we-designed-a-7-stage-transaction-pipeline-for-ai-agents`

## 원인 분석

현재 `fetchDevtoBlogPosts()`가 **공개 API** (`GET /api/articles?username=walletguy`) 를 사용 중.
이 엔드포인트는 Fastly CDN 캐시를 탐:

```
cache-control: public, no-cache
x-cache: MISS, HIT
age: 874
vary: Accept-Encoding, Origin, X-Loggedin
```

- `X-Loggedin` vary 헤더가 있으나, `api-key` 헤더만으로는 로그인 상태로 인식되지 않아 캐시된 응답 반환
- 신규 글 발행 후 CDN 캐시가 갱신되기 전까지 구버전 응답(3개)이 반환됨
- GitHub Actions IP(미국)와 로컬(한국)이 다른 CDN 엣지를 사용하여 로컬에서는 정상, CI에서는 캐시 HIT

## 해결 방안

**인증 전용 엔드포인트** `GET /api/articles/me?per_page=100&state=published` 사용:

- CDN 캐시를 타지 않음 (`x-cache: MISS, MISS`)
- `state=published`는 `/articles/me` 전용 파라미터 (published / unpublished / all)
- `DEVTO_API_KEY` 필수 (미설정 시 401 반환)
- 실제 검증 완료: API 키로 호출 시 6개 전체 반환 확인

```js
// Before (CDN cached)
fetch(`https://dev.to/api/articles?username=${DEVTO_USERNAME}&per_page=100&state=all`, { headers })

// After (no CDN cache)
const url = process.env.DEVTO_API_KEY
  ? 'https://dev.to/api/articles/me?per_page=100&state=published'
  : `https://dev.to/api/articles?username=${DEVTO_USERNAME}&per_page=100`;
fetch(url, { headers })
```

참고: 공개 endpoint의 `state=all`은 피드 정렬 옵션이지 발행 상태 필터가 아님. `/articles/me`의 `state`와 의미가 다름.

## 테스트 항목

### 자동화 테스트 (코드)

1. **URL 분기 로직 단위 테스트**: `DEVTO_API_KEY` 환경변수 유무에 따라 올바른 URL이 선택되는지 확인
   - API 키 설정 시 → `https://dev.to/api/articles/me?per_page=100&state=published`
   - API 키 미설정 시 → `https://dev.to/api/articles?username=walletguy&per_page=100`
2. **로컬 slug 중복 스킵 테스트**: Dev.to에서 가져온 글의 slug이 로컬 `docs/` 마크다운과 겹칠 때 "Skipped (local exists)" 처리 확인
3. **빌드 출력 검증**: 빌드 로그에 "Dev.to API returned N articles" 메시지가 포함되는지 확인

### 수동 검증 (사람)

1. **신규 글 즉시 반영 확인**: Dev.to에 새 글 발행 직후 GitHub Pages 워크플로우 실행 → 해당 글이 사이트 블로그 목록(`/blog/`)에 표시되는지 확인
2. **CI 로그 확인**: 워크플로우 실행 로그에서 `Dev.to API returned` 숫자가 Dev.to 프로필의 발행 글 수와 일치하는지 확인
3. **API 키 미설정 시 fallback 동작**: GitHub Secrets에서 `DEVTO_API_KEY`를 임시 제거 후 빌드 → 공개 endpoint로 fallback하여 기존 글은 여전히 가져오는지 확인
