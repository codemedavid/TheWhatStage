"use client";

import { Plus, FlaskConical } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import CampaignCard from "@/components/dashboard/campaigns/CampaignCard";
import { useCampaigns } from "@/hooks/useCampaigns";

export default function CampaignsClient() {
  const { campaigns, loading, error } = useCampaigns();

  if (loading) {
    return (
      <div className="p-6 pt-14 md:pt-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-[var(--ws-border)]" />
          <div className="h-24 rounded-lg bg-[var(--ws-border)]" />
          <div className="h-24 rounded-lg bg-[var(--ws-border)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--ws-text-primary)]">Campaigns</h1>
          <p className="mt-1 text-sm text-[var(--ws-text-muted)]">
            Manage your conversation campaigns and A/B tests
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app/campaigns/experiments">
            <Button variant="secondary">
              <FlaskConical className="h-4 w-4" />
              Experiments
            </Button>
          </Link>
          <Link href="/app/campaigns/new">
            <Button variant="primary">
              <Plus className="h-4 w-4" />
              New Campaign
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create your first campaign to start building conversation flows"
          action={
            <Link href="/app/campaigns/new">
              <Button variant="primary">
                <Plus className="h-4 w-4" />
                Create Campaign
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {campaigns.map((camp) => (
            <CampaignCard
              key={camp.id}
              id={camp.id}
              name={camp.name}
              goal={camp.goal}
              status={camp.status}
              isPrimary={camp.is_primary}
            />
          ))}
        </div>
      )}
    </div>
  );
}
