export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import {
  verifyDashboardToken,
  DASHBOARD_COOKIE_NAME,
} from '@/lib/dashboard-auth';
import { sshExec } from '@/lib/ssh';
import { containerName, validateName } from '@/lib/agent-paths';

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
};

type DriveListResponse = {
  files?: DriveFile[];
};

async function getDashboardSession(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : request.cookies.get(DASHBOARD_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyDashboardToken(token);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function classifyDriveError(error: unknown): { available: false; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (/not found|No such file|command not found/i.test(message)) {
    return {
      available: false,
      message: 'Google Drive CLI is not installed for this agent.',
    };
  }
  if (/auth|oauth|credential|login|permission|forbidden|unauthorized/i.test(message)) {
    return {
      available: false,
      message: 'Google Drive authentication is not set up for this agent.',
    };
  }
  return {
    available: false,
    message: 'Could not retrieve Drive files for this agent.',
  };
}

export async function GET(request: NextRequest) {
  const session = await getDashboardSession(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agent = request.nextUrl.searchParams.get('agent');
  const folderId = request.nextUrl.searchParams.get('folder');
  const maxResults = request.nextUrl.searchParams.get('max') || '50';

  if (!agent || !session.agents.includes(agent)) {
    return Response.json({ error: 'Agent not allowed' }, { status: 403 });
  }

  const safeName = validateName(agent);
  if (!safeName) {
    return Response.json({ error: 'Invalid agent name' }, { status: 400 });
  }

  const container = containerName(safeName);
  const maxSafe = Math.min(Math.max(parseInt(maxResults, 10) || 20, 1), 100);
  const params: Record<string, string | number> = {
    pageSize: maxSafe,
    fields: 'files(id,name,mimeType,webViewLink,size,modifiedTime,parents),nextPageToken',
    q: 'trashed = false',
  };

  if (folderId) {
    const folderSafe = folderId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (folderSafe !== folderId) {
      return Response.json({ error: 'Invalid folder ID' }, { status: 400 });
    }
    params.q = `'${folderSafe}' in parents and trashed = false`;
  }

  const cli = `gws drive files list --format json --params ${shellQuote(JSON.stringify(params))}`;

  try {
    const output = await sshExec(
      `docker exec ${container} bash -lc ${shellQuote(cli)}`
    );
    const trimmed = output.trim();
    const parsed = JSON.parse(trimmed) as DriveListResponse | DriveFile[];
    const files = Array.isArray(parsed) ? parsed : parsed.files || [];

    const normalized = files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
      size: file.size ? parseInt(file.size, 10) : undefined,
      modifiedTime: file.modifiedTime,
      parentId: file.parents?.[0] || null,
    }));

    return Response.json({ files: normalized, available: true });
  } catch (error) {
    const classified = classifyDriveError(error);
    console.error(`[drive] Error fetching Drive files for ${safeName}:`, error);
    return Response.json({ files: [], ...classified });
  }
}
