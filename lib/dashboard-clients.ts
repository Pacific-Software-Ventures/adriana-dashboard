// ============================================================================
// Client dashboard credentials — DB-backed
// ============================================================================

import bcrypt from 'bcryptjs';
import {
  LEGACY_DASHBOARD_CLIENTS,
} from './legacy-dashboard-clients';
import { supabaseAdmin } from './supabase';

export interface DashboardClient {
  name: string;
  agents: string[];
  source: 'database';
}

export interface LegacyDashboardClientAudit {
  name: string;
  agents: string[];
  allowlisted: boolean;
  hasActiveClientCredential: boolean;
  clientStatus: string | null;
  hasAgentCredential: boolean;
  canAuthenticateWithoutFallback: boolean;
  needsLegacyFallback: boolean;
}

// ============================================================================
// Tracked legacy dashboard clients
// These clients were historically hardcoded and are now expected to be
// represented in the database. We keep this list only for migration auditing
// and repair scripts.
// ============================================================================

export function getLegacyDashboardFallbackNames(): string[] {
  return LEGACY_DASHBOARD_CLIENTS.map((client) => client.name);
}

export function getLegacyDashboardFallbackAllowlist(): string[] | null {
  return null;
}

async function getAgentNamesForClient(clientId: string): Promise<string[]> {
  const { data: agents } = await supabaseAdmin
    .from('client_agents')
    .select('agent_name')
    .eq('client_id', clientId);
  return (agents || []).map((agent: { agent_name: string }) => agent.agent_name);
}

async function authenticateFromClientsTable(
  name: string,
  password: string
): Promise<DashboardClient | null> {
  try {
    const { data: dbClient } = await supabaseAdmin
      .from('clients')
      .select('id, contact_name, password_hash')
      .eq('status', 'active')
      .ilike('contact_name', name)
      .single();

    if (dbClient) {
      const match = await bcrypt.compare(password, dbClient.password_hash);
      if (match) {
        return {
          name: dbClient.contact_name,
          agents: await getAgentNamesForClient(dbClient.id),
          source: 'database',
        };
      }
    }
  } catch {
    // Fall through to the next auth source.
  }
  return null;
}

async function authenticateFromAgentCredentials(
  name: string,
  password: string
): Promise<DashboardClient | null> {
  try {
    const { data: agentCred } = await supabaseAdmin
      .from('agent_credentials')
      .select('client_id, dashboard_username, dashboard_password_hash')
      .ilike('dashboard_username', name)
      .single();

    if (agentCred) {
      const match = await bcrypt.compare(password, agentCred.dashboard_password_hash);
      if (match) {
        return {
          name: agentCred.dashboard_username,
          agents: await getAgentNamesForClient(agentCred.client_id),
          source: 'database',
        };
      }
    }
  } catch {
    // Fall through to the next auth source.
  }
  return null;
}

export async function auditLegacyDashboardClients(): Promise<{
  legacyFallbackEnabled: boolean;
  legacyFallbackAllowlist: string[] | null;
  totalLegacyClients: number;
  dbBackedClients: number;
  clients: LegacyDashboardClientAudit[];
}> {
  const [clientsResult, agentCredsResult] = await Promise.all([
    supabaseAdmin
      .from('clients')
      .select('contact_name, status, password_hash'),
    supabaseAdmin
      .from('agent_credentials')
      .select('dashboard_username'),
  ]);

  if (clientsResult.error) {
    throw new Error(`Failed to audit clients table: ${clientsResult.error.message}`);
  }
  if (agentCredsResult.error) {
    throw new Error(`Failed to audit agent credentials: ${agentCredsResult.error.message}`);
  }

  const dbClients = new Map<string, { status: string | null; hasPasswordHash: boolean }>();
  for (const row of clientsResult.data || []) {
    const key = String(row.contact_name || '').trim().toLowerCase();
    if (!key) continue;
    dbClients.set(key, {
      status: row.status || null,
      hasPasswordHash: Boolean(row.password_hash),
    });
  }

  const agentCredentialNames = new Set(
    (agentCredsResult.data || [])
      .map((row) => String(row.dashboard_username || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const clients = LEGACY_DASHBOARD_CLIENTS.map((client) => {
    const key = client.name.toLowerCase();
    const dbClient = dbClients.get(key);
    const hasActiveClientCredential = Boolean(
      dbClient && dbClient.status === 'active' && dbClient.hasPasswordHash
    );
    const hasAgentCredential = agentCredentialNames.has(key);
    const canAuthenticateWithoutFallback = hasActiveClientCredential || hasAgentCredential;
    return {
      name: client.name,
      agents: client.agents,
      allowlisted: false,
      hasActiveClientCredential,
      clientStatus: dbClient?.status || null,
      hasAgentCredential,
      canAuthenticateWithoutFallback,
      needsLegacyFallback: false,
    } satisfies LegacyDashboardClientAudit;
  });

  return {
    legacyFallbackEnabled: false,
    legacyFallbackAllowlist: getLegacyDashboardFallbackAllowlist(),
    totalLegacyClients: clients.length,
    dbBackedClients: clients.filter((client) => client.canAuthenticateWithoutFallback).length,
    clients,
  };
}

// AUTHENTICATE — tries DB first, then optional transitional fallback
// ============================================================================

export async function authenticateClient(
  name: string,
  password: string
): Promise<DashboardClient | null> {
  const clientAuth = await authenticateFromClientsTable(name, password);
  if (clientAuth) return clientAuth;

  const agentAuth = await authenticateFromAgentCredentials(name, password);
  if (agentAuth) return agentAuth;

  return null;
}
