import { app, ipcMain } from "electron";
import { spawn, execFile } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type {
  AgentStatus,
  AddToAgentResult,
  GenerateKeyOpts,
  KeyListing,
  LoadedKey,
  SimpleResult,
  SshKey,
  SshOrgRule,
  WindowsServiceStatus,
} from "../../shared/ssh-types";

/**
 * Stateful agent environment. On Unix, when the user clicks "Start" we spawn
 * a fresh `ssh-agent -s` and capture SSH_AUTH_SOCK / SSH_AGENT_PID so subsequent
 * ssh-add invocations can find it. Windows uses a fixed named pipe so this
 * stays empty there.
 */
const agentEnvOverride: { SSH_AUTH_SOCK?: string; SSH_AGENT_PID?: string } = {};

function getSshDir(): string {
  return path.join(os.homedir(), ".ssh");
}

function isWindows(): boolean {
  return process.platform === "win32";
}

function envForSsh(): NodeJS.ProcessEnv {
  return { ...process.env, ...agentEnvOverride };
}

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/** Wrapper around child_process that returns code+stdout+stderr instead of throwing. */
function runCmd(
  cmd: string,
  args: string[],
  opts: {
    timeoutMs?: number;
    stdin?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: opts.env ?? envForSsh(),
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        resolve({ code: -1, stdout, stderr: stderr + "\n[timeout]" });
      }
    }, opts.timeoutMs ?? 10_000);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code: -1, stdout, stderr: stderr + String(err) });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code: code ?? -1, stdout, stderr });
    });

    if (opts.stdin !== undefined) {
      child.stdin.end(opts.stdin);
    }
  });
}

async function isToolAvailable(tool: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = isWindows() ? "where" : "which";
    execFile(probe, [tool], (err) => resolve(!err));
  });
}

/**
 * Probe agent state via `ssh-add -l`.
 * - exit 0  → agent reachable, has keys
 * - exit 1  → agent reachable, no keys (or locked)
 * - exit 2  → cannot connect to agent
 */
async function probeAgent(): Promise<{
  running: boolean;
  locked: boolean;
  loaded: LoadedKey[];
  loadedOrder: string[];
}> {
  const r = await runCmd("ssh-add", ["-l", "-E", "sha256"], { timeoutMs: 4000 });
  if (r.code === 2) {
    return { running: false, locked: false, loaded: [], loadedOrder: [] };
  }
  // "agent is locked" goes to stdout in some versions, stderr in others.
  const all = (r.stdout + "\n" + r.stderr).toLowerCase();
  const locked = all.includes("agent is locked");
  if (r.code === 1 || locked) {
    return { running: true, locked, loaded: [], loadedOrder: [] };
  }
  // Parse "<bits> <fingerprint> <comment...> (<algorithm>)"
  const loaded: LoadedKey[] = [];
  const order: string[] = [];
  for (const line of r.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s+(\S+)\s+(.*)\s+\(([^)]+)\)\s*$/);
    if (!match) continue;
    const bits = parseInt(match[1], 10);
    const fingerprint = match[2];
    const comment = match[3];
    const algorithm = match[4];
    loaded.push({ bits, fingerprint, comment, algorithm });
    order.push(fingerprint);
  }
  return { running: true, locked: false, loaded, loadedOrder: order };
}

async function getWindowsServiceInfo(): Promise<{
  available: boolean;
  status: WindowsServiceStatus;
  startType: string;
}> {
  if (!isWindows()) return { available: false, status: "Unknown", startType: "" };
  const r = await runCmd(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$s = Get-Service ssh-agent -ErrorAction SilentlyContinue; if ($s) { ConvertTo-Json @{ status = $s.Status.ToString(); startType = $s.StartType.ToString() } } else { 'NOT_FOUND' }",
    ],
    { timeoutMs: 5000 },
  );
  const out = r.stdout.trim();
  if (!out || out === "NOT_FOUND") {
    return { available: false, status: "Unknown", startType: "" };
  }
  try {
    const parsed = JSON.parse(out) as { status: string; startType: string };
    return {
      available: true,
      status: parsed.status as WindowsServiceStatus,
      startType: parsed.startType,
    };
  } catch {
    return { available: false, status: "Unknown", startType: "" };
  }
}

function narrowPlatform(): AgentStatus["platform"] {
  if (process.platform === "win32") return "win32";
  if (process.platform === "darwin") return "darwin";
  return "linux";
}

async function getAgentStatus(): Promise<AgentStatus> {
  const sshDir = getSshDir();
  const toolingAvailable = await isToolAvailable("ssh-add");
  const probe = toolingAvailable
    ? await probeAgent()
    : { running: false, locked: false };

  const env = envForSsh();
  const socket = isWindows()
    ? probe.running
      ? "\\\\.\\pipe\\openssh-ssh-agent"
      : null
    : (env.SSH_AUTH_SOCK ?? null);
  const pidStr = env.SSH_AGENT_PID;
  const pid = pidStr ? parseInt(pidStr, 10) : null;

  let windowsService: AgentStatus["windowsService"] | undefined;
  let note: string | undefined;

  if (isWindows()) {
    windowsService = await getWindowsServiceInfo();
    if (!windowsService.available) {
      note = "Windows OpenSSH agent service not installed";
    } else if (windowsService.startType === "Disabled") {
      note = "Service is disabled — start may fail until enabled";
    }
  }

  return {
    running: probe.running,
    locked: probe.locked,
    socket,
    pid: Number.isFinite(pid as number) ? (pid as number) : null,
    platform: narrowPlatform(),
    toolingAvailable,
    supportsReorder: !isWindows(),
    sshDir,
    windowsService,
    note,
  };
}

// ── Filesystem key discovery ──────────────────────────────────────────────────

const PUBLIC_KEY_TYPE_PATTERNS = [
  /^ssh-rsa/i,
  /^ssh-ed25519/i,
  /^ssh-dss/i,
  /^ecdsa-sha2-/i,
  /^sk-ssh-ed25519/i,
  /^sk-ecdsa-sha2-/i,
];

const SKIP_FILES = new Set([
  "config",
  "known_hosts",
  "known_hosts.old",
  "authorized_keys",
  "authorized_keys2",
  "environment",
  "rc",
]);

function looksLikePublicKey(content: string): boolean {
  const firstLine = content.split("\n", 1)[0]?.trim() ?? "";
  return PUBLIC_KEY_TYPE_PATTERNS.some((p) => p.test(firstLine));
}

function looksLikePrivateKey(content: string): boolean {
  const head = content.slice(0, 200);
  return /-----BEGIN (?:OPENSSH|RSA|DSA|EC|ENCRYPTED) PRIVATE KEY-----/.test(
    head,
  );
}

function isPrivateKeyEncrypted(content: string): boolean {
  // OpenSSH format: encryption shows up in the binary blob — best-effort check is
  // the presence of a non-"none" cipher in plain RSA/DSA PEM. For OpenSSH format
  // (most common today) we look for the "Proc-Type: 4,ENCRYPTED" header (PEM)
  // or "DEK-Info" (PEM-encrypted RSA/DSA), and for openssh-format keys we just
  // run `ssh-keygen -y -P "" -f <path>` and check for a passphrase prompt. To
  // avoid spawning processes per key, do a header scan first.
  if (/Proc-Type:\s*4,ENCRYPTED/i.test(content)) return true;
  if (/DEK-Info:/i.test(content)) return true;
  // OpenSSH format uses base64 — the cipher name appears decoded inside the
  // blob. A reasonable heuristic: encrypted OpenSSH keys are noticeably longer
  // and contain "bcrypt" once decoded. We'll check the decoded prefix.
  const m = content.match(
    /-----BEGIN OPENSSH PRIVATE KEY-----\s*([\s\S]*?)\s*-----END OPENSSH PRIVATE KEY-----/,
  );
  if (m) {
    try {
      const decoded = Buffer.from(m[1].replace(/\s+/g, ""), "base64").toString(
        "binary",
      );
      // The cipher field follows the magic "openssh-key-v1\0". If it's "none"
      // the key is unencrypted.
      const idx = decoded.indexOf("openssh-key-v1\0");
      if (idx >= 0) {
        // After magic comes a uint32 length + cipher name string.
        const after = decoded.slice(idx + "openssh-key-v1\0".length);
        // First 4 bytes = cipher name length (big-endian)
        const len =
          (after.charCodeAt(0) << 24) |
          (after.charCodeAt(1) << 16) |
          (after.charCodeAt(2) << 8) |
          after.charCodeAt(3);
        const cipher = after.slice(4, 4 + len);
        return cipher !== "none";
      }
    } catch {
      // fall through
    }
  }
  return false;
}

async function parsePublicKey(
  publicPath: string,
): Promise<{ algorithm: string; bits: number; fingerprint: string; comment: string } | null> {
  const r = await runCmd("ssh-keygen", ["-l", "-E", "sha256", "-f", publicPath], {
    timeoutMs: 4000,
  });
  if (r.code !== 0) return null;
  // Format: "<bits> <fingerprint> <comment...> (<TYPE>)"
  const trimmed = r.stdout.trim();
  const match = trimmed.match(/^(\d+)\s+(\S+)\s+(.*)\s+\(([^)]+)\)\s*$/);
  if (!match) return null;
  return {
    bits: parseInt(match[1], 10),
    fingerprint: match[2],
    comment: match[3],
    algorithm: match[4],
  };
}

async function listKeysOnDisk(): Promise<SshKey[]> {
  const sshDir = getSshDir();
  let entries: string[];
  try {
    entries = await fsp.readdir(sshDir);
  } catch {
    return [];
  }

  // Pair up <name> and <name>.pub. Keys with only a .pub or only a private file
  // are still surfaced — common when the user copies just one half over.
  type Pair = { privatePath: string | null; publicPath: string | null };
  const pairs = new Map<string, Pair>();

  for (const entry of entries) {
    if (SKIP_FILES.has(entry.toLowerCase())) continue;
    if (entry.startsWith(".")) continue;
    const full = path.join(sshDir, entry);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    const isPub = entry.toLowerCase().endsWith(".pub");
    const baseName = isPub ? entry.slice(0, -4) : entry;

    let content: string;
    try {
      content = await fsp.readFile(full, "utf-8");
    } catch {
      continue;
    }

    if (isPub) {
      if (!looksLikePublicKey(content)) continue;
      const pair = pairs.get(baseName) ?? { privatePath: null, publicPath: null };
      pair.publicPath = full;
      pairs.set(baseName, pair);
    } else {
      if (!looksLikePrivateKey(content)) continue;
      const pair = pairs.get(baseName) ?? { privatePath: null, publicPath: null };
      pair.privatePath = full;
      pairs.set(baseName, pair);
    }
  }

  const keys: SshKey[] = [];
  for (const [name, pair] of pairs) {
    let algorithm = "unknown";
    let bits = 0;
    let fingerprint = "";
    let comment = "";

    if (pair.publicPath) {
      const parsed = await parsePublicKey(pair.publicPath);
      if (parsed) {
        algorithm = parsed.algorithm;
        bits = parsed.bits;
        fingerprint = parsed.fingerprint;
        comment = parsed.comment;
      }
    } else if (pair.privatePath) {
      // Try to derive the public key from the private key non-destructively
      // (ssh-keygen -y prints it on stdout). With "-P ''" we only succeed if
      // unencrypted; otherwise we accept that we can't fingerprint.
      const r = await runCmd(
        "ssh-keygen",
        ["-y", "-P", "", "-f", pair.privatePath],
        { timeoutMs: 4000 },
      );
      if (r.code === 0 && r.stdout.trim()) {
        // Write to a temp file for ssh-keygen -lf
        const tmp = path.join(os.tmpdir(), `commiq-ssh-${Date.now()}.pub`);
        try {
          await fsp.writeFile(tmp, r.stdout, { mode: 0o600 });
          const parsed = await parsePublicKey(tmp);
          if (parsed) {
            algorithm = parsed.algorithm;
            bits = parsed.bits;
            fingerprint = parsed.fingerprint;
            comment = parsed.comment;
          }
        } finally {
          try {
            await fsp.unlink(tmp);
          } catch {
            /* ignore */
          }
        }
      }
    }

    let encrypted = false;
    if (pair.privatePath) {
      try {
        const content = await fsp.readFile(pair.privatePath, "utf-8");
        encrypted = isPrivateKeyEncrypted(content);
      } catch {
        /* ignore */
      }
    }

    keys.push({
      name,
      privatePath: pair.privatePath,
      publicPath: pair.publicPath,
      algorithm,
      bits,
      fingerprint,
      comment,
      encrypted,
      hasPrivate: pair.privatePath !== null,
      hasPublic: pair.publicPath !== null,
    });
  }

  // Stable sort: keys with private first, then by name
  keys.sort((a, b) => {
    if (a.hasPrivate !== b.hasPrivate) return a.hasPrivate ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return keys;
}

// ── Passphrase handling ───────────────────────────────────────────────────────

/**
 * Write a temp askpass helper script (.cmd on Windows, .sh elsewhere). When
 * `passFile` is provided, the script prints the file contents (the passphrase);
 * when null, the script exits non-zero so ssh-add gives up immediately instead
 * of falling back to a tty read (which hangs in headless / Electron child
 * processes — particularly on Windows OpenSSH).
 *
 * Returns the path to the script and the temp dir to clean up.
 */
async function writeAskpassScript(
  passFile: string | null,
): Promise<{ askpassFile: string; tmpDir: string }> {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "commiq-ssh-"));
  let askpassFile: string;
  if (isWindows()) {
    askpassFile = path.join(tmpDir, "askpass.cmd");
    if (passFile) {
      // `type` dumps the file as-is. We avoid `for /f` + `echo` because echo
      // mangles trailing whitespace and reinterprets `&`, `^`, `%`, `|` etc.
      // The pass file is written with a trailing newline so ssh-add gets a
      // properly terminated line on stdout.
      await fsp.writeFile(
        askpassFile,
        `@echo off\r\ntype "${passFile}"\r\n`,
      );
    } else {
      await fsp.writeFile(askpassFile, `@echo off\r\nexit /b 1\r\n`);
    }
  } else {
    askpassFile = path.join(tmpDir, "askpass.sh");
    if (passFile) {
      await fsp.writeFile(askpassFile, `#!/bin/sh\ncat "${passFile}"\n`, {
        mode: 0o700,
      });
    } else {
      await fsp.writeFile(askpassFile, `#!/bin/sh\nexit 1\n`, { mode: 0o700 });
    }
  }
  return { askpassFile, tmpDir };
}

/**
 * Run `ssh-add` with a forced askpass mechanism. If `passphrase` is undefined
 * the askpass script exits 1, so encrypted keys fail fast with a recognizable
 * error instead of blocking on a tty/console prompt.
 *
 * Requires OpenSSH 8.4+ for `SSH_ASKPASS_REQUIRE=force`; older builds will
 * still try /dev/tty first, so we additionally close stdin and clear DISPLAY
 * sentinel handling — see env below.
 */
async function runSshAdd(
  args: string[],
  passphrase: string | undefined,
  timeoutMs = 10_000,
): Promise<RunResult> {
  let passFile: string | null = null;
  let cleanupPassDir: string | null = null;
  if (passphrase !== undefined) {
    cleanupPassDir = await fsp.mkdtemp(path.join(os.tmpdir(), "commiq-pass-"));
    passFile = path.join(cleanupPassDir, "pass");
    // Trailing newline so the askpass script's stdout is properly terminated;
    // ssh-add reads askpass output line-by-line and expects \n.
    await fsp.writeFile(passFile, passphrase + "\n", { mode: 0o600 });
  }

  const { askpassFile, tmpDir } = await writeAskpassScript(passFile);

  const env: NodeJS.ProcessEnv = {
    ...envForSsh(),
    SSH_ASKPASS: askpassFile,
    SSH_ASKPASS_REQUIRE: "force",
    // Set DISPLAY so older OpenSSH variants will go through askpass even
    // without SSH_ASKPASS_REQUIRE support. Value doesn't need to point at a
    // real X server.
    DISPLAY: process.env.DISPLAY ?? ":0",
  };

  try {
    return await runCmd("ssh-add", args, { env, timeoutMs, stdin: "" });
  } finally {
    for (const d of [tmpDir, cleanupPassDir]) {
      if (!d) continue;
      try {
        await fsp.rm(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

// ── IPC registration ──────────────────────────────────────────────────────────

export function registerSshIpc(): void {
  ipcMain.handle("ssh:status", async (): Promise<AgentStatus> => {
    return getAgentStatus();
  });

  ipcMain.handle("ssh:list-keys", async (): Promise<KeyListing> => {
    const status = await getAgentStatus();
    if (!status.toolingAvailable) {
      return { status, keys: [], loaded: [], loadedOrder: [] };
    }
    const [keys, probe] = await Promise.all([listKeysOnDisk(), probeAgent()]);
    return {
      status: { ...status, running: probe.running, locked: probe.locked },
      keys,
      loaded: probe.loaded,
      loadedOrder: probe.loadedOrder,
    };
  });

  ipcMain.handle(
    "ssh:agent:start",
    async (): Promise<SimpleResult> => {
      try {
        if (isWindows()) {
          // Try to enable + start the service. Requires admin; surface error if not.
          const r = await runCmd(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              "try { $s = Get-Service ssh-agent -ErrorAction Stop; if ($s.StartType -eq 'Disabled') { Set-Service ssh-agent -StartupType Manual }; Start-Service ssh-agent; 'OK' } catch { 'ERR:' + $_.Exception.Message }",
            ],
            { timeoutMs: 15_000 },
          );
          const out = r.stdout.trim();
          if (out === "OK") return { success: true };
          const msg = out.startsWith("ERR:")
            ? out.slice(4)
            : r.stderr || "Failed to start service";
          return {
            success: false,
            error: msg.includes("Access is denied")
              ? "Access denied — run the app as Administrator to start the ssh-agent service."
              : msg,
          };
        }

        // Unix: spawn ssh-agent -s and parse the eval output. Using a fixed
        // socket path makes it easier for the user to share with terminals
        // (they can `export SSH_AUTH_SOCK=...`).
        const sockDir = await fsp.mkdtemp(
          path.join(os.tmpdir(), "commiq-ssh-agent-"),
        );
        const sockPath = path.join(sockDir, "agent.sock");
        const r = await runCmd("ssh-agent", ["-a", sockPath, "-s"], {
          timeoutMs: 5000,
        });
        if (r.code !== 0) {
          return { success: false, error: r.stderr || "ssh-agent failed to start" };
        }
        // Parse `SSH_AUTH_SOCK=...; export SSH_AUTH_SOCK; SSH_AGENT_PID=...; export SSH_AGENT_PID;`
        const sockMatch = r.stdout.match(/SSH_AUTH_SOCK=([^;]+);/);
        const pidMatch = r.stdout.match(/SSH_AGENT_PID=([^;]+);/);
        if (sockMatch) agentEnvOverride.SSH_AUTH_SOCK = sockMatch[1];
        if (pidMatch) agentEnvOverride.SSH_AGENT_PID = pidMatch[1];
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle("ssh:agent:stop", async (): Promise<SimpleResult> => {
    try {
      if (isWindows()) {
        const r = await runCmd(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "try { Stop-Service ssh-agent -ErrorAction Stop; 'OK' } catch { 'ERR:' + $_.Exception.Message }",
          ],
          { timeoutMs: 10_000 },
        );
        const out = r.stdout.trim();
        if (out === "OK") return { success: true };
        const msg = out.startsWith("ERR:")
          ? out.slice(4)
          : r.stderr || "Failed to stop service";
        return {
          success: false,
          error: msg.includes("Access is denied")
            ? "Access denied — run the app as Administrator to stop the ssh-agent service."
            : msg,
        };
      }

      const r = await runCmd("ssh-agent", ["-k"], { timeoutMs: 5000 });
      // ssh-agent -k uses SSH_AGENT_PID from env; if successful, clear our overrides.
      if (r.code === 0) {
        delete agentEnvOverride.SSH_AUTH_SOCK;
        delete agentEnvOverride.SSH_AGENT_PID;
        return { success: true };
      }
      return { success: false, error: r.stderr || "ssh-agent -k failed" };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(
    "ssh:agent:add",
    async (
      _e,
      keyPath: string,
      passphrase?: string,
    ): Promise<AddToAgentResult> => {
      try {
        // Always go through SSH_ASKPASS — when no passphrase is supplied the
        // helper exits 1, so encrypted keys fail fast with a recognizable error
        // instead of blocking on a tty prompt. Unencrypted keys never invoke
        // askpass and succeed immediately.
        const r = await runSshAdd([keyPath], passphrase, 8000);
        if (r.code === 0) return { success: true };
        const blob = (r.stdout + " " + r.stderr).toLowerCase();
        const looksLikePassphraseIssue =
          blob.includes("passphrase") ||
          blob.includes("incorrect") ||
          blob.includes("bad passphrase") ||
          // OpenSSH on some platforms says "no identities" or just exits 1
          // without a clear message when askpass refuses.
          (passphrase === undefined && r.code === 1);
        if (looksLikePassphraseIssue) {
          return {
            success: false,
            needsPassphrase: true,
            error: passphrase ? "Incorrect passphrase" : "Key is passphrase-protected",
          };
        }
        return { success: false, error: r.stderr || r.stdout || "ssh-add failed" };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    "ssh:agent:remove",
    async (_e, keyPath: string): Promise<SimpleResult> => {
      const r = await runCmd("ssh-add", ["-d", keyPath], { timeoutMs: 5000 });
      if (r.code === 0) return { success: true };
      return { success: false, error: r.stderr || r.stdout || "ssh-add -d failed" };
    },
  );

  ipcMain.handle(
    "ssh:agent:remove-all",
    async (): Promise<SimpleResult> => {
      const r = await runCmd("ssh-add", ["-D"], { timeoutMs: 5000 });
      if (r.code === 0) return { success: true };
      return { success: false, error: r.stderr || r.stdout || "ssh-add -D failed" };
    },
  );

  ipcMain.handle(
    "ssh:agent:lock",
    async (_e, passphrase: string): Promise<SimpleResult> => {
      const r = await runSshAdd(["-x"], passphrase, 5000);
      if (r.code === 0) return { success: true };
      return { success: false, error: r.stderr || r.stdout || "ssh-add -x failed" };
    },
  );

  ipcMain.handle(
    "ssh:agent:unlock",
    async (_e, passphrase: string): Promise<SimpleResult> => {
      const r = await runSshAdd(["-X"], passphrase, 5000);
      if (r.code === 0) return { success: true };
      return { success: false, error: r.stderr || r.stdout || "ssh-add -X failed" };
    },
  );

  /**
   * Reorder keys in the agent: clear the agent, then re-add in the requested
   * order. Only supported where the agent honors insertion order (Linux/macOS).
   * Windows OpenSSH persists keys to the registry and lists them alphabetically
   * by fingerprint, so reorder cannot work there.
   */
  ipcMain.handle(
    "ssh:agent:reorder",
    async (
      _e,
      orderedPaths: string[],
      passphrases: Record<string, string>,
    ): Promise<SimpleResult> => {
      if (isWindows()) {
        return {
          success: false,
          error:
            "Windows ssh-agent stores keys in the registry and lists them in a fixed order — reorder is not possible. Use ~/.ssh/config IdentityFile entries for connection priority.",
        };
      }
      try {
        const removeRes = await runCmd("ssh-add", ["-D"], { timeoutMs: 5000 });
        if (removeRes.code !== 0) {
          return {
            success: false,
            error: `ssh-add -D failed: ${removeRes.stderr.trim() || "no output"}`,
          };
        }
        const failures: string[] = [];
        for (const p of orderedPaths) {
          const r = await runSshAdd([p], passphrases[p], 8000);
          if (r.code !== 0) {
            const msg = (r.stderr.trim() || r.stdout.trim() || "ssh-add failed")
              .replace(/[\r\n]+/g, " ");
            failures.push(`${path.basename(p)}: ${msg}`);
          }
        }
        if (failures.length > 0) {
          return {
            success: false,
            error: `Reorder partially applied: ${failures.join("; ")}`,
          };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    "ssh:keys:generate",
    async (_e, opts: GenerateKeyOpts): Promise<SimpleResult & { path?: string }> => {
      try {
        const sshDir = getSshDir();
        try {
          await fsp.mkdir(sshDir, { recursive: true, mode: 0o700 });
        } catch {
          /* ignore */
        }
        const target = path.join(sshDir, opts.filename);
        // Refuse to overwrite an existing key
        if (fs.existsSync(target)) {
          return { success: false, error: `File already exists: ${target}` };
        }

        const args: string[] = ["-q", "-t", opts.type];
        if (opts.type === "rsa") {
          args.push("-b", String(opts.bits ?? 4096));
        } else if (opts.type === "ecdsa") {
          args.push("-b", String(opts.bits ?? 256));
        }
        args.push("-f", target, "-C", opts.comment, "-N", opts.passphrase);

        const r = await runCmd("ssh-keygen", args, { timeoutMs: 30_000 });
        if (r.code !== 0) {
          return { success: false, error: r.stderr || r.stdout || "ssh-keygen failed" };
        }
        return { success: true, path: target };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    "ssh:keys:delete",
    async (_e, name: string): Promise<SimpleResult> => {
      try {
        const sshDir = getSshDir();
        // Guard against path traversal — name must not contain separators
        if (name.includes("/") || name.includes("\\") || name.includes("..")) {
          return { success: false, error: "Invalid key name" };
        }
        const priv = path.join(sshDir, name);
        const pub = priv + ".pub";
        let removed = 0;
        for (const p of [priv, pub]) {
          try {
            await fsp.unlink(p);
            removed++;
          } catch {
            /* ignore — may not exist */
          }
        }
        if (removed === 0) {
          return { success: false, error: "No matching key files found" };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    "ssh:keys:read-public",
    async (
      _e,
      publicPath: string,
    ): Promise<{ content: string } | { error: string }> => {
      try {
        const content = await fsp.readFile(publicPath, "utf-8");
        return { content };
      } catch (err) {
        return { error: String(err) };
      }
    },
  );

  // ── Smart-paste org rules ─────────────────────────────────────────────────

  const rulesFilePath = (): string =>
    path.join(app.getPath("userData"), "ssh-org-rules.json");

  ipcMain.handle("ssh:rules:list", async (): Promise<SshOrgRule[]> => {
    try {
      const content = await fsp.readFile(rulesFilePath(), "utf-8");
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (r): r is SshOrgRule =>
          r &&
          typeof r.id === "string" &&
          typeof r.pattern === "string" &&
          typeof r.keyName === "string",
      );
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    "ssh:rules:save",
    async (_e, rules: SshOrgRule[]): Promise<SimpleResult> => {
      try {
        await fsp.writeFile(
          rulesFilePath(),
          JSON.stringify(rules, null, 2),
          "utf-8",
        );
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );
}
