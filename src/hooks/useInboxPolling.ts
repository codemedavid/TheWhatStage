"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface InboxConversation {
  id: string;
  leadId: string;
  leadName: string | null;
  leadPic: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  needsHuman: boolean;
  botPausedAt: string | null;
  escalationReason: string | null;
  escalationMessageId: string | null;
}

const POLL_INTERVAL_MS = 5000;

export function useInboxPolling() {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/conversations");
      if (!res.ok) {
        setError("Failed to fetch conversations");
        return;
      }
      const data = await res.json();
      setConversations(data.conversations);
      setError(null);
    } catch {
      setError("Failed to fetch conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    intervalRef.current = setInterval(fetchConversations, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchConversations]);

  return { conversations, loading, error, refetch: fetchConversations };
}
