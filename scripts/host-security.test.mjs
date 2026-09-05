import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDirectory = path.join(repositoryRoot, "scripts", "ops", "host-security");

async function readAsset(name) {
  return readFile(path.join(assetDirectory, name), "utf8");
}

test("Docker forwarding firewall is scoped and idempotent", async () => {
  const script = await readAsset("apply-docker-forward-firewall.sh");

  assert.match(script, /ip route show default/);
  assert.match(script, /DOCKER-USER/);
  assert.match(script, /GIRO-HOST-FILTER/);
  assert.match(script, /--dports 80,443/);
  assert.match(script, /--ctstate RELATED,ESTABLISHED/);
  assert.match(script, /-F "\$\{CHAIN\}"/);
  assert.doesNotMatch(script, /-F DOCKER-USER/);
  assert.doesNotMatch(script, /-F (INPUT|OUTPUT|FORWARD)/);
});

test("systemd unit waits for Docker and installs the dedicated chain", async () => {
  const unit = await readAsset("docker-forward-firewall.service");

  assert.match(unit, /After=network-online\.target docker\.service/);
  assert.match(unit, /Requires=docker\.service/);
  assert.match(unit, /ExecStart=\/usr\/local\/sbin\/apply-giro-docker-firewall/);
  assert.match(unit, /RemainAfterExit=yes/);
});

test("OpenSSH configuration keeps public-key fallback and rejects passwords", async () => {
  const config = await readAsset("sshd-hardening.conf");

  assert.match(config, /^PasswordAuthentication no$/m);
  assert.match(config, /^KbdInteractiveAuthentication no$/m);
  assert.match(config, /^PermitRootLogin prohibit-password$/m);
  assert.match(config, /^PubkeyAuthentication yes$/m);
  assert.match(config, /^X11Forwarding no$/m);
  assert.match(config, /^MaxAuthTries 3$/m);
});

test("Fail2ban protects SSH with the approved thresholds", async () => {
  const config = await readAsset("jail.local");

  assert.match(config, /^\[sshd\]$/m);
  assert.match(config, /^enabled\s*=\s*true$/m);
  assert.match(config, /^backend\s*=\s*systemd$/m);
  assert.match(config, /^maxretry\s*=\s*3$/m);
  assert.match(config, /^findtime\s*=\s*10m$/m);
  assert.match(config, /^bantime\s*=\s*1h$/m);
});
