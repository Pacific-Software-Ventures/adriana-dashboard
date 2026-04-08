export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest } from 'next/server';
import {
  verifyDashboardToken,
  DASHBOARD_COOKIE_NAME,
} from '@/lib/dashboard-auth';
import { sshExec } from '@/lib/ssh';
import {
  agentDir,
  validateName,
  statusCommand,
  logsCommand,
} from '@/lib/agent-paths';

function agentWorkspace(name: string): string {
  if (name === '360ca') return `${agentDir('zoe')}/workspace-360ca`;
  return `${agentDir(name)}/workspace`;
}

function agentMetaPath(name: string): string {
  if (name === '360ca') return `${agentDir('zoe')}/workspace-360ca/psv-meta.json`;
  return `${agentDir(name)}/psv-meta.json`;
}

// In-memory cache: key → { data, timestamp }
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds

async function getDashboardSession(request: NextRequest) {
  // Check Authorization header first, then cookie
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : request.cookies.get(DASHBOARD_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyDashboardToken(token);
}

export async function GET(request: NextRequest) {
  const session = await getDashboardSession(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agents: allowedAgents, sub: clientName } = session;

  // Check cache
  const cacheKey = `${clientName}:${allowedAgents.sort().join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return Response.json(cached.data);
  }

  try {
    // Build a single SSH call that fetches all allowed agents' data
    const agentChecks = allowedAgents
      .map((name) => {
        const safe = validateName(name) || name.replace(/[^a-z0-9_-]/g, '');
        const dir = agentDir(safe);
        const ws = agentWorkspace(safe);
        const meta = agentMetaPath(safe);
        const statusCmd = statusCommand(safe);
        const lastActiveCmd = logsCommand(safe, 1);
        return `
# --- ${safe} ---
echo "---AGENT:${safe}---"
cat ${meta} 2>/dev/null || echo '{}'
echo "---STATUS:${safe}---"
${statusCmd}
echo "---ACTIVITY:${safe}---"
python3 << 'PY_${safe}'
import json, os, re
from datetime import datetime, timedelta

name = "${safe}"
base = "${dir}"
ws = "${ws}"
today = datetime.now().strftime("%Y-%m-%d")
yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

result = {"entries": [], "stats": {"deliverables": 0, "tasks_completed": 0, "leads_found": 0, "emails_sent": 0, "research_items": 0}, "active_task": "", "identity": ""}

# Read identity
id_path = os.path.join(ws, "IDENTITY.md")
if os.path.exists(id_path):
    try:
        lines = open(id_path).readlines()
        for l in lines[:5]:
            l = l.strip()
            if l and not l.startswith("#"):
                result["identity"] = l[:200]
                break
    except:
        pass

# Read active task
task_path = os.path.join(ws, "ACTIVE_TASK.md")
if os.path.exists(task_path):
    try:
        content = open(task_path).read().strip()
        first_line = ""
        for l in content.split("\\n"):
            l = l.strip()
            if l and not l.startswith("#"):
                first_line = l[:200]
                break
        result["active_task"] = first_line
    except:
        pass

# Read today's log (or yesterday's)
log_content = ""
for d in [today, yesterday]:
    lp = os.path.join(ws, "memory", d + ".md")
    if os.path.exists(lp):
        try:
            log_content = open(lp).read()
            break
        except:
            pass

if log_content:
    lines = log_content.split("\\n")
    for line in lines:
        ll = line.lower().strip()
        if not ll or ll.startswith("#"):
            continue
        if any(w in ll for w in ["created", "built", "generated", "drafted", "wrote", "delivered", "completed", "produced"]):
            result["entries"].append({"type": "deliverable", "description": line.strip().lstrip("- *")[:200]})
            result["stats"]["deliverables"] += 1
        elif any(w in ll for w in ["lead", "prospect", "icp", "qualified"]):
            result["entries"].append({"type": "lead", "description": line.strip().lstrip("- *")[:200]})
            result["stats"]["leads_found"] += 1
        elif any(w in ll for w in ["email", "sent email", "outreach"]):
            result["entries"].append({"type": "email", "description": line.strip().lstrip("- *")[:200]})
            result["stats"]["emails_sent"] += 1
        elif any(w in ll for w in ["research", "analyzed", "investigated", "reviewed"]):
            result["entries"].append({"type": "research", "description": line.strip().lstrip("- *")[:200]})
            result["stats"]["research_items"] += 1
        elif any(w in ll for w in ["completed task", "finished", "resolved", "fixed"]):
            result["entries"].append({"type": "task", "description": line.strip().lstrip("- *")[:200]})
            result["stats"]["tasks_completed"] += 1

    result["entries"] = result["entries"][:20]

# Check heartbeat
hb_path = os.path.join(ws, "HEARTBEAT.md")
if os.path.exists(hb_path):
    try:
        hb = open(hb_path).read().strip()
        for l in hb.split("\\n"):
            l = l.strip()
            if l and not l.startswith("#"):
                result["heartbeat"] = l[:300]
                break
    except:
        pass

print(json.dumps(result))
PY_${safe}
echo "---SKILLS:${safe}---"
ls -1 ${ws}/skills/ 2>/dev/null | head -20 || echo ""
echo "---BOTUSER:${safe}---"
python3 -c "import json; m=json.load(open('${dir}/psv-meta.json')); print(m.get('bot_username',''))" 2>/dev/null || echo ""
echo "---LASTACTIVE:${safe}---"
${lastActiveCmd} | tail -1 | awk '{print \$1}' | grep -oP '^\\d{4}-\\d{2}-\\d{2}' | head -1 | xargs -I{} date -d {} +%s 2>/dev/null || echo ""`;
      })
      .join('\n');

    const raw = await sshExec(agentChecks);

    // Parse each agent's data
    const agentData = allowedAgents.map((name) => {
      const safe = validateName(name) || name.replace(/[^a-z0-9_-]/g, '');

      const metaBlock =
        raw.split(`---AGENT:${safe}---`)[1]?.split(`---STATUS:${safe}---`)[0]?.trim() || '{}';
      const statusBlock =
        raw.split(`---STATUS:${safe}---`)[1]?.split(`---ACTIVITY:${safe}---`)[0]?.trim() || 'stopped';
      const activityBlock =
        raw.split(`---ACTIVITY:${safe}---`)[1]?.split(`---SKILLS:${safe}---`)[0]?.trim() || '{}';
      const skillsBlock =
        raw.split(`---SKILLS:${safe}---`)[1]?.split(`---BOTUSER:${safe}---`)[0]?.trim() || '';
      const botUserBlock =
        raw.split(`---BOTUSER:${safe}---`)[1]?.split(`---LASTACTIVE:${safe}---`)[0]?.trim() || '';
      const lastActiveBlock =
        raw.split(`---LASTACTIVE:${safe}---`)[1]?.split(`---AGENT:`)[0]?.trim() || '';

      let meta: Record<string, string> = {};
      try { meta = JSON.parse(metaBlock); } catch { /* */ }

      let activity: Record<string, unknown> = {};
      try { activity = JSON.parse(activityBlock); } catch { /* */ }

      const skills = skillsBlock ? skillsBlock.split('\n').filter(Boolean) : [];

      return {
        name: safe,
        displayName: meta.name || safe.charAt(0).toUpperCase() + safe.slice(1),
        template: meta.template || 'unknown',
        status: statusBlock.trim() === 'active' ? 'running' : statusBlock.trim(),
        bot_username: meta.bot_username || botUserBlock || '',
        email: meta.email || '',
        identity: (activity.identity as string) || '',
        active_task: (activity.active_task as string) || '',
        heartbeat: (activity.heartbeat as string) || '',
        activity: activity.entries || [],
        stats: activity.stats || {},
        skills,
        last_active: lastActiveBlock.match(/^\d+/) ? lastActiveBlock.match(/^\d+/)?.[0] : undefined,
      };
    });

    const result = { client: clientName, agents: agentData };
    cache.set(cacheKey, { data: result, ts: Date.now() });
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Dashboard data fetch failed:', msg, err);
    return Response.json(
      { error: `Failed to load dashboard data: ${msg}` },
      { status: 500 }
    );
  }
}
