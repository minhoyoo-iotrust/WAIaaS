# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

We take the security of WAIaaS seriously. If you discover a security vulnerability, we appreciate your help in disclosing it to us responsibly.

### How to Report

Send an email to **security@waiaas.dev** with the following information:

- **Description**: A clear description of the vulnerability
- **Reproduction Steps**: Step-by-step instructions to reproduce the issue
- **Impact Assessment**: What an attacker could achieve by exploiting this vulnerability
- **Affected Versions**: Which versions of WAIaaS are affected
- **Proof of Concept**: If possible, include a minimal proof of concept (code, screenshots, or logs)

### Responsible Disclosure

We follow a Responsible Disclosure policy. We kindly ask that you:

1. **Do not** publicly disclose the vulnerability before we have had a chance to address it
2. **Do not** exploit the vulnerability beyond what is necessary to demonstrate it
3. **Do not** access, modify, or delete data belonging to others
4. Act in good faith to avoid privacy violations, data destruction, and service disruption

## Response SLA

We are committed to responding promptly to security reports:

| Milestone              | Target        |
| ---------------------- | ------------- |
| Acknowledgment         | 48 hours      |
| Initial assessment     | 7 days        |
| Fix release (critical) | 90 days       |

We will keep you informed of our progress throughout the process.

## Disclosure Policy

- Once a fix has been released, we will publish a security advisory on GitHub
- Reporters will be credited in the advisory (unless they prefer to remain anonymous)
- We will coordinate disclosure timing with the reporter
- CVE IDs will be requested for qualifying vulnerabilities

## Scope

### In Scope

The following components are covered by this security policy:

- **@waiaas/daemon** -- Self-hosted daemon (HTTP API, SQLite, Keystore)
- **@waiaas/sdk** -- TypeScript SDK
- **waiaas-sdk** -- Python SDK
- **@waiaas/mcp** -- MCP server
- **@waiaas/admin** -- Admin Web UI
- **@waiaas/cli** -- CLI tool
- **@waiaas/core** -- Core library (schemas, domain models)
- **@waiaas/adapter-solana** -- Solana chain adapter
- **@waiaas/adapter-evm** -- EVM chain adapter
- Docker images and deployment configurations

### Out of Scope

- Vulnerabilities in third-party dependencies (please report these to the respective projects)
- Social engineering attacks against project maintainers or users
- Denial of service attacks against hosted instances
- Issues in forks or unofficial distributions
- Vulnerabilities requiring physical access to the host machine

## Security Best Practices

When self-hosting WAIaaS, we recommend:

- Run the daemon behind a reverse proxy with TLS termination
- Use strong master passwords (Argon2id is used internally)
- Keep WAIaaS and its dependencies up to date
- Restrict network access to the daemon's HTTP port
- Review and configure policies before connecting to mainnet

## Contact

- **Security issues**: security@waiaas.dev
- **General questions**: Open a GitHub issue
