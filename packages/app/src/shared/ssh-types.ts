// Shared SSH types — imported by both main process (ipc/ssh.ts) and renderer (SshPanel.tsx)

export type AgentPlatform = "win32" | "darwin" | "linux";

export type WindowsServiceStatus =
  | "Running"
  | "Stopped"
  | "StartPending"
  | "StopPending"
  | "Paused"
  | "ContinuePending"
  | "PausePending"
  | "Unknown";

export type AgentStatus = {
  /** Whether `ssh-add -l` can talk to an agent */
  running: boolean;
  /** Whether the agent is currently locked via `ssh-add -x` */
  locked: boolean;
  /** SSH_AUTH_SOCK or named pipe being used */
  socket: string | null;
  /** SSH_AGENT_PID, if known */
  pid: number | null;
  platform: AgentPlatform;
  /** True when ssh-add / ssh-keygen are available on PATH */
  toolingAvailable: boolean;
  /**
   * Whether the agent honors insertion order. Windows OpenSSH stores keys in
   * the registry and returns them sorted alphabetically by fingerprint, so
   * `ssh-add -D` + re-add cannot reorder the listing. Linux/macOS are FIFO and
   * support reorder.
   */
  supportsReorder: boolean;
  /** Path to ~/.ssh */
  sshDir: string;
  /** Windows ssh-agent service info (Windows only) */
  windowsService?: {
    available: boolean;
    status: WindowsServiceStatus;
    startType: string;
  };
  /** Free-form note from the platform check (e.g. "service disabled") */
  note?: string;
};

export type SshKey = {
  /** Logical key name — derived from filename, e.g. "id_ed25519" */
  name: string;
  /** Absolute path to the private key file (if present on disk) */
  privatePath: string | null;
  /** Absolute path to the public key file (if present on disk) */
  publicPath: string | null;
  /** Public-key algorithm string from ssh-keygen, e.g. "ED25519", "RSA", "ECDSA", "DSA" */
  algorithm: string;
  /** Bit size from ssh-keygen */
  bits: number;
  /** SHA256 fingerprint, e.g. "SHA256:abc123..." */
  fingerprint: string;
  /** User comment / label baked into the public key */
  comment: string;
  /** True when the private key file is encrypted with a passphrase */
  encrypted: boolean;
  /** True when a private key file is on disk (not just a .pub) */
  hasPrivate: boolean;
  /** True when a .pub file is on disk */
  hasPublic: boolean;
};

export type LoadedKey = {
  fingerprint: string;
  algorithm: string;
  bits: number;
  comment: string;
};

export type KeyListing = {
  status: AgentStatus;
  keys: SshKey[];
  loaded: LoadedKey[];
  /** Order — fingerprints in the order ssh-add -l returned them */
  loadedOrder: string[];
};

export type GenerateKeyOpts = {
  type: "ed25519" | "rsa" | "ecdsa";
  /** Required for rsa (e.g. 4096) and ecdsa (256/384/521) */
  bits?: number;
  /** Filename without extension, e.g. "id_ed25519_work" */
  filename: string;
  comment: string;
  /** Empty string means no passphrase */
  passphrase: string;
};

export type SimpleResult =
  | { success: true }
  | { success: false; error: string };

export type AddToAgentResult =
  | { success: true }
  | { success: false; needsPassphrase: true; error: string }
  | { success: false; error: string };

/**
 * A "smart paste" rule. When the user pastes a git command containing a URL
 * matching `pattern`, the panel rewrites the command with a `GIT_SSH_COMMAND`
 * prefix that uses the named key.
 *
 * Pattern syntax:
 *   - `host`            — any owner on that host (e.g., `github.com`)
 *   - `host:owner`      — that exact host+owner (e.g., `github.com:my-work`)
 *   - `*` is a glob     — e.g., `*.example.com`, `github.com:work-*`
 *
 * Rules are evaluated in array order; first match wins. The user can reorder
 * to control specificity.
 */
export type SshOrgRule = {
  id: string;
  pattern: string;
  /** SshKey.name — the on-disk filename (without .pub). */
  keyName: string;
};
