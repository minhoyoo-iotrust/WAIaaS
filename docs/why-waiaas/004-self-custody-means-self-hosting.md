---
title: "Self-Custody for Agents Means Self-Hosting"
description: "Why true self-custody for AI agent wallets requires self-hosted infrastructure. The case against custodial APIs."
date: "2026-02-05"
section: "blog"
slug: "self-custody-means-self-hosting"
category: "Why WAIaaS"
---
# Why WAIaaS: Self-Custody for Agents Ultimately Means Self-Hosting

## "Not Your Keys, Not Your Crypto"

An old crypto maxim. Don't leave your keys on an exchange — hold them yourself. Whether it's a hardware wallet or a software wallet, if the key is in your hands, that's self-custody.

This principle was sufficient in **a world where humans use wallets directly**.

But the entity using wallets is changing. AI agents are transacting, swapping, bridging, and staking on behalf of humans. In a world where agents use wallets, can we still say "self-custody" just because we hold the key?

---

## When Agents Enter the Picture, Self-Custody Means Something Different

When a human uses a wallet directly, it's simple:

```
Human → Key → Sign → Chain
```

Holding the key is enough. You make the judgment, you execute the signature.

When an agent uses a wallet, the structure changes:

```
Agent → [???] → Key → Sign → Chain
```

What fills `[???]` introduces new trust requirements:
- **Who holds the key?** (Custody)
- **Who defines and enforces the agent's behavioral rules?** (Policy)
- **Where does all of this run?** (Infrastructure)

Even if you hold the key, if policy or infrastructure is controlled by a third party — that's only partial self-custody.

---

## The Current Landscape

The AI agent wallet market is growing fast, and there are excellent solutions available:

- [Coinbase Agentic Wallets](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets) — Setting the standard for agent wallets with the x402 protocol. 2-minute setup, 50M+ x402 transactions processed.
- [Privy](https://www.privy.io/ai) — TEE + key sharding server wallets. Adopted by major projects like Virtuals Protocol.
- [Turnkey](https://www.turnkey.com/solutions/ai-agents) — AWS Nitro Enclaves with 50-100x faster signing than MPC. Series B $30M.
- [MoonPay Agents](https://crypto.news/moonpay-launches-ai-agents-non-custodial-wallets-2026/) — Full financial lifecycle for agents, from fiat on-ramp to portfolio management.
- [Skyfire](https://www.skyfire.xyz/) — $9.5M from a16z crypto + Coinbase Ventures. "Visa for the AI economy" — an agent payment network.

Each brings distinct strengths, and together they're pushing this market forward. But when examined through the lens of self-custody, an interesting pattern emerges.

---

## Keys Alone Are Not Enough: Three Layers of Control

### Layer 1 — Who Holds the Key?

| Platform | Key Location |
|---|---|
| **Coinbase Agentic Wallets** | AWS Nitro Enclave (Coinbase infrastructure) |
| **Privy** | TEE + key sharding (Privy infrastructure) |
| **Turnkey** | AWS Nitro Enclave (Turnkey infrastructure) |
| **MoonPay Agents** | User's device (non-custodial) |
| **Skyfire** | Skyfire network |
| **WAIaaS** | User's machine, XSalsa20-Poly1305 encrypted |

The TEE-based protections from Coinbase, Privy, and Turnkey are strong. Keys are never decrypted outside the enclave, making access difficult even for the platform operators themselves.

But TEEs exist within a larger system. In February 2025, Bybit lost [$1.4 billion](https://www.coindesk.com/business/2025/02/21/bybit-suffers-potential-hack-on-eth-cold-wallet-over-1-billion-in-outflows/) in a single hack — the largest crypto theft in history. The attack vector was Safe's front-end, not the key storage itself. When a cloud platform is the custodian, every wallet it manages shares the same attack surface.

MoonPay Agents looks in the same direction as WAIaaS here — a non-custodial model where the key stays on the user's device.

But once you hold the key yourself, the next question arises.

### Layer 2 — Who Controls the Agent's Behavioral Rules?

An agent is not a human. Humans judge "is this transaction correct?" before signing. Agents execute based on prompts. If an agent is prompt-injected, it may judge a malicious transaction as legitimate.

This is why a **policy engine** — a mechanism that constrains agent behavior at the code level — is essential. Most platforms provide one:

| Platform | Policy Types | Defined By |
|---|---|---|
| **Coinbase** | Session caps, tx limits, KYT screening | Platform |
| **Privy** | Basic spending limits | Developer (API) |
| **Turnkey** | Spending limits, multisig, contextual constraints | Developer (policy engine) |
| **MoonPay Agents** | Basic settings | User (CLI) |
| **Skyfire** | Per-agent guardrails | Network |
| **WAIaaS** | 12 types, any combination, hot-reload | User (Admin UI) |

Here's where a critical distinction emerges. Even if you hold the key, **if the platform defines and enforces the policies**, the platform determines the boundaries of what your agent can do.

Coinbase's KYT screening automatically blocks high-risk addresses — a benefit for regulated entities, but it also means rules you didn't choose may be applied to your agent's transactions.

And even if you control both keys and policies, one final question remains.

### Layer 3 — Where Does All of This Run?

You hold the key. You defined the policies. But if they run on a cloud server:

**Availability depends on the platform.** Your agent needs to urgently liquidate a DeFi position, but the API is down. There is nothing you can do but wait.

**Privacy is exposed to the platform.** Every API call transmits transaction metadata — recipient addresses, amounts, contract interactions, timing patterns — to the platform's servers. Your agent's trading strategy is visible to a third party.

**Jurisdiction follows the platform.** In June 2024, [MetaMask blocked users in certain countries](https://www.coindesk.com/policy/2024/06/14/metamask-blocks-venezuela-users-amid-us-sanctions-confusion/) due to sanctions compliance by its infrastructure provider Infura.

**Continuity depends on the platform.** If the platform shuts down, there's no guarantee that key export will even be possible.

---

## Conclusion: All Three Must Be Local for True Self-Custody

| Control Layer | Delegated to Cloud | Kept Local |
|---|---|---|
| **Keys** | Platform breach exposes all managed wallets | Only your machine to protect |
| **Policies** | Platform can add/change rules unilaterally | Only your rules apply |
| **Infrastructure** | Subject to outages, shutdowns, sanctions | Your machine is your uptime |

If even one layer is in the cloud, that's where third-party dependency lives. Self-custody in the agent era is not just about keys — it's about **keys + policies + infrastructure**.

And the only way to keep all three under your control is **self-hosting**.

```
┌──────────────────────────────────────────────────┐
│  Your Machine                                     │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │  WAIaaS Daemon (localhost)                  │  │
│  │                                             │  │
│  │  Keys: XSalsa20-Poly1305 encrypted, local   │  │
│  │  Policies: 12 types, user-defined, hot-reload│  │
│  │  Infrastructure: local daemon, no external   │  │
│  │                   dependencies               │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  AI Agent ──── JWT session ────→ Daemon            │
│  Owner ──── Wallet signature ──→ Approve/Reject   │
└──────────────────────────────────────────────────┘
```

This is why WAIaaS chose a self-hosted architecture. When you extend the principle of self-custody to the agent era, it goes beyond key storage to encompass policy enforcement and infrastructure — and that means self-hosting.

---

## Full Comparison

| | Coinbase | Privy | Turnkey | MoonPay | Skyfire | WAIaaS |
|---|---|---|---|---|---|---|
| **Keys** | Platform TEE | Platform TEE | Platform TEE | User | Network | **User (encrypted)** |
| **Policies** | Platform | Partial | Partial | Basic | Network | **User (12 types)** |
| **Infrastructure** | Cloud | Cloud | Cloud | Local+Cloud | Cloud | **Fully local** |
| **All three local?** | — | — | — | — | — | **Yes** |
| **Multi-chain** | Base-first | EVM+Sol+BTC | EVM+Sol | Multi-chain | Base | **EVM+Solana** |
| **DeFi** | Swap, earn | — | — | Swap | — | **Swap+Bridge+Staking** |
| **x402** | Native | Via integration | — | — | Native | **Client support** |
| **Open source** | Partial | No | No | No | No | **Fully** |
| **Cost** | Free+usage | Enterprise | Enterprise | Free+fees | Usage | **Free** |
| **Strength** | Ecosystem | Track record | Signing speed | Fiat on-ramp | Agent ID | **Full self-control** |

---

## When Each Solution Shines

Every solution has a use case where it's the best fit:

| Situation | Best Fit |
|---|---|
| Getting started fast on the Base ecosystem | **Coinbase** — 2-minute setup, rich ecosystem |
| Running large agent fleets at enterprise scale | **Privy** or **Turnkey** — managed infra, SLA, compliance |
| One-stop fiat-to-crypto agent onboarding | **MoonPay Agents** — full financial lifecycle |
| Building agent-to-agent payment networks | **Skyfire** — agent identity, USDC rails |
| Controlling keys, policies, and infrastructure yourself | **WAIaaS** — self-hosted self-custody |

---

## The Trade-Offs

Self-hosting means controlling everything — and managing everything:

| Advantage | Cost |
|---|---|
| Keys never leave your machine | Manage backups yourself. Lost master password = lost keys |
| Policies defined and enforced by you | No compliance shortcuts — design your own rules |
| Infrastructure on your machine | Manage uptime, updates, and security patches yourself |
| No platform dependency | No platform support team to call |
| Open source, free | Compute and RPC costs are yours |

---

## Key Takeaway

> "Not your keys, not your crypto."
>
> In the agent era, this extends to:
>
> **"Not your keys, not your policies, not your infrastructure — not your custody."**
>
> WAIaaS was built as a self-hosted system to deliver this extended self-custody for AI agents.

---

*Last updated: 2026-02-25*

Sources:
- [Coinbase Agentic Wallets](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets)
- [Coinbase Agentic Wallets — Decrypt](https://decrypt.co/357813/coinbase-launches-wallet-ai-agents-built-in-guardrails)
- [Privy AI Agent Infrastructure](https://www.privy.io/ai)
- [Privy Server Wallets](https://privy.io/blog/introducing-server-wallets)
- [Turnkey AI Agent Wallets](https://www.turnkey.com/solutions/ai-agents)
- [Turnkey Series B — AlleyWatch](https://www.alleywatch.com/2025/06/turnkey-crypto-infrastructure-embedded-verifiable-wallets-onchain-automation-bryce-ferguson/)
- [MoonPay Agents — crypto.news](https://crypto.news/moonpay-launches-ai-agents-non-custodial-wallets-2026/)
- [MoonPay Agents — CoinDesk](https://www.coindesk.com/business/2026/02/24/moonpay-unveils-ai-onramp-for-brave-new-agent-economy/)
- [Skyfire — The Block](https://www.theblock.co/post/322742/coinbase-ventures-and-a16zs-csx-bring-skyfires-total-funding-raised-to-9-5-million)
- [x402 Protocol](https://www.x402.org)
- [Bybit $1.4B Hack — CoinDesk](https://www.coindesk.com/business/2025/02/21/bybit-suffers-potential-hack-on-eth-cold-wallet-over-1-billion-in-outflows/)
- [MetaMask Venezuela Block — CoinDesk](https://www.coindesk.com/policy/2024/06/14/metamask-blocks-venezuela-users-amid-us-sanctions-confusion/)
- [AI Agent Payment Infrastructure — CoinGecko](https://www.coingecko.com/learn/ai-agent-payment-infrastructure-crypto-and-big-tech)

## Related

- [Autonomous AI Agents Deserve Secure Wallets](/blog/autonomous-agents-deserve-secure-wallets/) - The case for purpose-built agent wallet infrastructure
- [The AI Agent Wallet Security Crisis](/blog/ai-agent-wallet-security-crisis/) - Understanding the current security landscape
- [Smart Account Lite / Full Mode Guide](/docs/smart-account-guide/) - Advanced account abstraction for agent wallets
