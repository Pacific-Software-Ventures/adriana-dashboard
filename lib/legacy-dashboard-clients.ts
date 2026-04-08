import { createHash } from 'crypto';

export interface LegacyDashboardClientRecord {
  name: string;
  agents: string[];
}

export const LEGACY_DASHBOARD_CLIENTS: LegacyDashboardClientRecord[] = [
  { name: 'Barbara', agents: ['zoe', 'gaia', '360ca'] },
  { name: 'Adriana', agents: ['robin', 'gaia'] },
  { name: 'Mina', agents: ['thea', 'catch'] },
  { name: 'Phung', agents: ['barom'] },
  { name: 'Mark', agents: ['medgar'] },
  { name: 'Zach', agents: ['cr7'] },
  { name: 'Troy', agents: ['ivan'] },
  { name: 'James', agents: ['oscar'] },
  { name: 'Matt', agents: ['miles'] },
];

export function getLegacyDashboardSeedPassword(name: string): string {
  return `${name.trim().toLowerCase()}2025`;
}

export function getLegacyDashboardPasswordHash(name: string): string {
  return createHash('sha256').update(getLegacyDashboardSeedPassword(name)).digest('hex');
}
