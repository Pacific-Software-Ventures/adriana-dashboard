export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import {
  verifyDashboardToken,
  DASHBOARD_COOKIE_NAME,
} from '@/lib/dashboard-auth';
import { sshExec } from '@/lib/ssh';
import { SHARED_KNOWLEDGE_DIR } from '@/lib/agent-paths';

const UPLOAD_DIR = `${SHARED_KNOWLEDGE_DIR}/dashboard-uploads`;

async function getDashboardSession(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const queryToken = request.nextUrl.searchParams.get('token');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : queryToken || request.cookies.get(DASHBOARD_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyDashboardToken(token);
}

function escapeShell(str: string): string {
  return str.replace(/'/g, "'\\''");
}

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

export async function GET(request: NextRequest) {
  const session = await getDashboardSession(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get('path');
  if (!path) {
    return Response.json({ error: 'Missing path' }, { status: 400 });
  }

  // Prevent path traversal
  if (path.includes('..') || path.startsWith('/')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Validate agent access from path (path format: agentName/timestamp-filename)
  const pathParts = path.split('/');
  if (pathParts.length < 2) {
    return Response.json({ error: 'Invalid path format' }, { status: 400 });
  }
  const agentName = pathParts[0];
  if (!session.agents.includes(agentName)) {
    return Response.json({ error: 'Agent not allowed' }, { status: 403 });
  }

  const fullPath = `${UPLOAD_DIR}/${path}`;
  const fileName = pathParts[pathParts.length - 1];
  // Strip the timestamp prefix for display (format: 1234567890-originalname.ext)
  const displayName = fileName.replace(/^\d+-/, '');
  const ext = displayName.substring(displayName.lastIndexOf('.')).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const base64Output = await sshExec(
      `python3 -c "import base64,sys; data=open('${escapeShell(fullPath)}','rb').read(); sys.stdout.write(base64.b64encode(data).decode())"`
    );

    const buffer = Buffer.from(base64Output.trim(), 'base64');

    return new Response(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${displayName}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('Upload download error:', err);
    return Response.json({ error: 'File not found' }, { status: 404 });
  }
}
