/**
 * Magic word (agent connection prompt) text generation.
 *
 * Generates a structured "[WAIaaS Connection]" block that AI agents
 * can parse to immediately connect to the daemon.
 */

export interface WalletPromptInfo {
  id: string;
  name: string;
  chain: string;
  defaultNetwork: string;
  sessionToken: string;
}

/**
 * Build the full multi-wallet magic word block.
 *
 * Format:
 * ```
 * [WAIaaS Connection]
 * - URL: {baseUrl}
 *
 * Wallets:
 * 1. {name} ({id}) -- {defaultNetwork}
 *    Session: {sessionToken}
 * ...
 *
 * (session renewal instructions)
 * ```
 */
export function buildAgentPrompt(baseUrl: string, wallets: WalletPromptInfo[]): string {
  const lines: string[] = [];

  lines.push('[WAIaaS Connection]');
  lines.push(`- URL: ${baseUrl}`);
  lines.push('');
  lines.push('Wallets:');

  wallets.forEach((w, i) => {
    lines.push(`${i + 1}. ${w.name} (${w.id}) \u2014 ${w.defaultNetwork}`);
    lines.push(`   Session: ${w.sessionToken}`);
  });

  lines.push('');
  lines.push('\uC138\uC158\uC774 \uB9CC\uB8CC\uB418\uBA74(401 Unauthorized)');
  lines.push('POST /v1/wallets/{walletId}/sessions/{sessionId}/renew \uC73C\uB85C \uAC31\uC2E0\uD558\uC138\uC694.');
  lines.push('');
  lines.push('\uC704 \uC815\uBCF4\uB85C WAIaaS \uC9C0\uAC11\uC5D0 \uC5F0\uACB0\uD558\uC5EC \uC794\uC561\uC744 \uD655\uC778\uD558\uACE0 \uAD00\uB9AC\uD574\uC8FC\uC138\uC694.');

  return lines.join('\n');
}

/**
 * Build the magic word block for a single wallet.
 */
export function buildSingleWalletPrompt(baseUrl: string, wallet: WalletPromptInfo): string {
  const lines: string[] = [];

  lines.push('[WAIaaS Connection]');
  lines.push(`- URL: ${baseUrl}`);
  lines.push('');
  lines.push('Wallets:');
  lines.push(`1. ${wallet.name} (${wallet.id}) \u2014 ${wallet.defaultNetwork}`);
  lines.push(`   Session: ${wallet.sessionToken}`);

  lines.push('');
  lines.push('\uC138\uC158\uC774 \uB9CC\uB8CC\uB418\uBA74(401 Unauthorized)');
  lines.push('POST /v1/wallets/{walletId}/sessions/{sessionId}/renew \uC73C\uB85C \uAC31\uC2E0\uD558\uC138\uC694.');
  lines.push('');
  lines.push('\uC704 \uC815\uBCF4\uB85C WAIaaS \uC9C0\uAC11\uC5D0 \uC5F0\uACB0\uD558\uC5EC \uC794\uC561\uC744 \uD655\uC778\uD558\uACE0 \uAD00\uB9AC\uD574\uC8FC\uC138\uC694.');

  return lines.join('\n');
}
