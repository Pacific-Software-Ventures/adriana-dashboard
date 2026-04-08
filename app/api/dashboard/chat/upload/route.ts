export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import {
  verifyDashboardToken,
  DASHBOARD_COOKIE_NAME,
} from '@/lib/dashboard-auth';
import { sshExec } from '@/lib/ssh';
import { SHARED_KNOWLEDGE_DIR } from '@/lib/agent-paths';

const UPLOAD_DIR = `${SHARED_KNOWLEDGE_DIR}/dashboard-uploads`;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.txt', '.md',
]);

async function getDashboardSession(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : request.cookies.get(DASHBOARD_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyDashboardToken(token);
}

export async function POST(request: NextRequest) {
  const session = await getDashboardSession(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const agent = formData.get('agent') as string | null;
    const sessionId = formData.get('sessionId') as string | null;

    if (!file || !agent || !sessionId) {
      return Response.json({ error: 'Missing file, agent, or sessionId' }, { status: 400 });
    }

    // Validate agent access
    if (!session.agents.includes(agent)) {
      return Response.json({ error: 'Agent not allowed' }, { status: 403 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: 'File must be under 10MB' }, { status: 400 });
    }

    // Validate file extension
    const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return Response.json({ error: 'File type not allowed' }, { status: 400 });
    }

    // Read file and base64 encode
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // Build remote path
    const agentSafe = agent.replace(/[^a-z0-9_-]/g, '');
    const timestamp = Date.now();
    const remoteFileName = `${timestamp}-${fileName}`;
    const remotePath = `${UPLOAD_DIR}/${agentSafe}/${remoteFileName}`;

    // Send to EC2 via SSM — write base64 data in chunks to avoid command length limits
    // SSM has a ~24KB command limit, so for large files we chunk the base64 data
    const CHUNK_SIZE = 16000; // safe chunk size for SSM
    const chunks = Math.ceil(base64Data.length / CHUNK_SIZE);

    if (chunks <= 1) {
      // Small file — single command
      await sshExec(`python3 << 'PYEOF'
import base64, os
path = '${remotePath}'
os.makedirs(os.path.dirname(path), exist_ok=True)
data = base64.b64decode('${base64Data}')
with open(path, 'wb') as f:
    f.write(data)
print('ok')
PYEOF`);
    } else {
      // Large file — write chunks to a temp file, then decode
      const tempPath = `/tmp/upload-${timestamp}.b64`;
      // First chunk — create the file
      await sshExec(`cat > '${tempPath}' << 'B64CHUNK'
${base64Data.slice(0, CHUNK_SIZE)}
B64CHUNK`);
      // Remaining chunks — append
      for (let i = 1; i < chunks; i++) {
        const chunk = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await sshExec(`cat >> '${tempPath}' << 'B64CHUNK'
${chunk}
B64CHUNK`);
      }
      // Decode and move to final location
      await sshExec(`python3 << 'PYEOF'
import base64, os
path = '${remotePath}'
os.makedirs(os.path.dirname(path), exist_ok=True)
with open('${tempPath}', 'r') as f:
    b64 = f.read().replace('\\n', '')
data = base64.b64decode(b64)
with open(path, 'wb') as f:
    f.write(data)
os.remove('${tempPath}')
print('ok')
PYEOF`);
    }

    // Return the relative path for download (agentSafe/filename)
    const relativePath = `${agentSafe}/${remoteFileName}`;

    return Response.json({
      ok: true,
      attachment: {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        path: relativePath,
      },
    });
  } catch (err) {
    console.error('Upload error:', err);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}
