"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const POLL_INTERVAL_MS = 5000;

export function useEscalationCount(): number {
  const [count, setCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/conversations");
      if (!res.ok) return;
      const data = await res.json();
      const escalated = data.conversations.filter(
        (c: { needsHuman: boolean }) => c.needsHuman
      );
      setCount(escalated.length);
    } catch {
      // Silently ignore — badge is non-critical
    }
  }, []);

  useEffect(() => {
    fetchCount();
    intervalRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchCount]);

  return count;
}
