"use client";

import { useState, useCallback } from "react";
import { GitBranch, Settings, BarChart3, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import CampaignFlowPanel from "@/components/dashboard/campaigns/CampaignFlowPanel";
import CampaignForm from "@/components/dashboard/campaigns/CampaignForm";
import PhaseMetricsFunnel from "@/components/dashboard/campaigns/PhaseMetricsFunnel";
import type { Campaign } from "@/hooks/useCampaigns";

type Tab = "flow" | "settings" | "metrics";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "flow", label: "Flow", icon: GitBranch },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "metrics", label: "Metrics", icon: BarChart3 },
];

export default function CampaignEditorClient({
  campaign: initialCampaign,
}: {
  campaign: Campaign;
}) {
  const [tab, setTab] = useState<Tab>("flow");
  const [campaign, setCampaign] = useState(initialCampaign);

  const handleSave = useCallback(
    async (updates: Partial<Campaign>) => {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setCampaign(data.campaign);
    },
    [campaign.id]
  );

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/app/campaigns" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">{campaign.name}</h1>
      </div>

      <div className="mb-6 flex gap-0 border-b border-[var(--ws-border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-[var(--ws-accent)] text-[var(--ws-accent)]"
                : "text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "flow" && <CampaignFlowPanel campaignId={campaign.id} />}
      {tab === "settings" && <CampaignForm campaign={campaign} onSave={handleSave} />}
      {tab === "metrics" && <PhaseMetricsFunnel campaignId={campaign.id} />}
    </div>
  );
}
