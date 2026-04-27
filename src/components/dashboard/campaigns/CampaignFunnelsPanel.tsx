"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Save, Plus, X } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { FunnelStructureWizard } from "./FunnelStructureWizard";
import { FunnelRulesPanel } from "./FunnelRulesPanel";
import type { AvailablePage } from "@/lib/ai/funnel-builder";
import type { ActionPageType } from "@/lib/ai/funnel-templates";
import type { Campaign } from "@/hooks/useCampaigns";

interface FunnelDraft {
  actionPageId: string;
  pageDescription: string | null;
  pitch: string | null;
  qualificationQuestions: string[];
  chatRules: string[];
}

interface ApiFunnel {
  id: string;
  campaignId: string;
  position: number;
  actionPageId: string;
  pageDescription: string | null;
  pitch: string | null;
  qualificationQuestions: string[];
  chatRules: string[];
}

interface Props {
  campaign: Campaign;
  onCampaignChange: (next: Campaign) => void;
}

const inputClass =
  "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

export default function CampaignFunnelsPanel({ campaign, onCampaignChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availablePages, setAvailablePages] = useState<AvailablePage[]>([]);
  const [funnels, setFunnels] = useState<FunnelDraft[]>([]);
  const [topLevelRules, setTopLevelRules] = useState<string[]>(
    campaign.campaign_rules ?? []
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/campaigns/${campaign.id}/funnels`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to load funnels");
        }
        const data = (await res.json()) as {
          funnels: ApiFunnel[];
          availablePages: AvailablePage[];
        };
        if (cancelled) return;
        setAvailablePages(data.availablePages);
        setFunnels(
          data.funnels.map((f) => ({
            actionPageId: f.actionPageId,
            pageDescription: f.pageDescription,
            pitch: f.pitch,
            qualificationQuestions: f.qualificationQuestions,
            chatRules: f.chatRules.length ? f.chatRules : [""],
          }))
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load funnels");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign.id]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const cleanedFunnels = funnels.map((f) => ({
        actionPageId: f.actionPageId,
        pageDescription: f.pageDescription?.trim() ? f.pageDescription.trim() : null,
        pitch: f.pitch?.trim() ? f.pitch.trim() : null,
        qualificationQuestions: f.qualificationQuestions.map((q) => q.trim()).filter(Boolean),
        chatRules: f.chatRules.map((r) => r.trim()).filter(Boolean),
      }));

      if (cleanedFunnels.some((f) => f.chatRules.length === 0)) {
        throw new Error("Each funnel needs at least one chat rule");
      }

      const funnelsRes = await fetch(`/api/campaigns/${campaign.id}/funnels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnels: cleanedFunnels }),
      });
      if (!funnelsRes.ok) {
        const body = await funnelsRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save funnels");
      }

      const cleanedRules = topLevelRules.map((r) => r.trim()).filter(Boolean);
      const campaignRes = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_rules: cleanedRules }),
      });
      if (!campaignRes.ok) {
        const body = await campaignRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save campaign rules");
      }
      const campaignData = await campaignRes.json();
      onCampaignChange(campaignData.campaign);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [campaign.id, funnels, topLevelRules, onCampaignChange]);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-lg bg-[var(--ws-border)]" />;
  }

  if (availablePages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--ws-border-strong)] bg-white p-8 text-center">
        <p className="text-sm font-medium text-[var(--ws-text-primary)]">
          No published action pages yet
        </p>
        <p className="mt-1 text-xs text-[var(--ws-text-muted)]">
          Funnels send leads to action pages. Create and publish at least one to
          build your funnel.
        </p>
        <Link href="/app/actions" className="mt-3 inline-block">
          <Button variant="primary">Manage action pages</Button>
        </Link>
      </div>
    );
  }

  if (funnels.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--ws-border-strong)] bg-white p-8 text-center">
        <p className="text-sm font-medium text-[var(--ws-text-primary)]">
          This campaign has no funnels yet
        </p>
        <p className="mt-1 text-xs text-[var(--ws-text-muted)]">
          Funnels are the steps the bot drives leads through. Add one to get
          started.
        </p>
        <button
          type="button"
          onClick={() =>
            setFunnels([
              {
                actionPageId: availablePages[0].id,
                pageDescription: null,
                pitch: null,
                qualificationQuestions: [],
                chatRules: [""],
              },
            ])
          }
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--ws-accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--ws-accent-hover)]"
        >
          <Plus className="h-4 w-4" />
          Add first funnel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-[var(--ws-border)] bg-white p-5 shadow-[var(--ws-shadow-sm)]">
        <h2 className="text-sm font-semibold text-[var(--ws-text-primary)]">
          Funnel structure
        </h2>
        <p className="mb-4 mt-1 text-xs text-[var(--ws-text-muted)]">
          Reorder, swap, or add steps. Each step is an action page leads will be
          sent to.
        </p>
        <FunnelStructureWizard
          availablePages={availablePages}
          funnels={funnels.map((f) => ({ actionPageId: f.actionPageId }))}
          onChange={(next) =>
            setFunnels(
              next.map((n, i) =>
                funnels[i]
                  ? { ...funnels[i], actionPageId: n.actionPageId }
                  : {
                      actionPageId: n.actionPageId,
                      pageDescription: null,
                      pitch: null,
                      qualificationQuestions: [],
                      chatRules: [""],
                    }
              )
            )
          }
        />
      </section>

      <section className="rounded-xl border border-[var(--ws-border)] bg-white p-5 shadow-[var(--ws-shadow-sm)]">
        <h2 className="text-sm font-semibold text-[var(--ws-text-primary)]">
          Top-level rules
        </h2>
        <p className="mb-3 mt-1 text-xs text-[var(--ws-text-muted)]">
          These apply to the whole campaign across every funnel step.
        </p>
        <ul className="space-y-2">
          {topLevelRules.map((r, i) => (
            <li key={i} className="flex gap-2">
              <input
                className={inputClass}
                value={r}
                onChange={(e) => {
                  const next = [...topLevelRules];
                  next[i] = e.target.value;
                  setTopLevelRules(next);
                }}
                placeholder="Describe a top-level rule..."
              />
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ws-border)] bg-white text-[var(--ws-text-tertiary)] transition-colors hover:border-red-200 hover:bg-[var(--ws-danger-light)] hover:text-[var(--ws-danger)]"
                onClick={() =>
                  setTopLevelRules(topLevelRules.filter((_, j) => j !== i))
                }
                aria-label="Remove rule"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ws-accent)] transition-colors hover:text-[var(--ws-accent-hover)]"
          onClick={() => setTopLevelRules([...topLevelRules, ""])}
        >
          <Plus className="h-4 w-4" />
          Add rule
        </button>
      </section>

      {funnels.map((f, i) => {
        const page = availablePages.find((p) => p.id === f.actionPageId);
        if (!page) return null;
        return (
          <FunnelRulesPanel
            key={`${i}-${f.actionPageId}`}
            index={i + 1}
            pageType={page.type as ActionPageType}
            pageTitle={page.title}
            description={f.pageDescription}
            pitch={f.pitch}
            qualificationQuestions={f.qualificationQuestions}
            rules={f.chatRules}
            onChange={({ description, pitch, qualificationQuestions, rules }) => {
              const next = [...funnels];
              next[i] = { ...next[i], pageDescription: description, pitch, qualificationQuestions, chatRules: rules };
              setFunnels(next);
            }}
          />
        );
      })}

      <div className="flex items-center justify-end gap-3">
        {savedAt && !saving && (
          <span className="text-xs text-[var(--ws-text-muted)]">Saved</span>
        )}
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save funnel
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
