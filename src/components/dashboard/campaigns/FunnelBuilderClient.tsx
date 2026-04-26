"use client";
import { useState } from "react";
import type { AvailablePage } from "@/lib/ai/funnel-builder";
import type { ActionPageType } from "@/lib/ai/funnel-templates";
import { FunnelStructureWizard } from "./FunnelStructureWizard";
import { FunnelRulesPanel } from "./FunnelRulesPanel";
import { FunnelReviewPanel } from "./FunnelReviewPanel";

interface FunnelDraft {
  actionPageId: string;
  pageDescription: string | null;
  chatRules: string[];
}

type Step = "kickoff" | "structure" | "rules" | "review" | "saved";

export function FunnelBuilderClient({ availablePages }: { availablePages: AvailablePage[] }) {
  const [step, setStep] = useState<Step>("kickoff");
  const [kickoff, setKickoff] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [funnels, setFunnels] = useState<FunnelDraft[]>([]);
  const [topLevelRules, setTopLevelRules] = useState<string[]>([]);
  const [name, setName] = useState("New campaign");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const propose = async () => {
    setError(null);
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
    setTopLevelRules(data.topLevelRules ?? []);
    setFunnels(
      data.funnels.map((f: { actionPageId: string }) => ({
        actionPageId: f.actionPageId,
        pageDescription: null,
        chatRules: [],
      }))
    );
    setStep("structure");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/campaigns/ai-builder/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description, topLevelRules, funnels }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Save failed");
      return;
    }
    setStep("saved");
  };

  return (
    <div className="space-y-4">
      {step === "kickoff" && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border p-2"
            value={kickoff}
            onChange={(e) => setKickoff(e.target.value)}
            placeholder="What are you trying to do with this campaign?"
          />
          <button
            type="button"
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={propose}
            disabled={!kickoff.trim()}
          >
            Propose funnel
          </button>
          {question && <p className="text-sm">{question}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {step === "structure" && (
        <div className="space-y-3">
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
                        chatRules: [],
                      }
                )
              )
            }
          />
          <button type="button" onClick={() => setStep("rules")}>
            Next: chat rules
          </button>
        </div>
      )}

      {step === "rules" && (
        <div className="space-y-3">
          {funnels.map((f, i) => {
            const page = availablePages.find((p) => p.id === f.actionPageId)!;
            return (
              <FunnelRulesPanel
                key={i}
                pageType={page.type as ActionPageType}
                pageTitle={page.title}
                description={f.pageDescription}
                rules={f.chatRules}
                onChange={({ description: desc, rules }) => {
                  const next = [...funnels];
                  next[i] = { ...next[i], pageDescription: desc, chatRules: rules };
                  setFunnels(next);
                }}
              />
            );
          })}
          <button type="button" onClick={() => setStep("review")}>
            Next: review
          </button>
        </div>
      )}

      {step === "review" && (
        <FunnelReviewPanel
          name={name}
          description={description}
          topLevelRules={topLevelRules}
          funnels={funnels}
          availablePages={availablePages}
          saving={saving}
          onName={setName}
          onDescription={setDescription}
          onTopLevelRules={setTopLevelRules}
          onSave={save}
        />
      )}

      {step === "saved" && <p>Campaign saved.</p>}
    </div>
  );
}
