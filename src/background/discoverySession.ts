import type { Job } from "../types/job";

export const DISCOVERY_SESSION_TTL_MS = 5 * 60 * 1000;

export interface DiscoverySession {
  sessionId: string;
  sourceTabId: number;
  sourceJob: Job;
  createdAt: number;
  expiresAt: number;
  linkedTargetTabId?: number;
  linkedAtsJobId?: string;
}

export interface AssociationResolution {
  kind: "linked" | "automatic" | "unlinked" | "ambiguous";
  session?: DiscoverySession;
  candidates: DiscoverySession[];
}

export function createDiscoverySession(
  sessionId: string,
  sourceTabId: number,
  sourceJob: Job,
  now: number
): DiscoverySession {
  return {
    sessionId,
    sourceTabId,
    sourceJob,
    createdAt: now,
    expiresAt: now + DISCOVERY_SESSION_TTL_MS,
  };
}

export function removeExpiredSessions(
  sessions: DiscoverySession[],
  now: number
): DiscoverySession[] {
  return sessions.filter((session) => session.expiresAt > now);
}

export function resolveAssociation(
  sessions: DiscoverySession[],
  targetTabId: number,
  openerTabId: number | undefined,
  atsJobId: string,
  now: number
): AssociationResolution {
  const active = removeExpiredSessions(sessions, now);
  const alreadyLinked = active.find(
    (session) =>
      session.linkedTargetTabId === targetTabId &&
      session.linkedAtsJobId === atsJobId
  );
  if (alreadyLinked) {
    return { kind: "linked", session: alreadyLinked, candidates: [] };
  }

  const automatic = active.filter(
    (session) =>
      session.sourceTabId === targetTabId ||
      (openerTabId !== undefined && session.sourceTabId === openerTabId)
  );
  if (automatic.length === 1) {
    return { kind: "automatic", session: automatic[0], candidates: [] };
  }

  const byPostingId = new Map<string, DiscoverySession>();
  for (const session of active.sort((a, b) => b.createdAt - a.createdAt)) {
    if (!byPostingId.has(session.sourceJob.externalJobId)) {
      byPostingId.set(session.sourceJob.externalJobId, session);
    }
  }
  const candidates = [...byPostingId.values()];
  return {
    kind: candidates.length > 0 ? "ambiguous" : "unlinked",
    candidates,
  };
}

export function markSessionLinked(
  session: DiscoverySession,
  targetTabId: number,
  atsJobId: string
): DiscoverySession {
  return {
    ...session,
    linkedTargetTabId: targetTabId,
    linkedAtsJobId: atsJobId,
  };
}
