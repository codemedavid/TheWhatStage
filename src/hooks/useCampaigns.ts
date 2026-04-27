"use client";

import { useState, useEffect, useCallback } from "react";
import type { Json } from "@/types/database";

export interface Campaign {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  main_goal: string | null;
  campaign_personality: string | null;
  goal: string;
  goal_config: Json;
  is_primary: boolean;
  status: string;
  follow_up_delay_minutes: number;
  follow_up_message: string | null;
  campaign_plan: Json | null;
  campaign_rules: string[] | null;
  created_at: string;
  updated_at: string;
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns");
      if (!res.ok) {
        setError("Failed to fetch campaigns");
        return;
      }
      const data = await res.json();
      setCampaigns(data.campaigns);
      setError(null);
    } catch {
      setError("Failed to fetch campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const createCampaign = useCallback(
    async (input: { name: string; goal: string; description?: string }) => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      const data = await res.json();
      await fetchCampaigns();
      return data.campaign;
    },
    [fetchCampaigns]
  );

  const deleteCampaign = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete campaign");
      await fetchCampaigns();
    },
    [fetchCampaigns]
  );

  return { campaigns, loading, error, createCampaign, deleteCampaign, refetch: fetchCampaigns };
}
