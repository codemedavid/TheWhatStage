"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface KnowledgeDoc {
  id: string;
  title: string;
  type: "pdf" | "docx" | "xlsx" | "faq" | "richtext" | "product";
  status: "processing" | "ready" | "error";
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useKnowledgeDocs() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge/docs");
      if (!res.ok) {
        setError("Failed to fetch documents");
        return;
      }
      const data = await res.json();
      setDocs(data.docs);
      setError(null);
    } catch {
      setError("Failed to fetch documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Poll every 3s when any doc is still processing
  useEffect(() => {
    const hasProcessing = docs.some((d) => d.status === "processing");

    if (hasProcessing) {
      intervalRef.current = setInterval(fetchDocs, 3000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [docs, fetchDocs]);

  return { docs, loading, error, refetch: fetchDocs };
}
