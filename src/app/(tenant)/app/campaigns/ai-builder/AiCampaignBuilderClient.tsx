"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import AiBuilderChat, { type BuilderMessage } from "@/components/dashboard/campaigns/AiBuilderChat";
import AiBuilderPreview from "@/components/dashboard/campaigns/AiBuilderPreview";
import type { CampaignPlan, GeneratedCampaignPhase } from "@/lib/ai/campaign-builder";

interface CampaignRef {
  id: string;
  name: string;
  description?: string | null;
  goal?: string;
}

type BuilderState = "no_plan" | "has_plan" | "has_phases";

export default function AiCampaignBuilderClient() {
  const router = useRouter();
  const [messages, setMessages] = useState<BuilderMessage[]>([]);
  const [input, setInput] = useState("");
  const [campaign, setCampaign] = useState<CampaignRef | null>(null);
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [rules, setRules] = useState<string[]>([]);
  const [phases, setPhases] = useState<GeneratedCampaignPhase[]>([]);
  const [focusedPhaseIndex, setFocusedPhaseIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const builderState: BuilderState = !plan ? "no_plan" : phases.length > 0 ? "has_phases" : "has_plan";

  const submit = async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    const nextMessages: BuilderMessage[] = [...messages, { role: "user", text: userMessage }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      if (builderState === "has_phases") {
        const res = await fetch("/api/campaigns/ai-builder/phase-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: campaign!.id,
            message: userMessage,
            history: messages,
            focusedPhaseIndex: focusedPhaseIndex ?? undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to edit phases");

        setPhases(data.phases);
        if (data.rulesUpdate) setRules(data.rulesUpdate);
        setFocusedPhaseIndex(null);
        setMessages([...nextMessages, { role: "assistant", text: `Phases updated (${data.action}).` }]);
      } else {
        const res = await fetch("/api/campaigns/ai-builder/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: campaign?.id,
            message: userMessage,
            history: messages,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to generate plan");

        if (data.action === "question") {
          setMessages([...nextMessages, { role: "assistant", text: data.question }]);
        } else {
          setCampaign(data.campaign);
          setPlan(data.plan);
          setRules(data.rules ?? []);
          setMessages([...nextMessages, { role: "assistant", text: "Campaign plan generated. Review it and click Generate Phases when ready." }]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const generatePhases = async () => {
    if (!campaign) return;
    setActionLoading("phases");
    setError(null);
    try {
      const res = await fetch("/api/campaigns/ai-builder/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate phases");
      setPhases(data.phases);
      setMessages((prev) => [...prev, { role: "assistant", text: "Phases generated. Click a phase to focus on it, or describe changes." }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate phases");
    } finally {
      setActionLoading(null);
    }
  };

  const addPhase = () => {
    setFocusedPhaseIndex(null);
    setInput("Add a new phase ");
  };

  const testAgainstPrimary = async () => {
    if (!campaign) return;
    if (!window.confirm("Start a 50/50 test between your primary campaign and this draft?")) return;
    setActionLoading("test");
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/test-against-primary`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create experiment");
      router.push(`/app/campaigns/experiments/${data.experiment.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create experiment");
    } finally {
      setActionLoading(null);
    }
  };

  const makePrimary = async () => {
    if (!campaign) return;
    setActionLoading("primary");
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_primary: true, status: "active" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to promote");
      router.push(`/app/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote");
    } finally {
      setActionLoading(null);
    }
  };

  const focusedPhaseName = focusedPhaseIndex !== null ? phases[focusedPhaseIndex]?.name ?? null : null;

  return (
    <div className="min-h-screen bg-[var(--ws-page)]">
      <div className="border-b border-[var(--ws-border)] bg-white px-6 py-4 pt-14 md:pt-4">
        <div className="flex items-center gap-3">
          <Link href="/app/campaigns" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">Build Campaign With AI</h1>
            <p className="text-sm text-[var(--ws-text-muted)]">Design the sales system. Generate phases. Refine until ready.</p>
          </div>
        </div>
      </div>
      <div className="grid min-h-[calc(100vh-96px)] grid-cols-1 md:grid-cols-[420px_1fr]">
        <AiBuilderChat
          messages={messages}
          value={input}
          builderState={builderState}
          focusedPhaseName={focusedPhaseName}
          loading={loading}
          error={error}
          onChange={setInput}
          onSubmit={submit}
        />
        <AiBuilderPreview
          campaign={campaign}
          plan={plan}
          rules={rules}
          phases={phases}
          focusedPhaseIndex={focusedPhaseIndex}
          actionLoading={actionLoading}
          onGeneratePhases={generatePhases}
          onAddPhase={addPhase}
          onFocusPhase={setFocusedPhaseIndex}
          onTestAgainstPrimary={testAgainstPrimary}
          onMakePrimary={makePrimary}
        />
      </div>
    </div>
  );
}
