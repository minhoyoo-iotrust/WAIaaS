import type { Messages } from './en.js';

export const messages: Messages = {
  // Error messages (66 error codes)
  errors: {
    // AUTH domain (8)
    INVALID_TOKEN: '유효하지 않은 인증 토큰입니다',
    TOKEN_EXPIRED: '인증 토큰이 만료되었습니다',
    SESSION_REVOKED: '세션이 폐기되었습니다',
    INVALID_SIGNATURE: '유효하지 않은 서명입니다',
    INVALID_NONCE: '유효하지 않거나 만료된 nonce입니다',
    INVALID_MASTER_PASSWORD: '마스터 패스워드가 올바르지 않습니다',
    MASTER_PASSWORD_LOCKED: '로그인 시도 초과로 마스터 패스워드가 잠겼습니다',
    SYSTEM_LOCKED: '시스템이 잠겼습니다 (킬 스위치 활성)',
    // SESSION domain (8)
    SESSION_NOT_FOUND: '세션을 찾을 수 없습니다',
    SESSION_EXPIRED: '세션이 만료되었습니다',
    SESSION_LIMIT_EXCEEDED: '세션 제한을 초과했습니다',
    CONSTRAINT_VIOLATED: '세션 제약 조건을 위반했습니다',
    RENEWAL_LIMIT_REACHED: '세션 갱신 제한에 도달했습니다',
    SESSION_ABSOLUTE_LIFETIME_EXCEEDED: '세션 절대 수명을 초과했습니다',
    RENEWAL_TOO_EARLY: '세션 갱신이 너무 이릅니다',
    SESSION_RENEWAL_MISMATCH: '세션 갱신 토큰이 일치하지 않습니다',
    // TX domain (20)
    INSUFFICIENT_BALANCE: '잔액이 부족합니다',
    INVALID_ADDRESS: '유효하지 않은 주소 형식입니다',
    TX_NOT_FOUND: '트랜잭션을 찾을 수 없습니다',
    TX_EXPIRED: '트랜잭션이 만료되었습니다',
    TX_ALREADY_PROCESSED: '이미 처리된 트랜잭션입니다',
    CHAIN_ERROR: '블록체인 오류가 발생했습니다',
    SIMULATION_FAILED: '트랜잭션 시뮬레이션에 실패했습니다',
    TOKEN_NOT_FOUND: '토큰을 찾을 수 없습니다',
    TOKEN_NOT_ALLOWED: '정책에 의해 허용되지 않는 토큰입니다',
    INSUFFICIENT_TOKEN_BALANCE: '토큰 잔액이 부족합니다',
    CONTRACT_CALL_DISABLED: '컨트랙트 호출이 비활성화되어 있습니다',
    CONTRACT_NOT_WHITELISTED: '화이트리스트에 없는 컨트랙트입니다',
    METHOD_NOT_WHITELISTED: '화이트리스트에 없는 메서드입니다',
    APPROVE_DISABLED: 'Approve 작업이 비활성화되어 있습니다',
    SPENDER_NOT_APPROVED: '승인되지 않은 spender입니다',
    APPROVE_AMOUNT_EXCEEDED: 'Approve 금액을 초과했습니다',
    UNLIMITED_APPROVE_BLOCKED: '무제한 approve가 차단되어 있습니다',
    BATCH_NOT_SUPPORTED: '이 체인에서 배치 트랜잭션이 지원되지 않습니다',
    BATCH_SIZE_EXCEEDED: '배치 크기를 초과했습니다',
    BATCH_POLICY_VIOLATION: '배치 정책 위반입니다',
    // POLICY domain (4)
    POLICY_DENIED: '정책에 의해 거부되었습니다',
    SPENDING_LIMIT_EXCEEDED: '지출 한도를 초과했습니다',
    RATE_LIMIT_EXCEEDED: '요청 빈도 제한을 초과했습니다',
    WHITELIST_DENIED: '화이트리스트에 없는 주소입니다',
    // OWNER domain (5)
    OWNER_ALREADY_CONNECTED: 'Owner가 이미 연결되어 있습니다',
    OWNER_NOT_CONNECTED: 'Owner가 연결되지 않았습니다',
    OWNER_NOT_FOUND: 'Owner를 찾을 수 없습니다',
    APPROVAL_TIMEOUT: '승인 요청이 시간 초과되었습니다',
    APPROVAL_NOT_FOUND: '승인 요청을 찾을 수 없습니다',
    // SYSTEM domain (6)
    KILL_SWITCH_ACTIVE: '킬 스위치가 이미 활성화되어 있습니다',
    KILL_SWITCH_NOT_ACTIVE: '킬 스위치가 활성화되지 않았습니다',
    KEYSTORE_LOCKED: '키스토어가 잠겨 있습니다',
    CHAIN_NOT_SUPPORTED: '지원하지 않는 체인입니다',
    SHUTTING_DOWN: '서버가 종료 중입니다',
    ADAPTER_NOT_AVAILABLE: '체인 어댑터를 사용할 수 없습니다',
    // AGENT domain (3)
    AGENT_NOT_FOUND: '에이전트를 찾을 수 없습니다',
    AGENT_SUSPENDED: '에이전트가 정지 상태입니다',
    AGENT_TERMINATED: '에이전트가 종료되었습니다',
    // WITHDRAW domain (4)
    NO_OWNER: '이 에이전트에 등록된 Owner가 없습니다',
    WITHDRAW_LOCKED_ONLY: '출금에는 LOCKED Owner 상태가 필요합니다',
    SWEEP_TOTAL_FAILURE: '모든 sweep 작업이 실패했습니다',
    INSUFFICIENT_FOR_FEE: '트랜잭션 수수료에 필요한 잔액이 부족합니다',
    // ACTION domain (7)
    ACTION_NOT_FOUND: '액션을 찾을 수 없습니다',
    ACTION_VALIDATION_FAILED: '액션 검증에 실패했습니다',
    ACTION_RESOLVE_FAILED: '액션 해석에 실패했습니다',
    ACTION_RETURN_INVALID: '액션 반환값이 유효하지 않습니다',
    ACTION_PLUGIN_LOAD_FAILED: '액션 플러그인 로드에 실패했습니다',
    ACTION_NAME_CONFLICT: '액션 이름이 충돌합니다',
    ACTION_CHAIN_MISMATCH: '액션의 체인이 일치하지 않습니다',
    // ADMIN domain (1)
    ROTATION_TOO_RECENT: '시크릿 로테이션이 너무 최근에 수행되었습니다',
  },
  // System messages
  system: {
    daemon_started: 'WAIaaS 데몬이 시작되었습니다',
    daemon_stopped: 'WAIaaS 데몬이 종료되었습니다',
    daemon_already_running: '데몬이 이미 실행 중입니다',
    init_complete: 'WAIaaS 초기화가 완료되었습니다',
  },
  // CLI messages
  cli: {
    prompt_master_password: '마스터 패스워드를 입력하세요:',
    confirm_master_password: '마스터 패스워드를 다시 입력하세요:',
    password_mismatch: '패스워드가 일치하지 않습니다',
    status_running: '상태: 실행 중',
    status_stopped: '상태: 정지',
  },
};
