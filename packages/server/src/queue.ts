import { getDb, newId } from './db.js';
import { AgentClaim } from '@determinant/types';

const DEFAULT_CLAIM_TTL_MINUTES = 30;

export function claimNode(nodeId: string, ttlMinutes: number = DEFAULT_CLAIM_TTL_MINUTES): AgentClaim | null {
  const db = getDb();

  const existing = db.prepare(`
    SELECT id FROM agent_claims WHERE node_id = ? AND expires_at > ?
  `).get(nodeId, new Date().toISOString()) as any;

  if (existing) {
    return null;
  }

  const id = newId();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  db.prepare(`
    INSERT INTO agent_claims (id, node_id, claimed_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, nodeId, now.toISOString(), expires.toISOString());

  return {
    id,
    nodeId,
    claimedAt: now,
    expiresAt: expires,
  };
}

export function releaseClaim(claimId: string): boolean {
  const db = getDb();
  const result = db.prepare(`
    DELETE FROM agent_claims WHERE id = ?
  `).run(claimId);

  return result.changes > 0;
}

export function getClaim(claimId: string): AgentClaim | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, node_id as nodeId, claimed_at as claimedAt, expires_at as expiresAt
    FROM agent_claims WHERE id = ?
  `).get(claimId) as any;

  if (!row) return null;

  return {
    ...row,
    claimedAt: new Date(row.claimedAt),
    expiresAt: new Date(row.expiresAt),
  };
}

export function getClaimByNode(nodeId: string): AgentClaim | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, node_id as nodeId, claimed_at as claimedAt, expires_at as expiresAt
    FROM agent_claims WHERE node_id = ? AND expires_at > ?
  `).get(nodeId, new Date().toISOString()) as any;

  if (!row) return null;

  return {
    ...row,
    claimedAt: new Date(row.claimedAt),
    expiresAt: new Date(row.expiresAt),
  };
}

export function getActiveClaims(): AgentClaim[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, node_id as nodeId, claimed_at as claimedAt, expires_at as expiresAt
    FROM agent_claims WHERE expires_at > ?
    ORDER BY expires_at ASC
  `).all(new Date().toISOString()) as any[];

  return rows.map(row => ({
    ...row,
    claimedAt: new Date(row.claimedAt),
    expiresAt: new Date(row.expiresAt),
  }));
}

export function cleanupExpiredClaims(): number {
  const db = getDb();
  const result = db.prepare(`
    DELETE FROM agent_claims WHERE expires_at <= ?
  `).run(new Date().toISOString());

  return result.changes;
}

export function renewClaim(claimId: string, ttlMinutes: number = DEFAULT_CLAIM_TTL_MINUTES): boolean {
  const db = getDb();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const result = db.prepare(`
    UPDATE agent_claims SET expires_at = ? WHERE id = ?
  `).run(expires.toISOString(), claimId);

  return result.changes > 0;
}

export function isNodeClaimed(nodeId: string): boolean {
  const claim = getClaimByNode(nodeId);
  return claim !== null;
}