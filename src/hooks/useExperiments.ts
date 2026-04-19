"use client";

import { useState, useEffect, useCallback } from "react";

export interface Experiment {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  min_sample_size: number;
  started_at: string | null;
  ended_at: string | null;
  winner_campaign_id: string | null;
  created_at: string;
  experiment_campaigns?: {
    campaign_id: string;
    weight: number;
    campaigns?: { id: string; name: string; status: string };
  }[];
}

export function useExperiments() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExperiments = useCallback(async () => {
    try {
      const res = await fetch("/api/experiments");
      if (!res.ok) { setError("Failed to fetch experiments"); return; }
      const data = await res.json();
      setExperiments(data.experiments);
      setError(null);
    } catch {
      setError("Failed to fetch experiments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExperiments(); }, [fetchExperiments]);

  const createExperiment = useCallback(
    async (input: {
      name: string;
      campaigns: { campaign_id: string; weight: number }[];
      min_sample_size?: number;
    }) => {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create experiment");
      const data = await res.json();
      await fetchExperiments();
      return data.experiment;
    },
    [fetchExperiments]
  );

  const updateExperiment = useCallback(
    async (id: string, updates: Partial<Experiment>) => {
      const res = await fetch(`/api/experiments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update experiment");
      await fetchExperiments();
    },
    [fetchExperiments]
  );

  const promoteWinner = useCallback(
    async (experimentId: string, winnerCampaignId: string) => {
      const res = await fetch(`/api/experiments/${experimentId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner_campaign_id: winnerCampaignId }),
      });
      if (!res.ok) throw new Error("Failed to promote winner");
      await fetchExperiments();
    },
    [fetchExperiments]
  );

  return { experiments, loading, error, createExperiment, updateExperiment, promoteWinner, refetch: fetchExperiments };
}
