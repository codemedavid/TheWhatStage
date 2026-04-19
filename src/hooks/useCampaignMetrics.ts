"use client";

import { useState, useEffect, useCallback } from "react";

export interface PhaseMetric {
  phase_id: string;
  name: string;
  order_index: number;
  entered: number;
  advanced: number;
  dropped: number;
  in_progress: number;
  success_rate: number;
  avg_messages: number;
  avg_time_minutes: number;
}

export interface CampaignSummary {
  total_leads: number;
  total_conversions: number;
  conversion_rate: number;
  highest_drop_off: string | null;
  highest_drop_off_rate: number;
}

export function useCampaignMetrics(campaignId: string) {
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [phases, setPhases] = useState<PhaseMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/metrics`);
      if (!res.ok) return;
      const data = await res.json();
      setSummary(data.summary);
      setPhases(data.phases);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  return { summary, phases, loading, refetch: fetchMetrics };
}
