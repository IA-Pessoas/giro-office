# Design: Security Maintenance for Production

## Goal

Reduce the immediate production attack surface without changing Nexus application behavior,
then remediate the known dependency advisories in Giro Office and publish the remaining
application-security work as implementation-ready GitHub issues.

## Scope

This delivery contains four independently verifiable outcomes:

1. harden the shared VPS firewall and SSH access;
2. update vulnerable Giro Office dependencies and redeploy the affected images;
3. remove the disposable `giro-web-csp-test` container;
4. create one security milestone and nine detailed GitHub issues for the deferred work.

## Non-Goals

- Do not change Nexus source code, Compose configuration, Caddy routing, or its local Supabase.
- Do not rotate the Supabase secret or application user password in this delivery.
- Do not implement the nine deferred application-security issues.
- Do not restrict SSH to a single source IP until the operator confirms a stable IP or VPN.
- Do not disable root public-key access until the operator validates a separate `debian` login.
- Do not alter the hosted Supabase schema, grants, RLS policies, or Data API configuration.
- Do not merge pull requests automatically.

## Verified Current State

### Host

- The host has no UFW installation and no host-level input policy that blocks public listeners.
- Docker's `DOCKER-USER` chain is empty.
- TCP ports `3000`, `3002`, `3003`, `3004`, `3006`, and `5173` are published by Nexus on
  all interfaces. Host processes also listen on `4173` and `4040`.
- Caddy owns public ports `80` and `443`; SSH listens on `22`.
- PostgreSQL and the local Supabase gateway are bound to loopback and must remain unchanged.
- SSH currently permits root login, password authentication, public keys, six attempts, and X11
  forwarding.
- SSH logs show recurring password attacks against `root` and common usernames.
- One ED25519 key was accepted successfully for `root` today.
- The `debian` account exists, belongs to `sudo`, has passwordless sudo through cloud-init, and
  currently has no authorized key.
- `unattended-upgrades` is installed and periodic upgrades are enabled.

### Giro Office runtime

- All 17 production services are healthy.
- Giro Office services do not publish host ports in the production Compose override.
- `giro-web-csp-test` is a disposable container using `workspace-web:csp-test`, has no volumes,
  uses no restart policy, and publishes only `127.0.0.1:3300`.
- Production currently includes the CSP commit on `fix/csp-enforcement`.

### Dependencies

`pnpm audit` reports 34 advisories: 11 high, 20 moderate, and 3 low. The actionable dependency
families are:

- Next.js `16.2.6` and its optional Sharp `0.34.5`;
- PostCSS `8.5.11` and Nano ID `3.3.11`;
- Prisma and `@prisma/client` `7.4.1`, including vulnerable development transitive packages;
- Nodemailer `7.0.13`;
- Socket.IO Parser `4.2.6`;
- Firebase Admin and Node Cron legacy dependency trees;
- Body Parser `1.20.4`.

The repository-wide test baseline has known failures in `@workspace/legacy-api`. Scoped builds,
tests, audit output, Compose validation, image builds, and public smoke checks are the acceptance
evidence for this delivery. Pre-existing legacy failures remain documented and must not be hidden.

## Host Hardening Design

### Administrative access

The accepted root public key will be copied verbatim to `/home/debian/.ssh/authorized_keys` with
ownership `debian:debian`, directory mode `0700`, and file mode `0600`. The existing cloud-init
passwordless sudo rule remains unchanged.

SSH will be changed through a dedicated drop-in, validated with `sshd -t` before reload:

```text
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
```

Root public-key access remains as a rollback path. A later issue or operator action can set
`PermitRootLogin no` after an external login as `debian` is proven.

### Host firewall

UFW will use deny-by-default incoming and allow-by-default outgoing policies. The only allowed
host TCP ports will be:

- `22` for key-only SSH;
- `80` for Caddy ACME redirect/challenge traffic;
- `443` for HTTPS.

The policy intentionally keeps SSH open to all source IPs in this delivery because the observed
administrative IP has not been confirmed static. Key-only authentication and Fail2ban provide the
initial protection without risking a source-IP lockout.

### Docker forwarding firewall

Docker-published ports bypass ordinary UFW input rules. An idempotent host script and systemd
oneshot unit will therefore manage a dedicated chain reached from `DOCKER-USER`:

1. return established and related traffic;
2. return inbound TCP traffic to container ports `80` and `443` on the default external interface;
3. drop every other new packet entering Docker forwarding from that interface;
4. return traffic from other interfaces so internal Docker networking is unaffected.

The script must discover the default-route interface at runtime, use `iptables -C` before adding
the jump, and be safe to run repeatedly. The systemd unit runs after both Docker and the network
are online. This blocks external access to Nexus development ports without editing or restarting
Nexus containers.

### SSH abuse controls

Fail2ban will enable only the `sshd` jail initially, using the systemd backend, three retries in a
ten-minute window, and a one-hour ban. The jail configuration must pass `fail2ban-client -t` before
the service is enabled or restarted.

### Host verification and rollback

Before and after each mutation, capture effective SSH settings, open listeners, firewall status,
Docker forwarding rules, Caddy health, Nexus HTTPS, Giro Office HTTPS, and production container
health. SSH configuration is reloaded, not restarted.

Rollback consists of removing the SSH drop-in, reloading SSH, disabling UFW if required, stopping
the Docker firewall unit, removing only its dedicated chain and jump, and disabling the new
Fail2ban jail. No rollback command may flush global iptables or Docker-managed chains.

## Dependency Remediation Design

### Branch strategy

Work occurs in `fix/security-maintenance`, created from `fix/csp-enforcement`. This guarantees that
a newly built UI retains the already deployed enforced CSP. The pull request is initially stacked
on `fix/csp-enforcement`; after PR #762 is merged, its base must be changed to `develop`.

### Upgrade strategy

Prefer the smallest supported versions that remove the complete advisory family, except where a
single current minor release removes multiple related vulnerable transitives:

- Next.js `16.3.0`, which also moves its supported Sharp range to patched `0.35.x`;
- PostCSS override `8.5.26`;
- Prisma and `@prisma/client` `7.9.1` consistently across every workspace package and root override;
- Nodemailer `9.0.5`;
- Firebase Admin `14.2.0` and Node Cron `4.6.0` in the legacy package;
- Socket.IO Parser override `4.2.7` if the refreshed lockfile does not select it automatically;
- Body Parser override `1.20.6` if the refreshed lockfile does not select it automatically.

The lockfile remains committed. No unrelated package update is permitted merely because a newer
version exists.

### Validation

Validation proceeds from cheapest to most expensive:

1. frozen lockfile install;
2. `pnpm audit --audit-level moderate`, with zero known advisories as the target;
3. targeted app, gateway, shared, and service tests affected by dependency changes;
4. Prisma generation and builds for every stable Prisma service;
5. Next.js production build with production web build arguments;
6. Compose configuration and repository deployment tests;
7. production Docker image builds;
8. transactional deployment and endpoint waiter;
9. public CSP/header, health, login-boundary, container-health, and log checks.

If one advisory can only be removed through an unsafe or unrelated major migration, the pull
request must document the exact package path, runtime reachability, mitigation, and a follow-up
issue. It must not claim a zero-advisory result.

### Rollback

Preserve the currently healthy image IDs and tags before building. If endpoint or browser smoke
fails after replacement, retag the prior images and recreate the affected services using the
existing transactional deployment procedure.

## Disposable Container Removal

Re-inspect `giro-web-csp-test` immediately before removal and confirm it has no mounted volumes.
Remove only that named container. Do not remove `workspace-web:csp-test`, the preserved pre-CSP
image, production images, volumes, or networks. Verify port `127.0.0.1:3300` is no longer bound and
that the production web container remains healthy.

## GitHub Security Backlog

Create milestone `Security Hardening - Q3 2026`, due `2026-09-30`, and the following nine issues:

1. Move the browser JWT to a server-managed HttpOnly session and add CSRF defenses.
2. Remove login enumeration and enforce active user and organization status.
3. Add mandatory MFA for owner and admin accounts.
4. Migrate password hashing to Argon2id with progressive legacy rehash.
5. Replace in-memory login limits with distributed IP and account buckets.
6. Make gateway authorization default-deny with policy coverage for every route.
7. Add least-privilege database roles and tenant isolation with RLS defense in depth.
8. Replace shared symmetric JWT and internal tokens with scoped service identities.
9. Harden containers and the public HTTP surface, including docs exposure and residual CSP work.

Each issue must contain:

- problem and verified evidence;
- security impact and goal;
- explicit in-scope and out-of-scope lists;
- implementation notes with concrete files to inspect;
- acceptance criteria written as checkboxes;
- required unit, integration, cross-tenant, smoke, and negative tests where applicable;
- rollout, observability, and rollback requirements;
- dependencies on other issues;
- a codegen handoff that prohibits secrets and production data in tests or documentation.

Use existing labels when possible and create only the minimal missing labels: `security`,
`hardening`, `frontend`, `backend`, `database`, and `infra`.

## GitHub Authentication Constraint

The local GitHub CLI token is currently invalid, and the connected GitHub app cannot access the
private repository. Publishing the milestone, issues, branch, and PR therefore requires a fresh
`gh auth login` completed by the operator. Local implementation and validation may proceed before
that authentication, but the delivery is not complete until the GitHub objects exist.

## Done When

- Only TCP `22`, `80`, and `443` are reachable through host policy, and Docker forwarding blocks
  all other externally published container ports.
- SSH passwords and keyboard-interactive authentication are disabled; X11 is disabled; root is
  key-only; `debian` has the accepted key and passwordless sudo.
- Fail2ban's SSH jail is active and validated.
- Nexus and all 17 Giro Office production services remain healthy through the host changes.
- `giro-web-csp-test` no longer exists and no production asset was deleted.
- The dependency audit result and all scoped validations are recorded accurately.
- Updated production images retain enforced CSP and pass endpoint/browser smoke.
- The security branch is committed, pushed, and represented by a draft PR with its stacked-base
  relationship documented.
- The milestone and all nine codegen-ready issues exist on GitHub.
