// ============================================================================
// Client dashboard token — signed JWT with embedded agent access list
// ============================================================================

import { createHmac } from 'crypto';

const DASHBOARD_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const DASHBOARD_COOKIE_NAME = 'psv_dashboard_token';

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

function getSecret(): string {
  const secret = process.env.DASHBOARD_JWT_SECRET;
  if (!secret) throw new Error('DASHBOARD_JWT_SECRET environment variable is required');
  return secret;
}

function hmacSign(input: string): string {
  return createHmac('sha256', getSecret()).update(input).digest('base64url');
}

export interface DashboardPayload {
  sub: string;       // client name
  agents: string[];  // allowed agent names
  iat: number;
  exp: number;
}

export function signDashboardToken(
  clientName: string,
  agents: string[]
): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: DashboardPayload = {
    sub: clientName,
    agents,
    iat: now,
    exp: now + DASHBOARD_EXPIRY_SECONDS,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = hmacSign(signingInput);

  return `${signingInput}.${signature}`;
}

export function verifyDashboardToken(
  token: string
): DashboardPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;
    const expected = hmacSign(signingInput);

    if (expected !== signatureB64) return null;

    const payload: DashboardPayload = JSON.parse(base64UrlDecode(payloadB64));

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
