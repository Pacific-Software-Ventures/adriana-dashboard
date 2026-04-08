export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { sshExec } from '@/lib/ssh';
import { SHARED_KNOWLEDGE_DIR } from '@/lib/agent-paths';

const DOCS_DIR = `${SHARED_KNOWLEDGE_DIR}/dashboard-documents`;
const CHAT_DIR = `${SHARED_KNOWLEDGE_DIR}/dashboard-chats`;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

function escapeShell(str: string): string {
  return str.replace(/'/g, "'\\''");
}

/**
 * Validate the AGENT_UPLOAD_SECRET bearer token.
 * Returns true if the token is valid.
 */
function validateAgentToken(request: NextRequest): boolean {
  const secret = process.env.AGENT_UPLOAD_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;

  const token = authHeader.slice(7);
  return token === secret;
}

/**
 * Sanitize a name for filesystem safety.
 * Allows alphanumeric, spaces, hyphens, underscores, dots.
 * Blocks path traversal.
 */
function sanitizeName(name: string): string {
  return name
    .replace(/\.\./g, '') // no path traversal
    .replace(/[^a-zA-Z0-9 _\-\.]/g, '') // safe chars only
    .trim();
}

// ── GET — List projects and files for an agent ──────────────────────

export async function GET(request: NextRequest) {
  if (!validateAgentToken(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agent = request.nextUrl.searchParams.get('agent');
  if (!agent) {
    return Response.json({ error: 'Missing agent parameter' }, { status: 400 });
  }

  const agentSafe = agent.replace(/[^a-z0-9_-]/g, '');
  if (!agentSafe) {
    return Response.json({ error: 'Invalid agent name' }, { status: 400 });
  }

  const chatFile = `${CHAT_DIR}/shared-${agentSafe}.json`;

  try {
    const output = await sshExec(`python3 << 'PYEOF'
import json, os

# Get project names from chat file
projects = []
chat_path = '${chatFile}'
if os.path.isfile(chat_path):
    with open(chat_path) as f:
        data = json.load(f)
    for pid, p in data.get("projects", {}).items():
        projects.append(p.get("name", "Untitled"))

# Get existing files from documents directory
files = []
agent_dir = '${DOCS_DIR}/shared/${agentSafe}'
if os.path.isdir(agent_dir):
    for root, dirs, fnames in os.walk(agent_dir):
        for fname in fnames:
            if fname.startswith('.'):
                continue
            fpath = os.path.join(root, fname)
            folder = os.path.relpath(os.path.dirname(fpath), agent_dir)
            if folder == '.':
                folder = ''
            stat = os.stat(fpath)
            files.append({
                'name': fname,
                'project': folder,
                'size': stat.st_size,
                'modified': stat.st_mtime,
            })

files.sort(key=lambda x: x['modified'], reverse=True)
print(json.dumps({'projects': projects, 'files': files}))
PYEOF`);
    return Response.json(JSON.parse(output.trim()));
  } catch (err) {
    console.error('Agent upload GET error:', err);
    return Response.json({ projects: [], files: [] });
  }
}

// ── POST — Upload a file to a project folder ────────────────────────

export async function POST(request: NextRequest) {
  if (!validateAgentToken(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const agent = formData.get('agent') as string | null;
    const project = formData.get('project') as string | null;
    const description = formData.get('description') as string | null;

    if (!file) {
      return Response.json({ error: 'Missing file' }, { status: 400 });
    }
    if (!agent) {
      return Response.json({ error: 'Missing agent' }, { status: 400 });
    }
    if (!project) {
      return Response.json({ error: 'Missing project' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 413 }
      );
    }

    const agentSafe = agent.replace(/[^a-z0-9_-]/g, '');
    const projectSafe = sanitizeName(project);
    const fileName = sanitizeName(file.name);

    if (!agentSafe || !projectSafe || !fileName) {
      return Response.json(
        { error: 'Invalid agent, project, or filename' },
        { status: 400 }
      );
    }

    // Base64 encode file content
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');

    const targetDir = `${DOCS_DIR}/shared/${agentSafe}/${projectSafe}`;

    await sshExec(`python3 << 'PYEOF'
import base64, os

target_dir = '${escapeShell(targetDir)}'
os.makedirs(target_dir, exist_ok=True)
data = base64.b64decode('${base64}')
fpath = os.path.join(target_dir, '${escapeShell(fileName)}')
with open(fpath, 'wb') as f:
    f.write(data)
print('ok')
PYEOF`);

    const resultPath = `${agentSafe}/${projectSafe}/${fileName}`;

    console.log(
      `[agent-upload] ${agentSafe} uploaded "${fileName}" to project "${projectSafe}"` +
        (description ? ` — ${description}` : '')
    );

    return Response.json({ ok: true, path: resultPath });
  } catch (err) {
    console.error('Agent upload POST error:', err);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}

