/**
 * Centralized path and service helpers for the OpenClaw fleet on AWS EC2 + Docker.
 *
 * Host paths:     /srv/openclaw/profiles/{name}/
 * Shared paths:   /srv/openclaw/shared/shared-knowledge/
 * Container names: openclaw-{name}
 */

// ── Host filesystem paths ──────────────────────────────────────────────

/** Agent profile directory on the EC2 host filesystem */
export function agentDir(name: string): string {
  return `/srv/openclaw/profiles/${name}`;
}

/** Gaia's actual agent profile directory */
export const GAIA_DIR = '/srv/openclaw/profiles/gaia';

/** Shared knowledge directory on the host */
export const SHARED_KNOWLEDGE_DIR = '/srv/openclaw/shared/shared-knowledge';

/** Shared skills directory on the host */
export const SHARED_SKILLS_DIR = '/srv/openclaw/shared/shared-skills';

// ── Docker container helpers ───────────────────────────────────────────

/** Docker container name for an agent */
export function containerName(name: string): string {
  return `openclaw-${name}`;
}

/**
 * Check if an agent's container is running.
 * Returns a shell command whose output is 'active' (running) or 'inactive'.
 * This normalizes Docker status to match the old systemctl vocabulary.
 */
export function statusCommand(name: string): string {
  const cn = containerName(name);
  return `docker inspect -f '{{.State.Status}}' ${cn} 2>/dev/null | sed 's/running/active/;s/exited/inactive/;s/created/inactive/' || echo inactive`;
}

/**
 * Get recent container logs.
 * Returns a shell command whose output matches the old journalctl format.
 */
export function logsCommand(name: string, lines: number): string {
  return `docker logs --tail ${lines} ${containerName(name)} 2>&1`;
}

/**
 * Get the last activity timestamp (unix epoch) from container logs.
 */
export function lastActiveCommand(name: string): string {
  return `docker logs --tail 1 ${containerName(name)} 2>&1 | awk '{print $1}' | grep -oP '^\\d{4}-\\d{2}-\\d{2}' | head -1 | xargs -I{} date -d {} +%s 2>/dev/null || echo ""`;
}

/**
 * Restart a container.
 */
export function restartCommand(name: string): string {
  return `docker restart ${containerName(name)}`;
}

/**
 * Stop a container.
 */
export function stopCommand(name: string): string {
  return `docker stop ${containerName(name)}`;
}

/**
 * Check container health status.
 * Returns 'healthy', 'unhealthy', 'starting', or 'none'.
 */
export function healthCommand(name: string): string {
  return `docker inspect -f '{{.State.Health.Status}}' ${containerName(name)} 2>/dev/null || echo none`;
}

// ── Name validation ────────────────────────────────────────────────────

export function validateName(name: string): string | null {
  const safeName = name.replace(/[^a-z0-9_-]/g, '');
  if (safeName !== name || safeName.length === 0) return null;
  if (safeName.length > 64) return null;
  return safeName;
}
