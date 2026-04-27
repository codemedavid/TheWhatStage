import type { CampaignFunnel } from "@/types/campaign-funnel";
import type { ActionPageType } from "@/lib/ai/funnel-templates";

export interface FunnelWithPage extends CampaignFunnel {
  pageTitle: string;
  pageType: ActionPageType;
}

export interface TestSession {
  id: string;
  tenantId: string;
  campaignId: string | null;
  currentFunnelIndex: number;
  funnelMessageCount: number;
  funnelButtonSentAtCount: number | null;
  history: { role: "user" | "bot"; text: string }[];
  funnels: FunnelWithPage[];
  createdAt: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 1000;
const sessions = new Map<string, TestSession>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(key);
  }
}

function sessionKey(tenantId: string, sessionId: string): string {
  return `${tenantId}:${sessionId}`;
}

export function createSession(
  tenantId: string,
  sessionId: string,
  campaignId: string | null,
  funnels: FunnelWithPage[]
): TestSession {
  if (sessions.size > MAX_SESSIONS) evictExpired();
  const session: TestSession = {
    id: sessionId,
    tenantId,
    campaignId,
    currentFunnelIndex: 0,
    funnelMessageCount: 0,
    funnelButtonSentAtCount: null,
    history: [],
    funnels,
    createdAt: Date.now(),
  };
  sessions.set(sessionKey(tenantId, sessionId), session);
  return session;
}

export function getSession(tenantId: string, sessionId: string): TestSession | null {
  const session = sessions.get(sessionKey(tenantId, sessionId));
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionKey(tenantId, sessionId));
    return null;
  }
  return session;
}

export function deleteSession(tenantId: string, sessionId: string): void {
  sessions.delete(sessionKey(tenantId, sessionId));
}

export function addMessage(session: TestSession, role: "user" | "bot", text: string): void {
  session.history.push({ role, text });
  if (role === "user") session.funnelMessageCount += 1;
  session.createdAt = Date.now();
}

export function getCurrentFunnel(session: TestSession): FunnelWithPage | null {
  return session.funnels[session.currentFunnelIndex] ?? null;
}

export function advanceSessionFunnel(
  session: TestSession
): { funnel: FunnelWithPage; advanced: boolean; completed: boolean } {
  const last = session.funnels.length - 1;
  if (session.currentFunnelIndex >= last) {
    return { funnel: session.funnels[last], advanced: false, completed: true };
  }
  session.currentFunnelIndex += 1;
  session.funnelMessageCount = 0;
  session.funnelButtonSentAtCount = null;
  return { funnel: session.funnels[session.currentFunnelIndex], advanced: true, completed: false };
}

export function jumpToFunnel(session: TestSession, funnelId: string): FunnelWithPage | null {
  const idx = session.funnels.findIndex((f) => f.id === funnelId);
  if (idx === -1) return null;
  session.currentFunnelIndex = idx;
  session.funnelMessageCount = 0;
  session.funnelButtonSentAtCount = null;
  return session.funnels[idx];
}

export function markSessionButtonSent(session: TestSession): void {
  session.funnelButtonSentAtCount = session.funnelMessageCount;
}
