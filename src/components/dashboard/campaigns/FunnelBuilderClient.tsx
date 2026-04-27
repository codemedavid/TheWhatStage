"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Wand2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import type { AvailablePage } from "@/lib/ai/funnel-builder";
import type { ActionPageType } from "@/lib/ai/funnel-templates";
import { FunnelStructureWizard } from "./FunnelStructureWizard";
import { FunnelRulesPanel } from "./FunnelRulesPanel";
import { FunnelReviewPanel } from "./FunnelReviewPanel";

interface FunnelDraft {
  actionPageId: string;
  pageDescription: string | null;
  pitch: string | null;
  qualificationQuestions: string[];
  chatRules: string[];
}

type Step = "kickoff" | "structure" | "rules" | "review" | "saved";

const STEPS: { id: Step; label: string }[] = [
  { id: "kickoff", label: "Describe" },
  { id: "structure", label: "Structure" },
  { id: "rules", label: "Chat rules" },
  { id: "review", label: "Review" },
];

export function FunnelBuilderClient({ availablePages }: { availablePages: AvailablePage[] }) {
  const [step, setStep] = useState<Step>("kickoff");
  const [kickoff, setKickoff] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [funnels, setFunnels] = useState<FunnelDraft[]>([]);
  const [topLevelRules, setTopLevelRules] = useState<string[]>([]);
  const [mainGoal, setMainGoal] = useState("");
  const [campaignPersonality, setCampaignPersonality] = useState("");
  const [name, setName] = useState("New campaign");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const propose = async () => {
    setError(null);
    setProposing(true);
    try {
      const res = await fetch("/api/campaigns/ai-builder/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kickoff }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Proposal failed");
        return;
      }
      const data = await res.json();
      if (data.action === "question") {
        setQuestion(data.question);
        return;
      }
      setQuestion(null);
      setName(data.name ?? "New campaign");
      setDescription(data.description ?? "");
      setMainGoal(data.mainGoal ?? "");
      setCampaignPersonality(data.campaignPersonality ?? "");
      setTopLevelRules(data.topLevelRules ?? []);
      setFunnels(
        data.funnels.map((f: {
          actionPageId: string;
          pitch?: string | null;
          qualificationQuestions?: string[];
        }) => ({
          actionPageId: f.actionPageId,
          pageDescription: null,
          pitch: f.pitch ?? null,
          qualificationQuestions: f.qualificationQuestions ?? [],
          chatRules: [],
        }))
      );
      setStep("structure");
    } finally {
      setProposing(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/campaigns/ai-builder/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        mainGoal,
        campaignPersonality: campaignPersonality.trim() ? campaignPersonality : null,
        topLevelRules,
        funnels,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Save failed");
      return;
    }
    setStep("saved");
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="mx-auto max-w-3xl p-6 pt-14 md:pt-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/app/campaigns"
          className="text-[var(--ws-text-muted)] transition-colors hover:text-[var(--ws-text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-[var(--ws-accent-subtle)] p-1.5">
            <Sparkles className="h-4 w-4 text-[var(--ws-accent)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">
              Build with AI
            </h1>
            <p className="text-xs text-[var(--ws-text-muted)]">
              Describe your sales motion and let AI draft the funnel
            </p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      {step !== "saved" && (
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((s, i) => {
            const isActive = i === stepIndex;
            const isDone = i < stepIndex;
            return (
              <div key={s.id} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--ws-accent)] text-white"
                      : isDone
                        ? "bg-[var(--ws-accent-light)] text-[var(--ws-accent)]"
                        : "bg-[var(--ws-border-subtle)] text-[var(--ws-text-muted)]"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={`text-xs font-medium ${
                    isActive
                      ? "text-[var(--ws-text-primary)]"
                      : "text-[var(--ws-text-muted)]"
                  }`}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className="ml-1 h-px flex-1 bg-[var(--ws-border)]" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Step content */}
      {step === "kickoff" && (
        <div className="rounded-xl border border-[var(--ws-border)] bg-white p-6 shadow-[var(--ws-shadow-sm)]">
          <label className="mb-2 block text-sm font-medium text-[var(--ws-text-primary)]">
            What are you trying to do with this campaign?
          </label>
          <p className="mb-3 text-xs text-[var(--ws-text-muted)]">
            Describe your offer, target audience, and what you want the bot to do.
            Think of it like briefing a teammate.
          </p>
          <textarea
            className="min-h-[180px] w-full resize-y rounded-lg border border-[var(--ws-border)] bg-white p-3 text-sm text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]"
            value={kickoff}
            onChange={(e) => setKickoff(e.target.value)}
            placeholder="e.g. We sell a $497 vacation package. Qualify leads, surface their bottleneck, then send them to the sales page to lock in the sale."
          />

          {question && (
            <div className="mt-4 rounded-lg border border-[var(--ws-accent-light)] bg-[var(--ws-accent-subtle)] p-3">
              <div className="flex items-start gap-2">
                <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ws-accent)]" />
                <div>
                  <p className="text-xs font-medium text-[var(--ws-accent)]">
                    AI needs a bit more
                  </p>
                  <p className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                    {question}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button
              variant="primary"
              onClick={propose}
              disabled={!kickoff.trim() || proposing}
            >
              {proposing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Propose funnel
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {step === "structure" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--ws-border)] bg-white p-6 shadow-[var(--ws-shadow-sm)]">
            <h2 className="text-sm font-semibold text-[var(--ws-text-primary)]">
              Funnel structure
            </h2>
            <p className="mt-1 text-xs text-[var(--ws-text-muted)]">
              Reorder, swap, or add steps. Each step is an action page leads will
              be sent to.
            </p>
            <div className="mt-4">
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
                            chatRules: [],
                          }
                    )
                  )
                }
              />
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep("kickoff")}>
              Back
            </Button>
            <Button variant="primary" onClick={() => setStep("rules")}>
              Next: chat rules
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === "rules" && (
        <div className="space-y-4">
          {funnels.map((f, i) => {
            const page = availablePages.find((p) => p.id === f.actionPageId)!;
            return (
              <FunnelRulesPanel
                key={i}
                index={i + 1}
                pageType={page.type as ActionPageType}
                pageTitle={page.title}
                description={f.pageDescription}
                pitch={f.pitch}
                qualificationQuestions={f.qualificationQuestions}
                rules={f.chatRules}
                onChange={({ description: desc, pitch, qualificationQuestions, rules }) => {
                  const next = [...funnels];
                  next[i] = {
                    ...next[i],
                    pageDescription: desc,
                    pitch,
                    qualificationQuestions,
                    chatRules: rules,
                  };
                  setFunnels(next);
                }}
              />
            );
          })}
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep("structure")}>
              Back
            </Button>
            <Button variant="primary" onClick={() => setStep("review")}>
              Next: review
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <FunnelReviewPanel
            name={name}
            description={description}
            topLevelRules={topLevelRules}
            mainGoal={mainGoal}
            campaignPersonality={campaignPersonality}
            funnels={funnels}
            availablePages={availablePages}
            saving={saving}
            onName={setName}
            onDescription={setDescription}
            onMainGoal={setMainGoal}
            onCampaignPersonality={setCampaignPersonality}
            onTopLevelRules={setTopLevelRules}
            onSave={save}
          />
          <div className="flex justify-start">
            <Button variant="secondary" onClick={() => setStep("rules")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {step === "saved" && (
        <div className="rounded-xl border border-[var(--ws-border)] bg-white p-10 text-center shadow-[var(--ws-shadow-sm)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ws-accent-light)]">
            <CheckCircle2 className="h-6 w-6 text-[var(--ws-accent)]" />
          </div>
          <h2 className="text-base font-semibold text-[var(--ws-text-primary)]">
            Campaign saved
          </h2>
          <p className="mt-1 text-sm text-[var(--ws-text-muted)]">
            Your AI-built funnel is ready. You can fine-tune it from the campaigns
            list.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/app/campaigns">
              <Button variant="primary">Go to campaigns</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
