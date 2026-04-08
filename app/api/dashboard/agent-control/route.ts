export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { sshExec } from '@/lib/ssh';
import { SHARED_KNOWLEDGE_DIR } from '@/lib/agent-paths';

const CHAT_DIR = `${SHARED_KNOWLEDGE_DIR}/dashboard-chats`;

/**
 * Agent Control API — lets OpenClaw manage the dashboard structure.
 *
 * Auth: Bearer token matching AGENT_CONTROL_SECRET env var.
 *
 * Actions:
 *   - list_projects: List all projects and subfolders for a client+agent
 *   - create_project: Create a new project (channel)
 *   - create_subfolder: Create a subfolder within a project
 *   - delete_project / delete_subfolder
 *   - rename_project / rename_subfolder
 *   - create_session: Create a new conversation in a project/subfolder
 *   - send_message: Post a message to a session
 */

function authenticate(request: NextRequest): boolean {
  const secret = process.env.AGENT_CONTROL_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return token === secret;
}

function escapePython(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

export async function POST(request: NextRequest) {
  if (!authenticate(request)) {
    return Response.json({ error: 'Unauthorized — set AGENT_CONTROL_SECRET and pass as Bearer token' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, client, agent, project, subfolder, title, sessionId, message, role } = body as {
      action: string;
      client: string;
      agent: string;
      project?: string;
      subfolder?: string;
      title?: string;
      sessionId?: string;
      message?: string;
      role?: 'user' | 'assistant';
    };

    if (!action || !client || !agent) {
      return Response.json({ error: 'Missing required fields: action, client, agent' }, { status: 400 });
    }

    const safe = agent.replace(/[^a-z0-9_-]/g, '');
    // Match the shared-{agent}.json naming used by the dashboard chat route
    const chatFile = `${CHAT_DIR}/shared-${safe}.json`;

    // ── list_projects ──
    if (action === 'list_projects') {
      const output = await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if not os.path.isfile(path):
    print(json.dumps({"projects": [], "sessions": []}))
else:
    with open(path) as f:
        data = json.load(f)
    projects = data.get("projects", {})
    sessions = data.get("sessions", {})
    proj_list = []
    for pid, p in projects.items():
        subs = p.get("subfolders", {})
        sub_list = [{"id": sfid, "name": sf.get("name", "Untitled")} for sfid, sf in subs.items()]
        proj_list.append({"id": pid, "name": p.get("name", "Untitled"), "subfolders": sub_list})
    sess_list = []
    for sid, s in sessions.items():
        sess_list.append({
            "id": sid,
            "title": s.get("title", "New conversation"),
            "project": s.get("project", None),
            "subfolder": s.get("subfolder", None),
            "message_count": len(s.get("messages", [])),
        })
    print(json.dumps({"projects": proj_list, "sessions": sess_list}))
PYEOF`);
      return Response.json(JSON.parse(output.trim()));
    }

    // ── create_project ──
    if (action === 'create_project' && title) {
      const projId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const titleB64 = Buffer.from(title, 'utf-8').toString('base64');
      await sshExec(`python3 << 'PYEOF'
import json, os, base64
path = '${chatFile}'
os.makedirs(os.path.dirname(path), exist_ok=True)
data = {}
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
if "projects" not in data:
    data["projects"] = {}
data["projects"]["${projId}"] = {
    "name": base64.b64decode('${titleB64}').decode('utf-8'),
    "created_at": "${new Date().toISOString()}",
    "subfolders": {},
}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true, projectId: projId });
    }

    // ── create_subfolder ──
    if (action === 'create_subfolder' && project && title) {
      const projSafe = escapePython(project);
      const sfId = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const titleB64 = Buffer.from(title, 'utf-8').toString('base64');
      await sshExec(`python3 << 'PYEOF'
import json, os, base64
path = '${chatFile}'
os.makedirs(os.path.dirname(path), exist_ok=True)
data = {}
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
pid = '${projSafe}'
if pid in data.get("projects", {}):
    if "subfolders" not in data["projects"][pid]:
        data["projects"][pid]["subfolders"] = {}
    data["projects"][pid]["subfolders"]["${sfId}"] = {
        "name": base64.b64decode('${titleB64}').decode('utf-8'),
        "created_at": "${new Date().toISOString()}",
    }
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print("ok")
else:
    print("project_not_found")
PYEOF`);
      return Response.json({ ok: true, subfolderId: sfId });
    }

    // ── delete_project ──
    if (action === 'delete_project' && project) {
      const projSafe = escapePython(project);
      await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    data.get("projects", {}).pop('${projSafe}', None)
    for s in data.get("sessions", {}).values():
        if s.get("project") == '${projSafe}':
            s.pop("project", None)
            s.pop("subfolder", None)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true });
    }

    // ── delete_subfolder ──
    if (action === 'delete_subfolder' && project && subfolder) {
      const projSafe = escapePython(project);
      const sfSafe = escapePython(subfolder);
      await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    pid = '${projSafe}'
    sfid = '${sfSafe}'
    if pid in data.get("projects", {}):
        data["projects"][pid].get("subfolders", {}).pop(sfid, None)
    for s in data.get("sessions", {}).values():
        if s.get("subfolder") == sfid:
            s.pop("subfolder", None)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true });
    }

    // ── rename_project ──
    if (action === 'rename_project' && project && title) {
      const projSafe = escapePython(project);
      const titleB64 = Buffer.from(title, 'utf-8').toString('base64');
      await sshExec(`python3 << 'PYEOF'
import json, os, base64
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    pid = '${projSafe}'
    if pid in data.get("projects", {}):
        data["projects"][pid]["name"] = base64.b64decode('${titleB64}').decode('utf-8')
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true });
    }

    // ── rename_subfolder ──
    if (action === 'rename_subfolder' && project && subfolder && title) {
      const projSafe = escapePython(project);
      const sfSafe = escapePython(subfolder);
      const titleB64 = Buffer.from(title, 'utf-8').toString('base64');
      await sshExec(`python3 << 'PYEOF'
import json, os, base64
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    pid = '${projSafe}'
    sfid = '${sfSafe}'
    if pid in data.get("projects", {}) and sfid in data["projects"][pid].get("subfolders", {}):
        data["projects"][pid]["subfolders"][sfid]["name"] = base64.b64decode('${titleB64}').decode('utf-8')
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true });
    }

    // ── create_session ──
    if (action === 'create_session') {
      const newId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timestamp = new Date().toISOString();
      const titleB64 = title ? Buffer.from(title, 'utf-8').toString('base64') : Buffer.from('New conversation', 'utf-8').toString('base64');
      const projLine = project ? `data["sessions"]["${newId}"]["project"] = "${escapePython(project)}"` : '';
      const sfLine = subfolder ? `data["sessions"]["${newId}"]["subfolder"] = "${escapePython(subfolder)}"` : '';
      await sshExec(`python3 << 'PYEOF'
import json, os, base64
path = '${chatFile}'
os.makedirs(os.path.dirname(path), exist_ok=True)
data = {}
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
if "sessions" not in data:
    data["sessions"] = {}
data["sessions"]["${newId}"] = {
    "title": base64.b64decode('${titleB64}').decode('utf-8'),
    "messages": [],
    "created_at": "${timestamp}",
    "updated_at": "${timestamp}",
}
${projLine}
${sfLine}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true, sessionId: newId });
    }

    // ── send_message ──
    if (action === 'send_message' && sessionId && message) {
      const timestamp = new Date().toISOString();
      const msgRole = role || 'assistant';
      const contentB64 = Buffer.from(message, 'utf-8').toString('base64');
      const sidSafe = escapePython(sessionId);
      await sshExec(`python3 << 'PYEOF'
import json, os, time, base64
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    sid = '${sidSafe}'
    if sid in data.get("sessions", {}):
        s = data["sessions"][sid]
        content = base64.b64decode('${contentB64}').decode('utf-8')
        prefix = "m-" if '${msgRole}' == "user" else "r-"
        msg_id = prefix + str(int(time.time() * 1000))
        s["messages"].append({
            "id": msg_id,
            "role": "${msgRole}",
            "content": content,
            "timestamp": "${timestamp}",
        })
        s["updated_at"] = "${timestamp}"
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        print(msg_id)
    else:
        print("session_not_found")
else:
    print("file_not_found")
PYEOF`);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action. Available: list_projects, create_project, create_subfolder, delete_project, delete_subfolder, rename_project, rename_subfolder, create_session, send_message' }, { status: 400 });
  } catch (err) {
    console.error('Agent control error:', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
