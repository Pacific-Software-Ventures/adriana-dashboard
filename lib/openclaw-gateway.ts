/**
 * OpenClaw Gateway client — sends messages to agents via the Gateway's
 * REST API (POST /hooks/agent) or the `openclaw agent` CLI.
 *
 * The Gateway binds to 127.0.0.1 on the EC2 instance, so we reach it
 * through SSM → shell → curl (or the openclaw CLI which connects to
 * the gateway automatically when running on the same host).
 *
 * Flow:
 *   1. Try `openclaw --profile {name} agent --message "..." --json`
 *      (uses the Gateway automatically)
 *   2. If that fails, fall back to `docker exec` inside the container
 */

import { sshExecLong } from './ssh';
import { containerName } from './agent-paths';

const DEFAULT_TIMEOUT_MS = 120_000;

// ── Agent-to-profile mapping ─────────────────────────────────────────
// Some dashboard agent names don't map 1:1 to openclaw profiles.
// 360ca is a sub-agent that runs inside Zoe's profile/container.

interface AgentProfile {
  /** The openclaw --profile value. Empty string = default profile. */
  profile: string;
  /** The --agent flag value to route to a specific sub-agent, if any. */
  agentId?: string;
}

/**
 * Resolve a dashboard agent name to its openclaw profile and agent ID.
 *
 * - Most agents: profile = agent name, agentId = "main"
 * - gaia: default profile (no --profile flag), agentId = "main"
 * - 360ca: runs on zoe's profile with agentId "360ca"
 */
function resolveAgent(name: string): AgentProfile {
  switch (name) {
    case 'gaia':
      return { profile: 'gaia', agentId: 'main' };
    case '360ca':
      return { profile: 'zoe', agentId: '360ca' };
    default:
      return { profile: name, agentId: 'main' };
  }
}

// ── Shell escaping ───────────────────────────────────────────────────

/**
 * Escape a string for safe inclusion inside single quotes in a shell command.
 * This is the ONLY safe way to pass arbitrary user input to shell commands.
 */
function shellEscape(str: string): string {
  // Replace every ' with '\'' (end quote, escaped quote, start quote)
  return str.replace(/'/g, "'\\''");
}

// ── Gateway client ───────────────────────────────────────────────────

export interface GatewayResponse {
  reply: string;
  method: 'gateway-cli' | 'docker-exec-fallback';
  metadata?: Record<string, unknown>;
}

/**
 * Send a message to an agent and get a response.
 *
 * Tries the OpenClaw CLI (which routes through the Gateway) first,
 * then falls back to docker exec as a last resort.
 */
export async function sendAgentMessage(
  agentName: string,
  message: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<GatewayResponse> {
  try {
    const result = await sendViaGatewayCLI(agentName, message, timeoutMs);
    if (result) return result;
  } catch (err) {
    console.error(
      `[openclaw-gateway] agent-chat.sh failed for ${agentName}:`,
      err instanceof Error ? err.message : err
    );
  }

  // Try docker exec as fallback
  try {
    const fallback = await sendViaDockerExec(agentName, message, timeoutMs);
    if (fallback) return fallback;
  } catch (err) {
    console.error(
      `[openclaw-gateway] docker-exec fallback failed for ${agentName}:`,
      err instanceof Error ? err.message : err
    );
  }

  return { reply: '', method: 'gateway-cli' };
}

/**
 * Send a message using the openclaw CLI inside the agent's Docker container.
 *
 * The CLI connects to the Gateway running inside the same container.
 * Response format with --json:
 *   { "reply": "...", "metadata": { "session_id": "...", "tokens": N } }
 */
async function sendViaGatewayCLI(
  agentName: string,
  message: string,
  timeoutMs: number
): Promise<GatewayResponse | null> {
  const { profile, agentId } = resolveAgent(agentName);
  const cn = containerName(profile || agentName);
  const escaped = shellEscape(message);

  // Use the agent-chat.sh wrapper on EC2 which:
  // 1. Runs openclaw agent inside the container
  // 2. Captures JSON output to a temp file (avoids pipe buffering issues)
  // 3. Extracts just the reply text via extract-reply.py
  // This avoids SSM output truncation from the massive --json metadata dump.
  const cmd = `/usr/local/bin/agent-chat.sh ${cn} ${agentId || 'main'} '${escaped}'`;

  const raw = await sshExecLong(cmd, timeoutMs);
  const trimmed = raw.trim();

  if (!trimmed || trimmed.startsWith('AGENT_ERROR:')) {
    console.warn(`[openclaw-gateway] agent-chat.sh returned: ${trimmed || '(empty)'}`);
    return null;
  }

  return { reply: stripPluginNoise(trimmed), method: 'gateway-cli' };
}

/**
 * Strip OpenClaw plugin initialization log lines from agent output.
 * These are [plugins], [foundry], [gateway], etc. lines that leak into stdout.
 */
function stripPluginNoise(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return !(
        t.startsWith('[plugins]') ||
        t.startsWith('[foundry]') ||
        t.startsWith('[gateway]') ||
        t.startsWith('[hooks]') ||
        t.startsWith('[channels]') ||
        t.startsWith('[cron]') ||
        t.startsWith('[skills]') ||
        t.startsWith('[agents]')
      );
    })
    .join('\n')
    .trim();
}

/**
 * Fallback: run openclaw inside the docker container with --local.
 * This bypasses the gateway but still works if the gateway is down.
 */
async function sendViaDockerExec(
  agentName: string,
  message: string,
  timeoutMs: number
): Promise<GatewayResponse | null> {
  // Same as CLI method — agent-chat.sh handles both cases
  const { profile, agentId } = resolveAgent(agentName);
  const cn = containerName(profile || agentName);
  const escaped = shellEscape(message);

  const cmd = `/usr/local/bin/agent-chat.sh ${cn} ${agentId || 'main'} '${escaped}'`;

  const raw = await sshExecLong(cmd, timeoutMs);
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('AGENT_ERROR:')) return null;

  return { reply: stripPluginNoise(trimmed), method: 'docker-exec-fallback' };
}

/**
 * Recursively search a JSON object for a meaningful text field.
 * Checks common field names first, then recurses.
 */
function deepFindText(obj: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  if (typeof obj === 'string' && obj.length > 10) return obj;
  if (typeof obj !== 'object' || obj === null) return null;

  if (!Array.isArray(obj)) {
    const record = obj as Record<string, unknown>;
    // Check common response field names in priority order
    for (const key of ['reply', 'text', 'content', 'message', 'response', 'output']) {
      if (key in record && typeof record[key] === 'string' && (record[key] as string).length > 3) {
        return record[key] as string;
      }
    }
    for (const val of Object.values(record)) {
      const found = deepFindText(val, depth + 1);
      if (found) return found;
    }
  } else {
    for (const item of obj) {
      const found = deepFindText(item, depth + 1);
      if (found) return found;
    }
  }

  return null;
}
