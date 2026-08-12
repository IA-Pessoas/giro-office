# Production Security Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the shared VPS, remove the disposable CSP test container, remediate known Giro Office dependency advisories, redeploy safely, and publish nine implementation-ready security issues.

**Architecture:** Auditable host-hardening assets live under `scripts/ops/host-security/` and are installed idempotently onto the VPS. Dependency updates stay on `fix/security-maintenance`, stacked on the enforced-CSP branch so production cannot regress. Runtime changes preserve explicit rollback paths and are verified at the host, Docker, API, UI, and GitHub layers.

**Tech Stack:** Bash, Node.js test runner, UFW, iptables `DOCKER-USER`, systemd, OpenSSH, Fail2ban, Docker Compose, Node.js 22, pnpm 9.15, Next.js, Prisma, GitHub CLI.

## Global Constraints

- Do not change Nexus source, Compose, Caddy routing, or its local Supabase.
- Keep root public-key SSH as a temporary fallback; disable password and keyboard authentication.
- Do not source-restrict SSH until a stable administrator IP or VPN is confirmed.
- Only host TCP ports `22`, `80`, and `443` may remain allowed.
- Docker forwarding must allow public container ports `80` and `443` and drop other new external forwarding.
- Do not rotate Supabase or application credentials in this delivery.
- Do not change hosted Supabase schema, RLS, grants, or Data API settings.
- Retain the enforced CSP in every newly deployed web image.
- Do not delete images, volumes, networks, or any container other than `giro-web-csp-test`.
- Dependency versions and the pnpm lockfile must be committed together.
- Never place secrets, production rows, user identifiers, tokens, or passwords in GitHub issues, tests, logs, or documentation.
- Record pre-existing legacy test failures without treating them as regressions.

---

### Task 1: Add tested host-hardening assets

**Files:**
- Create: `scripts/host-security.test.mjs`
- Create: `scripts/ops/host-security/apply-docker-forward-firewall.sh`
- Create: `scripts/ops/host-security/docker-forward-firewall.service`
- Create: `scripts/ops/host-security/sshd-hardening.conf`
- Create: `scripts/ops/host-security/jail.local`

**Interfaces:**
- Consumes: Linux default route, Docker-managed `DOCKER-USER`, systemd, OpenSSH, and Fail2ban.
- Produces: `apply-docker-forward-firewall.sh` as an idempotent executable and static validated service/security configuration.

- [ ] **Step 1: Write contract tests before creating the production assets**

Create tests that load the five expected assets and assert:

```js
assert.match(firewallScript, /ip route show default/);
assert.match(firewallScript, /DOCKER-USER/);
assert.match(firewallScript, /--dports 80,443/);
assert.match(firewallScript, /--ctstate RELATED,ESTABLISHED/);
assert.doesNotMatch(firewallScript, /iptables\s+-F\s+(?!GIRO-HOST-FILTER)/);
assert.match(sshdConfig, /PasswordAuthentication no/);
assert.match(sshdConfig, /PermitRootLogin prohibit-password/);
assert.match(sshdConfig, /MaxAuthTries 3/);
assert.match(jailConfig, /maxretry\s*=\s*3/);
assert.match(unit, /After=network-online\.target docker\.service/);
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test scripts/host-security.test.mjs`

Expected: FAIL because the host-hardening assets do not exist.

- [ ] **Step 3: Implement the minimal idempotent firewall script**

The script must use a dedicated `GIRO-HOST-FILTER` chain, discover the default interface, add
exactly one jump from `DOCKER-USER`, rebuild only its own chain, return established traffic and
TCP `80/443`, drop other external forwarding, and return traffic arriving from other interfaces.

- [ ] **Step 4: Add static systemd, SSH, and Fail2ban configuration**

Use:

```ini
# sshd-hardening.conf
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
```

```ini
# jail.local
[sshd]
enabled = true
backend = systemd
maxretry = 3
findtime = 10m
bantime = 1h
```

- [ ] **Step 5: Verify GREEN and shell syntax**

Run: `node --test scripts/host-security.test.mjs`

Run: `bash -n scripts/ops/host-security/apply-docker-forward-firewall.sh`

Expected: all tests pass and shell parsing exits zero.

- [ ] **Step 6: Commit the tested assets**

```bash
git add scripts/host-security.test.mjs scripts/ops/host-security
git commit -m "fix(ops): harden production host access"
```

### Task 2: Apply and verify host hardening

**Files:**
- Create on host: `/home/debian/.ssh/authorized_keys`
- Create on host: `/etc/ssh/sshd_config.d/99-giro-hardening.conf`
- Create on host: `/etc/fail2ban/jail.d/giro-sshd.local`
- Create on host: `/usr/local/sbin/apply-giro-docker-firewall`
- Create on host: `/etc/systemd/system/giro-docker-firewall.service`
- Modify on host: UFW package-managed rules and service state.

**Interfaces:**
- Consumes: Task 1 assets and the already accepted root ED25519 public key.
- Produces: key-only SSH, UFW host filtering, Fail2ban SSH protection, and Docker forwarding filtering.

- [ ] **Step 1: Capture the rollback baseline**

Run effective `sshd -T`, `ss -lntup`, `nft list ruleset`, production `docker ps`, Caddy validation,
and HTTPS health checks. Save only non-secret output under `/tmp/giro-security-baseline/`.

- [ ] **Step 2: Install required packages**

Run: `apt-get update`

Run: `DEBIAN_FRONTEND=noninteractive apt-get install -y ufw fail2ban`

Expected: both packages install without removing Docker, OpenSSH, or Caddy dependencies.

- [ ] **Step 3: Provision the non-root administrator key**

Create `/home/debian/.ssh`, copy `/root/.ssh/authorized_keys`, set `debian:debian`, directory mode
`0700`, file mode `0600`, and verify identical `ssh-keygen -lf` fingerprints.

- [ ] **Step 4: Validate and reload SSH hardening**

Install the drop-in, run `sshd -t`, reload `ssh.service`, and verify effective values with
`sshd -T`. Do not restart the SSH daemon and do not remove the root authorized key.

- [ ] **Step 5: Enable UFW without cutting the active services**

Run in order:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'key-only SSH'
ufw allow 80/tcp comment 'Caddy HTTP'
ufw allow 443/tcp comment 'Caddy HTTPS'
ufw --force enable
ufw status verbose
```

- [ ] **Step 6: Install and enable Docker forwarding protection**

Install the executable and unit from Task 1, run `systemctl daemon-reload`, enable/start the unit,
run the script a second time to prove idempotence, and assert one `DOCKER-USER` jump exists.

- [ ] **Step 7: Validate and enable Fail2ban**

Install the jail, run `fail2ban-client -t`, enable/restart Fail2ban, and verify `sshd` appears in
`fail2ban-client status`.

- [ ] **Step 8: Verify the host and both applications**

Confirm effective SSH settings, UFW rules, Docker chain counters, public listeners, Caddy validity,
Nexus HTTPS, Giro Office HTTPS/API, and all 17 Giro containers healthy. If any application fails,
execute only the component rollback described in the design before continuing.

### Task 3: Remove the disposable CSP test container

**Files:**
- Runtime only: Docker container `giro-web-csp-test`.

**Interfaces:**
- Consumes: exact-name inspection of the disposable container.
- Produces: no test container and no listener on `127.0.0.1:3300`.

- [ ] **Step 1: Revalidate the deletion target**

Run `docker inspect giro-web-csp-test` and assert: image `workspace-web:csp-test`, restart `no`, no
mounts/volumes, and host binding only `127.0.0.1:3300`.

- [ ] **Step 2: Remove only the validated container**

Run: `docker rm -f giro-web-csp-test`

- [ ] **Step 3: Verify production was untouched**

Confirm the container is absent, port `3300` is unbound, the test image still exists, and the
production web container remains healthy.

### Task 4: Remediate dependency advisories

**Files:**
- Modify: `app/package.json`
- Modify: `package.json`
- Modify: `infra/package.json`
- Modify: every stable `services/*/package.json` that pins Prisma `7.4.1`
- Modify: `services/src/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: the audited package paths and Node.js 22 runtime.
- Produces: a frozen lockfile using Next `16.3.0`, PostCSS `8.5.26`, Prisma `7.9.1`, Nodemailer
  `9.0.5`, Firebase Admin `14.2.0`, Node Cron `4.6.0`, and patched transitive packages.

- [ ] **Step 1: Record the failing security baseline**

Run: `pnpm audit --audit-level moderate`

Expected: exit nonzero with 34 advisories: 11 high, 20 moderate, 3 low.

- [ ] **Step 2: Update only the approved direct dependencies and root overrides**

Apply exact versions from the design across all manifests. Add overrides for `postcss@8.5.26` and
only add `socket.io-parser@4.2.7` or `body-parser@1.20.6` if lock refresh alone remains vulnerable.

- [ ] **Step 3: Refresh and freeze the lockfile**

Run: `corepack pnpm install`

Run: `corepack pnpm install --frozen-lockfile`

Expected: both exit zero and no unapproved manifest changes appear.

- [ ] **Step 4: Run audit and resolve only remaining actionable paths**

Run: `corepack pnpm audit --audit-level moderate`

Expected target: zero advisories. If nonzero, inspect each path and add the narrowest compatible
override or document an unreachable advisory and its follow-up issue.

- [ ] **Step 5: Run scoped build and test validation**

Run app auth/CSP/deployment tests, shared tests, gateway tests, all stable service tests affected by
Prisma, Prisma generation, `pnpm smoke:coverage`, the Next production build, and
`docker compose ... config --quiet`. Record any unchanged legacy-only failure separately.

- [ ] **Step 6: Commit dependency remediation**

```bash
git add package.json pnpm-lock.yaml app/package.json infra/package.json services/*/package.json
git commit -m "fix(deps): remediate production security advisories"
```

### Task 5: Build, deploy, and verify updated production images

**Files:**
- Local ignored: `.env.vps.*` copied with mode `0600` into the security worktree.
- Runtime only: `workspace-*` images and `giro-office-production-*` containers.

**Interfaces:**
- Consumes: Task 4 commit, existing production env files, and transactional deploy scripts.
- Produces: healthy production images built from the security branch with CSP retained.

- [ ] **Step 1: Copy ignored production environment files safely**

Copy only `.env.vps.*` from the production deploy worktree, preserve mode `0600`, confirm they are
ignored, and never print values.

- [ ] **Step 2: Preserve rollback image IDs and validate Compose**

Capture current image IDs/tags, run Compose config/security tests, and confirm the external Caddy
networks resolve to existing network names.

- [ ] **Step 3: Build the updated images before replacement**

Use the production image tag and existing build-env loader. Build sequentially to respect VPS
resources. Do not recreate a service until every required image build succeeds.

- [ ] **Step 4: Execute transactional deployment**

Run the existing production deploy command, including Prisma migration deployment and endpoint
waiter. On failure after replacement, restore the captured image IDs through the existing rollback.

- [ ] **Step 5: Verify live security and function**

Run all official endpoint checks, public TLS/redirect/API checks, CSP header and browser console
checks, dummy invalid-login boundary expecting `401`, CORS allowed/denied origin checks, container
health, restart count, and error-log scans.

### Task 6: Publish milestone and nine detailed GitHub issues

**Files:**
- Create under `/tmp/giro-security-issues/`: nine Markdown issue bodies.

**Interfaces:**
- Consumes: approved design, verified code locations, GitHub repository `IA-Pessoas/giro-office`.
- Produces: milestone `Security Hardening - Q3 2026` and nine open issues attached to it.

- [ ] **Step 1: Restore GitHub authentication**

Run `gh auth login -h github.com --web` and wait for the operator to complete the device/browser
flow. Verify with `gh auth status` and `gh repo view IA-Pessoas/giro-office`.

- [ ] **Step 2: Create or reuse labels and milestone idempotently**

Ensure labels `security`, `hardening`, `frontend`, `backend`, `database`, and `infra` exist. Create
the milestone only if no open milestone with the exact title exists; set due date `2026-09-30`.

- [ ] **Step 3: Write nine issue bodies**

Each body must include evidence, impact, goal, scope, out of scope, concrete file map, codegen rules,
acceptance criteria, tests, rollout, observability, rollback, dependencies, and definition of done.

- [ ] **Step 4: Create issues idempotently**

Search exact titles first. Create only missing issues, attach milestone and labels, then fetch every
created issue to confirm title, body, labels, state, and milestone.

### Task 7: Finish branch, push, and open draft PR

**Files:**
- No new files unless verification reveals an in-scope defect.

**Interfaces:**
- Consumes: completed commits and GitHub authentication.
- Produces: pushed `fix/security-maintenance` and a draft stacked PR.

- [ ] **Step 1: Run fresh final verification**

Run `git diff --check`, frozen install, audit, scoped tests/builds, Compose validation, endpoint
waiter, public smoke, host firewall/SSH checks, production health, and issue/milestone verification.

- [ ] **Step 2: Review exact branch scope**

Compare `fix/security-maintenance` with `fix/csp-enforcement`; confirm only the security design,
host-hardening assets/tests, and dependency manifests/lockfile are included.

- [ ] **Step 3: Push and open the draft PR**

Push with tracking. Open a draft PR initially based on `fix/csp-enforcement`, explain PR #762 must
merge first, include audit before/after, runtime validation, host changes, rollback, and issue links.

- [ ] **Step 4: Report residual operator action accurately**

The only expected post-delivery action is validating a new external SSH connection as `debian`;
after that, root public-key login can be disabled in a separate controlled change.
