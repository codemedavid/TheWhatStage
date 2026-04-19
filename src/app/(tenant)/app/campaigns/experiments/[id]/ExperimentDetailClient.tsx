"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Trophy, Pause, Play } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

interface ExperimentData {
  id: string;
  name: string;
  status: string;
  min_sample_size: number;
  started_at: string | null;
  ended_at: string | null;
  winner_campaign_id: string | null;
  experiment_campaigns: {
    campaign_id: string;
    weight: number;
    campaigns: { id: string; name: string; status: string };
  }[];
}

interface CampaignMetrics {
  campaign_id: string;
  leads: number;
  conversions: number;
  conversion_rate: number;
}

export default function ExperimentDetailClient({ experimentId }: { experimentId: string }) {
  const [experiment, setExperiment] = useState<ExperimentData | null>(null);
  const [metrics, setMetrics] = useState<CampaignMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/experiments/${experimentId}`);
      if (res.ok) {
        const data = await res.json();
        setExperiment(data.experiment);

        const metricsPromises = data.experiment.experiment_campaigns.map(
          async (ec: { campaign_id: string }) => {
            const mRes = await fetch(`/api/campaigns/${ec.campaign_id}/metrics`);
            if (mRes.ok) {
              const mData = await mRes.json();
              return {
                campaign_id: ec.campaign_id,
                leads: mData.summary.total_leads,
                conversions: mData.summary.total_conversions,
                conversion_rate: mData.summary.conversion_rate,
              };
            }
            return { campaign_id: ec.campaign_id, leads: 0, conversions: 0, conversion_rate: 0 };
          }
        );
        setMetrics(await Promise.all(metricsPromises));
      }
      setLoading(false);
    }
    load();
  }, [experimentId]);

  const handleStatusChange = async (newStatus: string) => {
    await fetch(`/api/experiments/${experimentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const res = await fetch(`/api/experiments/${experimentId}`);
    if (res.ok) setExperiment((await res.json()).experiment);
  };

  const handlePromote = async (campaignId: string) => {
    await fetch(`/api/experiments/${experimentId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner_campaign_id: campaignId }),
    });
    const res = await fetch(`/api/experiments/${experimentId}`);
    if (res.ok) setExperiment((await res.json()).experiment);
  };

  if (loading || !experiment) {
    return <div className="p-6 pt-14 md:pt-6 animate-pulse"><div className="h-40 rounded-lg bg-[var(--ws-border)]" /></div>;
  }

  const bestVariant = metrics.length > 0
    ? metrics.reduce((best, m) => (m.conversion_rate > best.conversion_rate ? m : best), metrics[0])
    : null;

  const allMeetSample = metrics.every((m) => m.leads >= experiment.min_sample_size);
  const bestIsSignificant =
    bestVariant &&
    metrics.every(
      (m) => m === bestVariant || bestVariant.conversion_rate > m.conversion_rate * 1.1
    );

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/app/campaigns/experiments" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">{experiment.name}</h1>
          <Badge variant={experiment.status === "running" ? "success" : "default"}>
            {experiment.status.toUpperCase()}
          </Badge>
        </div>
        <div className="flex gap-2">
          {experiment.status === "draft" && (
            <Button variant="primary" onClick={() => handleStatusChange("running")}>
              <Play className="h-4 w-4" /> Start
            </Button>
          )}
          {experiment.status === "running" && (
            <>
              <Button variant="secondary" onClick={() => handleStatusChange("paused")}>
                <Pause className="h-4 w-4" /> Pause
              </Button>
              {bestVariant && (
                <Button variant="primary" onClick={() => handlePromote(bestVariant.campaign_id)}>
                  <Trophy className="h-4 w-4" /> Promote Winner
                </Button>
              )}
            </>
          )}
          {experiment.status === "paused" && (
            <Button variant="primary" onClick={() => handleStatusChange("running")}>
              <Play className="h-4 w-4" /> Resume
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        {experiment.experiment_campaigns.map((ec) => {
          const m = metrics.find((x) => x.campaign_id === ec.campaign_id);
          const isBest = bestVariant?.campaign_id === ec.campaign_id;
          return (
            <div
              key={ec.campaign_id}
              className={`rounded-lg border p-4 ${
                isBest ? "border-[var(--ws-success)] bg-green-50/50" : "border-[var(--ws-border)]"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[var(--ws-text-primary)]">
                  {ec.campaigns?.name ?? ec.campaign_id}
                </h3>
                <span className="text-xs text-[var(--ws-text-muted)] bg-[var(--ws-border)] px-2 py-0.5 rounded">
                  {ec.weight}%
                </span>
              </div>
              <div className="text-2xl font-bold text-[var(--ws-text-primary)]">
                {m ? `${Math.round(m.conversion_rate * 100)}%` : "—"}
                <span className="text-sm font-normal text-[var(--ws-text-muted)] ml-1">conv.</span>
              </div>
              <div className="text-xs text-[var(--ws-text-muted)] mt-1">
                {m?.leads ?? 0} leads · {m?.conversions ?? 0} conversions
              </div>
            </div>
          );
        })}
      </div>

      {allMeetSample && bestIsSignificant && experiment.status === "running" && bestVariant && (
        <div className="mt-4 rounded-lg border border-[var(--ws-success)] bg-green-50 p-4">
          <p className="text-sm text-[var(--ws-text-primary)]">
            <strong>Suggestion:</strong>{" "}
            {experiment.experiment_campaigns.find((ec) => ec.campaign_id === bestVariant.campaign_id)?.campaigns?.name}{" "}
            is converting {Math.round(bestVariant.conversion_rate * 100)}% — significantly better.
            Consider promoting the winner.
          </p>
        </div>
      )}

      {!allMeetSample && experiment.status === "running" && (
        <div className="mt-4 rounded-lg border border-[var(--ws-border)] bg-[var(--ws-accent-subtle)] p-4">
          <p className="text-sm text-[var(--ws-text-muted)]">
            Waiting for all variants to reach minimum sample size ({experiment.min_sample_size} leads each).
          </p>
        </div>
      )}
    </div>
  );
}
