"use client";

import { useState, useEffect, useCallback } from "react";

export interface FlowPhase {
  id: string;
  tenant_id: string;
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone: string | null;
  goals: string | null;
  transition_hint: string | null;
  action_button_ids: string[] | null;
  image_attachment_ids: string[];
  created_at: string;
}

type CreatePhaseInput = {
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

type UpdatePhaseInput = Partial<Omit<CreatePhaseInput, "order_index">>;

type ReorderItem = { id: string; order_index: number };

type BusinessType = "ecommerce" | "real_estate" | "digital_product" | "services";

export function useFlowPhases() {
  const [phases, setPhases] = useState<FlowPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPhases = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/phases");
      if (!res.ok) {
        setError("Failed to fetch phases");
        return;
      }
      const data = await res.json();
      setPhases(data.phases);
      setError(null);
    } catch {
      setError("Failed to fetch phases");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhases();
  }, [fetchPhases]);

  const createPhase = useCallback(
    async (input: CreatePhaseInput) => {
      const res = await fetch("/api/bot/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create phase");
      await fetchPhases();
    },
    [fetchPhases]
  );

  const updatePhase = useCallback(
    async (id: string, input: UpdatePhaseInput) => {
      const res = await fetch(`/api/bot/phases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to update phase");
      await fetchPhases();
    },
    [fetchPhases]
  );

  const deletePhase = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/bot/phases/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete phase");
      await fetchPhases();
    },
    [fetchPhases]
  );

  const reorderPhases = useCallback(
    async (order: ReorderItem[]) => {
      const res = await fetch("/api/bot/phases/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error("Failed to reorder phases");
      await fetchPhases();
    },
    [fetchPhases]
  );

  const seedPhases = useCallback(
    async (businessType: BusinessType) => {
      const res = await fetch("/api/bot/phases/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_type: businessType }),
      });
      if (!res.ok) throw new Error("Failed to seed phases");
      await fetchPhases();
    },
    [fetchPhases]
  );

  return {
    phases,
    loading,
    error,
    refetch: fetchPhases,
    createPhase,
    updatePhase,
    deletePhase,
    reorderPhases,
    seedPhases,
  };
}
