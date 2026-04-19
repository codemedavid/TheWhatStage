"use client";

import { useState, useEffect, useCallback } from "react";

export interface CampaignPhase {
  id: string;
  campaign_id: string;
  tenant_id: string;
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone: string | null;
  goals: string | null;
  transition_hint: string | null;
  action_button_ids: string[];
  image_attachment_ids: string[];
  created_at: string;
}

type CreateInput = {
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone?: string;
  goals?: string;
  transition_hint?: string;
  action_button_ids?: string[];
  image_attachment_ids?: string[];
};

type UpdateInput = Partial<Omit<CreateInput, "order_index">>;
type ReorderItem = { id: string; order_index: number };

export function useCampaignPhases(campaignId: string) {
  const [phases, setPhases] = useState<CampaignPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/campaigns/${campaignId}/phases`;

  const fetchPhases = useCallback(async () => {
    try {
      const res = await fetch(base);
      if (!res.ok) { setError("Failed to fetch phases"); return; }
      const data = await res.json();
      setPhases(data.phases);
      setError(null);
    } catch {
      setError("Failed to fetch phases");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { fetchPhases(); }, [fetchPhases]);

  const createPhase = useCallback(async (input: CreateInput) => {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("Failed to create phase");
    await fetchPhases();
  }, [base, fetchPhases]);

  const updatePhase = useCallback(async (phaseId: string, input: UpdateInput) => {
    const res = await fetch(`${base}/${phaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("Failed to update phase");
    await fetchPhases();
  }, [base, fetchPhases]);

  const deletePhase = useCallback(async (phaseId: string) => {
    const res = await fetch(`${base}/${phaseId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete phase");
    await fetchPhases();
  }, [base, fetchPhases]);

  const reorderPhases = useCallback(async (items: ReorderItem[]) => {
    const res = await fetch(`${base}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    });
    if (!res.ok) throw new Error("Failed to reorder");
    await fetchPhases();
  }, [base, fetchPhases]);

  return { phases, loading, error, createPhase, updatePhase, deletePhase, reorderPhases };
}
