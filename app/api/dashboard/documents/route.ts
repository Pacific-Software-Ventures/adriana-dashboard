export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import {
  verifyDashboardToken,
  DASHBOARD_COOKIE_NAME,
} from '@/lib/dashboard-auth';
import { sshExec } from '@/lib/ssh';
import { SHARED_KNOWLEDGE_DIR } from '@/lib/agent-paths';

const DOCS_DIR = `${SHARED_KNOWLEDGE_DIR}/dashboard-documents`;

async function getDashboardSession(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : request.cookies.get(DASHBOARD_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyDashboardToken(token);
}

function escapeShell(str: string): string {
  return str.replace(/'/g, "'\\''");
}

// GET - List documents for a client, optionally filtered by agent
export async function GET(request: NextRequest) {
  const session = await getDashboardSession(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agent = request.nextUrl.searchParams.get('agent');

  try {
    const output = await sshExec(`python3 << 'PYEOF'
import json, os, time

docs_base = '${DOCS_DIR}/shared'
result = []

if os.path.isdir(docs_base):
    for agent_dir in sorted(os.listdir(docs_base)):
        agent_path = os.path.join(docs_base, agent_dir)
        if not os.path.isdir(agent_path):
            continue
        # Walk through agent's document tree
        for root, dirs, files in os.walk(agent_path):
            for fname in files:
                if fname.startswith('.'):
                    continue
                fpath = os.path.join(root, fname)
                rel_path = os.path.relpath(fpath, docs_base)
                stat = os.stat(fpath)
                # Get folder relative to agent dir
                folder = os.path.relpath(os.path.dirname(fpath), agent_path)
                if folder == '.':
                    folder = ''

                # Detect file type
                ext = os.path.splitext(fname)[1].lower()
                ftype = 'file'
                if ext in ['.pdf']:
                    ftype = 'pdf'
                elif ext in ['.doc', '.docx']:
                    ftype = 'word'
                elif ext in ['.xls', '.xlsx', '.csv']:
                    ftype = 'spreadsheet'
                elif ext in ['.ppt', '.pptx']:
                    ftype = 'presentation'
                elif ext in ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']:
                    ftype = 'image'
                elif ext in ['.txt', '.md', '.log']:
                    ftype = 'text'
                elif ext in ['.json', '.yaml', '.yml', '.xml']:
                    ftype = 'data'
                elif ext in ['.py', '.js', '.ts', '.go', '.rs', '.sh']:
                    ftype = 'code'
                elif ext in ['.zip', '.tar', '.gz', '.rar']:
                    ftype = 'archive'

                result.append({
                    'id': rel_path.replace('/', '__'),
                    'name': fname,
                    'path': rel_path,
                    'folder': folder,
                    'agent': agent_dir,
                    'type': ftype,
                    'ext': ext,
                    'size': stat.st_size,
                    'created': stat.st_ctime,
                    'modified': stat.st_mtime,
                })

# Filter by agent if requested
agent_filter = '${escapeShell(agent || '')}'
if agent_filter:
    result = [d for d in result if d['agent'] == agent_filter]

# Sort by modified date descending
result.sort(key=lambda x: x['modified'], reverse=True)

# Get unique folders
folders = list(set(d['folder'] for d in result if d['folder']))
folders.sort()

print(json.dumps({'documents': result, 'folders': folders}))
PYEOF`);
    return Response.json(JSON.parse(output.trim()));
  } catch (err) {
    console.error('Documents fetch error:', err);
    return Response.json({ documents: [], folders: [] });
  }
}

// POST - Upload a document (save metadata + content to EC2)
export async function POST(request: NextRequest) {
  const session = await getDashboardSession(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const agent = formData.get('agent') as string | null;
    const folder = (formData.get('folder') as string) || '';

    if (!file || !agent || !session.agents.includes(agent)) {
      return Response.json({ error: 'Missing file or agent' }, { status: 400 });
    }

    const agentSafe = agent.replace(/[^a-z0-9_-]/g, '');
    const folderSafe = folder.replace(/[^a-zA-Z0-9_\-/ ]/g, '');
    const fileName = file.name.replace(/[^a-zA-Z0-9._\- ]/g, '');

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');

    const targetDir = folderSafe
      ? `${DOCS_DIR}/shared/${agentSafe}/${folderSafe}`
      : `${DOCS_DIR}/shared/${agentSafe}`;

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

    return Response.json({ ok: true, name: fileName });
  } catch (err) {
    console.error('Document upload error:', err);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}
