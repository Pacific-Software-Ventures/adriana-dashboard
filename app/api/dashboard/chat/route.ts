export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes — Vercel hobby plan max

import { NextRequest, after } from 'next/server';
import {
  verifyDashboardToken,
  DASHBOARD_COOKIE_NAME,
} from '@/lib/dashboard-auth';
import { sshExec } from '@/lib/ssh';
import { SHARED_KNOWLEDGE_DIR } from '@/lib/agent-paths';
import { sendAgentMessage } from '@/lib/openclaw-gateway';
import { createProjectDoc, updateProjectDoc } from '@/lib/google-docs';

const CHAT_DIR = `${SHARED_KNOWLEDGE_DIR}/dashboard-chats`;

async function getDashboardSession(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : request.cookies.get(DASHBOARD_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyDashboardToken(token);
}

/**
 * Escape a string for safe embedding inside a Python single-quoted string.
 * Replaces ' with \' (Python escape, not shell escape).
 */
function escapePython(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Safely store a message in the chat JSON file on EC2.
 * Uses base64 encoding for the content to avoid any shell/Python injection issues.
 */
async function storeMessage(
  chatFile: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  timestamp: string,
  sender?: string,
  attachment?: { name: string; size: number; type: string; path: string }
): Promise<string> {
  // Base64-encode the content to avoid shell escaping issues entirely
  const contentB64 = Buffer.from(content, 'utf-8').toString('base64');
  const senderB64 = sender ? Buffer.from(sender, 'utf-8').toString('base64') : '';
  const attachmentB64 = attachment ? Buffer.from(JSON.stringify(attachment), 'utf-8').toString('base64') : '';
  const sidSafe = escapePython(sessionId);

  const output = await sshExec(`python3 << 'PYEOF'
import json, os, time, base64

path = '${chatFile}'
os.makedirs(os.path.dirname(path), exist_ok=True)

data = {}
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)

if "sessions" not in data:
    data["sessions"] = {}

sid = '${sidSafe}'
if sid not in data["sessions"]:
    data["sessions"][sid] = {
        "title": "New conversation",
        "messages": [],
        "created_at": "${timestamp}",
        "updated_at": "${timestamp}",
    }

s = data["sessions"][sid]
content = base64.b64decode('${contentB64}').decode('utf-8')
sender_b64 = '${senderB64}'
sender = base64.b64decode(sender_b64).decode('utf-8') if sender_b64 else None
attachment_b64 = '${attachmentB64}'
attachment = json.loads(base64.b64decode(attachment_b64).decode('utf-8')) if attachment_b64 else None
prefix = "m-" if '${role}' == "user" else "r-"
msg_id = prefix + str(int(time.time() * 1000))

msg = {
    "id": msg_id,
    "role": "${role}",
    "content": content,
    "timestamp": "${timestamp}",
}
if sender:
    msg["sender"] = sender
if attachment:
    msg["attachment"] = attachment

s["messages"].append(msg)
s["updated_at"] = "${timestamp}"

# Auto-title from first user message
if '${role}' == "user" and len(s["messages"]) == 1:
    s["title"] = content[:60]

with open(path, "w") as f:
    json.dump(data, f, indent=2)

print(msg_id)
PYEOF`);

  return output.trim();
}

// ── GET — Fetch chat sessions and messages ──────────────────────────

export async function GET(request: NextRequest) {
  const session = await getDashboardSession(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agent = request.nextUrl.searchParams.get('agent');
  const sessionId = request.nextUrl.searchParams.get('session');

  if (!agent || !session.agents.includes(agent)) {
    return Response.json({ error: 'Agent not allowed' }, { status: 403 });
  }

  const safe = agent.replace(/[^a-z0-9_-]/g, '');
  const chatFile = `${CHAT_DIR}/shared-${safe}.json`;

  try {
    if (sessionId) {
      const sidSafe = escapePython(sessionId);
      const output = await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if not os.path.isfile(path):
    print(json.dumps({"messages": []}))
else:
    with open(path) as f:
        data = json.load(f)
    sessions = data.get("sessions", {})
    s = sessions.get('${sidSafe}', {})
    print(json.dumps({"messages": s.get("messages", []), "title": s.get("title", "New conversation")}))
PYEOF`);
      return Response.json(JSON.parse(output.trim()));
    } else {
      const output = await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if not os.path.isfile(path):
    print(json.dumps({"sessions": [], "projects": []}))
else:
    with open(path) as f:
        data = json.load(f)
    sessions = data.get("sessions", {})
    projects = data.get("projects", {})
    result = []
    for sid, s in sorted(sessions.items(), key=lambda x: x[1].get("updated_at", ""), reverse=True):
        msgs = s.get("messages", [])
        last_sender = msgs[-1].get("sender", None) if msgs else None
        result.append({
            "id": sid,
            "title": s.get("title", "New conversation"),
            "updated_at": s.get("updated_at", ""),
            "message_count": len(msgs),
            "preview": msgs[-1]["content"][:80] if msgs else "",
            "last_sender": last_sender,
            "project": s.get("project", None),
            "subfolder": s.get("subfolder", None),
        })
    proj_list = []
    for pid, p in projects.items():
        subs = p.get("subfolders", {})
        sub_list = [{"id": sfid, "name": sf.get("name", "Untitled")} for sfid, sf in subs.items()]
        proj_list.append({"id": pid, "name": p.get("name", "Untitled"), "subfolders": sub_list, "instructions": p.get("instructions", ""), "email": p.get("email", ""), "doc_url": p.get("doc_url", "")})
    print(json.dumps({"sessions": result, "projects": proj_list}))
PYEOF`);
      return Response.json(JSON.parse(output.trim()));
    }
  } catch (err) {
    console.error('Chat fetch error:', err);
    return Response.json({ sessions: [], messages: [] });
  }
}

// ── POST — Send a message or create a new session ───────────────────

export async function POST(request: NextRequest) {
  const session = await getDashboardSession(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { agent, sessionId, message, action, project: projectId, subfolder: subfolderId, attachment } = body as {
      agent: string;
      sessionId?: string;
      message?: string;
      action?: 'new_session' | 'send';
      project?: string;
      subfolder?: string;
      attachment?: { name: string; size: number; type: string; path: string };
    };

    if (!agent || !session.agents.includes(agent)) {
      return Response.json({ error: 'Agent not allowed' }, { status: 403 });
    }

    const safe = agent.replace(/[^a-z0-9_-]/g, '');
    const chatFile = `${CHAT_DIR}/shared-${safe}.json`;

    if (action === 'new_session') {
      const newId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timestamp = new Date().toISOString();
      await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
os.makedirs(os.path.dirname(path), exist_ok=True)
data = {}
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
if "sessions" not in data:
    data["sessions"] = {}
data["sessions"]["${newId}"] = {
    "title": "New conversation",
    "messages": [],
    "created_at": "${timestamp}",
    "updated_at": "${timestamp}",
}
${projectId ? `data["sessions"]["${newId}"]["project"] = "${escapePython(projectId)}"` : ''}
${subfolderId ? `data["sessions"]["${newId}"]["subfolder"] = "${escapePython(subfolderId)}"` : ''}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ sessionId: newId });
    }

    if (action === 'send' && sessionId && message) {
      const timestamp = new Date().toISOString();

      // 1. Store user message (with sender = client name, optional attachment)
      await storeMessage(chatFile, sessionId, 'user', message, timestamp, session.sub, attachment);

      // 1b. Look up project context + instructions + email for this session
      let projectContext = '';
      let projectInstructions = '';
      let projectEmail = '';
      try {
        const sidSafe = escapePython(sessionId);
        const projLookup = await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if not os.path.isfile(path):
    print(json.dumps({"name": "", "instructions": "", "email": ""}))
else:
    with open(path) as f:
        data = json.load(f)
    s = data.get("sessions", {}).get('${sidSafe}', {})
    pid = s.get("project", "")
    if pid:
        proj = data.get("projects", {}).get(pid, {})
        print(json.dumps({"name": proj.get("name", ""), "instructions": proj.get("instructions", ""), "email": proj.get("email", "")}))
    else:
        print(json.dumps({"name": "", "instructions": "", "email": ""}))
PYEOF`);
        const projData = JSON.parse(projLookup.trim());
        projectContext = projData.name || '';
        projectInstructions = projData.instructions || '';
        projectEmail = projData.email || '';
      } catch {
        // Non-critical — proceed without project context
      }

      // 2. Kick off the agent call in the background — don't block the response.
      //    next/server's `after()` keeps the function alive after the response is sent.
      after(async () => {
        try {
          // Prepend session/project context so the agent knows where it is
          let agentMessage = message;
          if (projectContext) {
            const safeProjectName = projectContext.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');

            // Write project instructions to Robin's workspace so it reads them as a real file
            if (projectInstructions) {
              try {
                const instrB64 = Buffer.from(
                  `# ${projectContext} — Project Instructions\n\n${projectInstructions}${projectEmail ? `\n\nDelivery email: ${projectEmail}` : ''}\n`,
                  'utf-8'
                ).toString('base64');
                await sshExec(`echo '${instrB64}' | base64 -d > /srv/openclaw/profiles/${safe}/workspace/projects/${safeProjectName}.md 2>/dev/null || (mkdir -p /srv/openclaw/profiles/${safe}/workspace/projects && echo '${instrB64}' | base64 -d > /srv/openclaw/profiles/${safe}/workspace/projects/${safeProjectName}.md)`);
              } catch { /* non-critical */ }
            }

            // Send a CLEAN message — no framing, no "Adriana confirmed", no "subagent mode"
            // Just reference the project file and include the user's message naturally
            agentMessage = `(${projectContext} project) ${message}`;
          } else {
            agentMessage = message;
          }
          const result = await sendAgentMessage(safe, agentMessage, BACKGROUND_AGENT_TIMEOUT_MS);
          if (result.reply) {
            const replyTimestamp = new Date().toISOString();
            await storeMessage(chatFile, sessionId, 'assistant', result.reply, replyTimestamp, agent);
            console.log(`[chat] Agent ${safe} replied via ${result.method} (${result.reply.length} chars)`);
          } else {
            console.warn(`[chat] Agent ${safe} returned empty reply`);
          }
        } catch (err) {
          console.error(`[chat] Background agent call failed for ${safe}:`, err);
          // Store error message so the user sees it on next poll
          await storeMessage(
            chatFile, sessionId, 'assistant',
            'Sorry, I took too long to respond. Please try again or message me on Telegram.',
            new Date().toISOString(), agent
          ).catch(() => {});
        }
      });

      // 3. Return immediately — frontend will poll for the reply
      return Response.json({ status: 'processing', sessionId });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Chat send error:', err);
    return Response.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}

const BACKGROUND_AGENT_TIMEOUT_MS = 240_000; // 4 minutes — tight enough to force fast responses

// ── PATCH — Rename, delete, or move session to project ──────────────

export async function PATCH(request: NextRequest) {
  const session = await getDashboardSession(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { agent, sessionId, action, title, project, subfolder, instructions } = body as {
      agent: string;
      sessionId: string;
      action: 'rename' | 'delete' | 'move_to_project' | 'remove_from_project' | 'create_project' | 'delete_project' | 'rename_project' | 'create_subfolder' | 'delete_subfolder' | 'rename_subfolder' | 'move_to_subfolder' | 'set_project_instructions';
      title?: string;
      project?: string;
      subfolder?: string;
      instructions?: string;
    };

    if (!agent || !session.agents.includes(agent)) {
      return Response.json({ error: 'Agent not allowed' }, { status: 403 });
    }

    const safe = agent.replace(/[^a-z0-9_-]/g, '');
    const chatFile = `${CHAT_DIR}/shared-${safe}.json`;

    if (action === 'rename' && sessionId && title) {
      const titleB64 = Buffer.from(title, 'utf-8').toString('base64');
      const sidSafe = escapePython(sessionId);
      await sshExec(`python3 << 'PYEOF'
import json, os, base64
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    sid = '${sidSafe}'
    if sid in data.get("sessions", {}):
        data["sessions"][sid]["title"] = base64.b64decode('${titleB64}').decode('utf-8')
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true });
    }

    if (action === 'delete' && sessionId) {
      const sidSafe = escapePython(sessionId);
      await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    data.get("sessions", {}).pop('${sidSafe}', None)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true });
    }

    if (action === 'move_to_project' && sessionId && project) {
      const sidSafe = escapePython(sessionId);
      const projSafe = escapePython(project);
      await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    sid = '${sidSafe}'
    if sid in data.get("sessions", {}):
        data["sessions"][sid]["project"] = '${projSafe}'
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true });
    }

    if (action === 'remove_from_project' && sessionId) {
      const sidSafe = escapePython(sessionId);
      await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    sid = '${sidSafe}'
    if sid in data.get("sessions", {}):
        data["sessions"][sid].pop("project", None)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true });
    }

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
    "subagent": True,
}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true, projectId: projId });
    }

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
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true });
    }

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

    // ── Project instructions ──

    if (action === 'set_project_instructions' && project) {
      const projSafe = escapePython(project);
      const instrB64 = instructions ? Buffer.from(instructions, 'utf-8').toString('base64') : '';
      const emailVal = (body.email as string | undefined) || '';
      const emailB64 = emailVal ? Buffer.from(emailVal, 'utf-8').toString('base64') : '';

      // Look up existing Google Doc ID for this project (if any)
      let existingDocId = '';
      try {
        const lookup = await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    pid = '${projSafe}'
    print(data.get("projects", {}).get(pid, {}).get("doc_id", ""))
else:
    print("")
PYEOF`);
        existingDocId = lookup.trim();
      } catch { /* */ }

      // Resolve project name for the doc title
      let projName = '';
      try {
        const nameLookup = await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    print(data.get("projects", {}).get('${projSafe}', {}).get("name", ""))
else:
    print("")
PYEOF`);
        projName = nameLookup.trim();
      } catch { /* */ }

      // Create or update Google Doc
      let docId = existingDocId;
      let docUrl = existingDocId ? `https://docs.google.com/document/d/${existingDocId}/edit` : '';
      try {
        if (existingDocId) {
          await updateProjectDoc(existingDocId, instructions || '', emailVal);
        } else {
          const result = await createProjectDoc(
            `${projName || 'Project'} — Instructions`,
            instructions || '',
            emailVal,
          );
          if (result) {
            docId = result.docId;
            docUrl = result.url;
          }
        }
      } catch (err) {
        console.error('[chat] Google Doc creation/update failed:', err);
        // Non-fatal — still save instructions in JSON
      }

      // Save instructions + email + doc reference in project metadata
      const docIdB64 = docId ? Buffer.from(docId, 'utf-8').toString('base64') : '';
      const docUrlB64 = docUrl ? Buffer.from(docUrl, 'utf-8').toString('base64') : '';
      await sshExec(`python3 << 'PYEOF'
import json, os, base64
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    pid = '${projSafe}'
    if pid in data.get("projects", {}):
        instr_b64 = '${instrB64}'
        email_b64 = '${emailB64}'
        doc_id_b64 = '${docIdB64}'
        doc_url_b64 = '${docUrlB64}'
        if instr_b64:
            data["projects"][pid]["instructions"] = base64.b64decode(instr_b64).decode('utf-8')
        if email_b64:
            data["projects"][pid]["email"] = base64.b64decode(email_b64).decode('utf-8')
        else:
            data["projects"][pid]["email"] = ""
        if doc_id_b64:
            data["projects"][pid]["doc_id"] = base64.b64decode(doc_id_b64).decode('utf-8')
        if doc_url_b64:
            data["projects"][pid]["doc_url"] = base64.b64decode(doc_url_b64).decode('utf-8')
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true, docUrl });
    }

    // ── Subfolder operations ──

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
if "projects" not in data:
    data["projects"] = {}
pid = '${projSafe}'
if pid in data["projects"]:
    if "subfolders" not in data["projects"][pid]:
        data["projects"][pid]["subfolders"] = {}
    data["projects"][pid]["subfolders"]["${sfId}"] = {
        "name": base64.b64decode('${titleB64}').decode('utf-8'),
        "created_at": "${new Date().toISOString()}",
    }
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true, subfolderId: sfId });
    }

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

    if (action === 'move_to_subfolder' && sessionId && project && subfolder) {
      const sidSafe = escapePython(sessionId);
      const projSafe = escapePython(project);
      const sfSafe = escapePython(subfolder);
      await sshExec(`python3 << 'PYEOF'
import json, os
path = '${chatFile}'
if os.path.isfile(path):
    with open(path) as f:
        data = json.load(f)
    sid = '${sidSafe}'
    if sid in data.get("sessions", {}):
        data["sessions"][sid]["project"] = '${projSafe}'
        data["sessions"][sid]["subfolder"] = '${sfSafe}'
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
print("ok")
PYEOF`);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Chat patch error:', err);
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
