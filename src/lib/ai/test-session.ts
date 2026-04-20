// src/lib/ai/test-session.ts
import type { CurrentPhase } from "@/lib/ai/phase-machine";

export interface TestSession {
  id: string;
  tenantId: string;
  campaignId: string | null; // null = default bot flow
  currentPhaseIndex: number;
  messageCount: number;
  history: { role: "user" | "bot"; text: string }[];
  phases: PhaseConfig[];
  createdAt: number;
}

export interface PhaseConfig {
  id: string;
  name: string;
  orderIndex: number;
  maxMessages: number;
  systemPrompt: string;
  tone: string;
  goals: string | null;
  transitionHint: string | null;
  actionButtonIds: string[] | null;
}

// Sessions expire after 30 minutes of inactivity
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 1000;
const sessions = new Map<string, TestSession>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
}

function sessionKey(tenantId: string, sessionId: string): string {
  return `${tenantId}:${sessionId}`;
}

export function createSession(
  tenantId: string,
  sessionId: string,
  campaignId: string | null,
  phases: PhaseConfig[]
): TestSession {
  if (sessions.size > MAX_SESSIONS) evictExpired();

  const session: TestSession = {
    id: sessionId,
    tenantId,
    campaignId,
    currentPhaseIndex: 0,
    messageCount: 0,
    history: [],
    phases,
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
  if (role === "user") {
    session.messageCount += 1;
  }
  session.createdAt = Date.now(); // refresh TTL
}

export function getCurrentPhaseConfig(session: TestSession): PhaseConfig | null {
  return session.phases[session.currentPhaseIndex] ?? null;
}

export function advanceSessionPhase(session: TestSession): PhaseConfig | null {
  if (session.currentPhaseIndex >= session.phases.length - 1) {
    return session.phases[session.currentPhaseIndex]; // stay at last phase
  }
  session.currentPhaseIndex += 1;
  session.messageCount = 0;
  return session.phases[session.currentPhaseIndex];
}

export function jumpToPhase(session: TestSession, phaseId: string): PhaseConfig | null {
  const index = session.phases.findIndex((p) => p.id === phaseId);
  if (index === -1) return null;
  session.currentPhaseIndex = index;
  session.messageCount = 0;
  return session.phases[index];
}

export function phaseToCurrentPhase(phase: PhaseConfig, messageCount: number): CurrentPhase {
  return {
    conversationPhaseId: `test-${phase.id}`,
    phaseId: phase.id,
    name: phase.name,
    orderIndex: phase.orderIndex,
    maxMessages: phase.maxMessages,
    systemPrompt: phase.systemPrompt,
    tone: phase.tone,
    goals: phase.goals,
    transitionHint: phase.transitionHint,
    actionButtonIds: phase.actionButtonIds,
    messageCount,
  };
}
