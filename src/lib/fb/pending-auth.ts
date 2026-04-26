import { randomUUID } from "crypto";

export interface FbPendingAuth {
  userAccessToken: string;
  pages: Array<{
    id: string;
    name: string;
    access_token: string;
    category: string;
    picture: string | null;
  }>;
}

interface Entry {
  data: FbPendingAuth;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const store = new Map<string, Entry>();

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

export function storePendingAuth(data: FbPendingAuth): string {
  purgeExpired();
  const token = randomUUID();
  store.set(token, { data, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function consumePendingAuth(token: string): FbPendingAuth | null {
  purgeExpired();
  const entry = store.get(token);
  if (!entry) return null;
  store.delete(token);
  return entry.data;
}

export function peekPendingAuth(token: string): FbPendingAuth | null {
  const entry = store.get(token);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.data;
}
