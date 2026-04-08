export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import {
  verifyDashboardToken,
  DASHBOARD_COOKIE_NAME,
} from '@/lib/dashboard-auth';
import { sshExec } from '@/lib/ssh';
import { containerName, validateName } from '@/lib/agent-paths';

async function getDashboardSession(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const queryToken = request.nextUrl.searchParams.get('token');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : queryToken || request.cookies.get(DASHBOARD_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyDashboardToken(token);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function classifyDownloadError(error: unknown): { error: string; status: number } {
  const message = error instanceof Error ? error.message : String(error);
  if (/not found|No such file|404/i.test(message)) {
    return { error: 'Drive file not found', status: 404 };
  }
  if (/auth|oauth|credential|login|permission|forbidden|unauthorized/i.test(message)) {
    return { error: 'Drive authentication not available', status: 502 };
  }
  return { error: 'Failed to download file', status: 500 };
}

const GOOGLE_EXPORT_MIMES: Record<string, { ext: string; mime: string; exportMime: string }> = {
  'application/vnd.google-apps.document': {
    ext: 'pdf',
    mime: 'application/pdf',
    exportMime: 'application/pdf',
  },
  'application/vnd.google-apps.spreadsheet': {
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    exportMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  'application/vnd.google-apps.presentation': {
    ext: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    exportMime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  'application/vnd.google-apps.drawing': {
    ext: 'png',
    mime: 'image/png',
    exportMime: 'image/png',
  },
};

export async function GET(request: NextRequest) {
  const session = await getDashboardSession(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agent = request.nextUrl.searchParams.get('agent');
  const fileId = request.nextUrl.searchParams.get('id');
  const fileName = request.nextUrl.searchParams.get('name') || 'download';
  const mimeType = request.nextUrl.searchParams.get('mime') || '';

  if (!agent || !session.agents.includes(agent)) {
    return Response.json({ error: 'Agent not allowed' }, { status: 403 });
  }

  if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    return Response.json({ error: 'Invalid file ID' }, { status: 400 });
  }

  const safeName = validateName(agent);
  if (!safeName) {
    return Response.json({ error: 'Invalid agent name' }, { status: 400 });
  }

  const container = containerName(safeName);
  const exportInfo = GOOGLE_EXPORT_MIMES[mimeType];
  const tmpFile = `/tmp/drive_dl_${fileId}`;

  try {
    let outputMime: string;
    let outputName: string;
    let cli: string;

    if (exportInfo) {
      outputMime = exportInfo.mime;
      outputName = fileName.replace(/\.[^.]*$/, '') + '.' + exportInfo.ext;
      cli = [
        'set -euo pipefail',
        `rm -f ${shellQuote(tmpFile)}`,
        `gws drive files export --params ${shellQuote(JSON.stringify({ fileId, mimeType: exportInfo.exportMime }))} --output ${shellQuote(tmpFile)} >/dev/null`,
        `base64 -w 0 ${shellQuote(tmpFile)}`,
        `rm -f ${shellQuote(tmpFile)}`,
      ].join(' && ');
    } else {
      outputMime = mimeType || 'application/octet-stream';
      outputName = fileName;
      cli = [
        'set -euo pipefail',
        `rm -f ${shellQuote(tmpFile)}`,
        `gws drive files download --params ${shellQuote(JSON.stringify({ fileId }))} --output ${shellQuote(tmpFile)} >/dev/null`,
        `base64 -w 0 ${shellQuote(tmpFile)}`,
        `rm -f ${shellQuote(tmpFile)}`,
      ].join(' && ');
    }

    const base64Output = await sshExec(
      `docker exec ${container} bash -lc ${shellQuote(cli)}`
    );
    const buffer = Buffer.from(base64Output.trim(), 'base64');

    return new Response(buffer, {
      headers: {
        'Content-Type': outputMime,
        'Content-Disposition': `inline; filename="${outputName}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, max-age=1800',
      },
    });
  } catch (error) {
    const classified = classifyDownloadError(error);
    console.error(`[drive-download] Error proxying file ${fileId}:`, error);
    return Response.json({ error: classified.error }, { status: classified.status });
  }
}
