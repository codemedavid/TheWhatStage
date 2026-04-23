// src/lib/fb/page-cache.ts

export interface CachedPage {
  tenantId: string;
  pageToken: string;
  pageName: string;
  pageId: string; // tenant_pages.id (UUID)
}

interface CacheEntry extends CachedPage {
  cachedAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();

/**
 * Get a cached page by Facebook page ID.
 * Returns null on miss or stale entry (caller should query DB).
 */
export function getCachedPage(fbPageId: string): CachedPage | null {
  const entry = cache.get(fbPageId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL) {
    cache.delete(fbPageId);
    return null;
  }
  return {
    tenantId: entry.tenantId,
    pageToken: entry.pageToken,
    pageName: entry.pageName,
    pageId: entry.pageId,
  };
}

/**
 * Store a page in the cache.
 */
export function setCachedPage(fbPageId: string, page: CachedPage): void {
  cache.set(fbPageId, { ...page, cachedAt: Date.now() });
}

/**
 * Remove a page from the cache (on disconnect or token expiry).
 */
export function invalidateCachedPage(fbPageId: string): void {
  cache.delete(fbPageId);
}
