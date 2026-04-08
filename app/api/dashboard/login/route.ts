export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { authenticateClient } from '@/lib/dashboard-clients';
import { signDashboardToken } from '@/lib/dashboard-auth';

export async function POST(request: NextRequest) {
  try {
    const { name, password } = (await request.json()) as {
      name: string;
      password: string;
    };

    if (!name || !password) {
      return Response.json(
        { error: 'Name and password required' },
        { status: 400 }
      );
    }

    const client = await authenticateClient(name, password);
    if (!client) {
      return Response.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const token = signDashboardToken(client.name, client.agents);

    return Response.json({ token, name: client.name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Dashboard login error:', msg, err);
    return Response.json({ error: `Login failed: ${msg}` }, { status: 500 });
  }
}
