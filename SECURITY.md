# Security policy

Thanks for taking the time to make Relay safer.

## Supported versions

Relay ships frequently and only the most recent release receives security fixes. If you're on an older version, please upgrade through the in-app updater (Settings → Updates) before reporting.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.** Instead use one of the channels below so we can investigate and ship a fix before details are public.

- **Preferred — GitHub Security Advisories**: open a private advisory at <https://github.com/relay-client/relay/security/advisories/new>. This keeps the report private until we publish a fix.
- **Alternative — public tracker triage**: if advisories are unavailable, open a minimal issue at <https://github.com/relay-client/relay/issues/new> saying you have a security report and include a safe contact method. Do not post exploit details publicly.

When reporting, please include:

- Affected Relay version (`Settings → About`).
- Operating system and architecture (e.g. macOS 14.4 / arm64).
- Reproduction steps or proof-of-concept. Logs and screenshots help.
- Your assessment of severity and impact.
- Whether you'd like to be credited in the changelog.

## Scope

We treat the following as in-scope:

- Code execution, privilege escalation, or sandbox escape inside the Relay app (including from request bodies, response handling, scripting engine, or import flows).
- Theft or unauthorized disclosure of locally stored credentials, environment variables, request bodies, or response data.
- Compromise of the auto-update channel: signature/checksum bypass, downgrade attacks, manipulation of `latest.json`, or RCE through update install.
- Issues that allow a malicious server to crash Relay, hang it indefinitely, or exhaust memory through crafted HTTP/WebSocket/SSE/Socket.IO responses.
- Cryptographic weaknesses in the encrypted request store (AES-256-GCM) or in how keys are handed off to the OS credential store.

The following are intentionally out of scope:

- Issues that require local administrator access to the user's machine.
- Self-XSS that requires the user to paste attacker-controlled content into a script field that they themselves wrote.
- Network-level attacks against servers the user explicitly chose to contact (Relay is a client; we don't sanitize requests on the user's behalf).
- Lack of certificate pinning when the user has explicitly disabled TLS verification for a request.

## Response targets

We aim to:

- Acknowledge new reports within **3 working days**.
- Provide an initial assessment (in-scope / not-in-scope / severity) within **7 days**.
- Ship a fix for critical issues within **30 days** and lower-severity ones in the next regular release.

If you have not heard back within those windows, please ping again — emails get lost.

## Disclosure

By default we coordinate disclosure with you and publish details only after a fix has shipped. Once the fix is in the in-app updater, we'll publish a GitHub security advisory and credit you (unless you prefer to stay anonymous).

Thank you for helping keep Relay safe.
