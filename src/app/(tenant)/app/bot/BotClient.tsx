"use client";

import { useState, useEffect } from "react";
import { clsx } from "clsx";
import {
  BookOpen,
  ShieldCheck,
  MessageCircle,
  ClipboardCheck,
  Plus,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import MessageThread, {
  type Message,
} from "@/components/dashboard/MessageThread";
import KnowledgePanel from "@/components/dashboard/knowledge/KnowledgePanel";
type Tab = "knowledge" | "rules" | "test" | "review";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { id: "rules", label: "Rules & Persona", icon: ShieldCheck },
  { id: "test", label: "Test Chat", icon: MessageCircle },
  { id: "review", label: "Review", icon: ClipboardCheck },
];


function KnowledgeTab() {
  return <KnowledgePanel />;
}

type Rule = {
  id: string;
  rule_text: string;
  category: string;
  enabled: boolean;
  created_at: string;
};

function RulesTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleText, setNewRuleText] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState<"instruction" | "restriction" | "persona">("instruction");
  const [savingRule, setSavingRule] = useState(false);
  const [personaTone, setPersonaTone] = useState<"friendly" | "professional" | "casual">("friendly");
  const [customInstructions, setCustomInstructions] = useState("");
  const [handoffTimeout, setHandoffTimeout] = useState<number | null>(24);
  const [savingTimeout, setSavingTimeout] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [rulesRes, settingsRes] = await Promise.all([
          fetch("/api/bot/rules"),
          fetch("/api/bot/settings"),
        ]);
        if (rulesRes.ok) {
          const data = await rulesRes.json();
          setRules(data.rules ?? []);
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (data.persona_tone) setPersonaTone(data.persona_tone);
          if (data.custom_instructions != null) setCustomInstructions(data.custom_instructions);
          if (data.handoff_timeout_hours !== undefined) setHandoffTimeout(data.handoff_timeout_hours);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSaveRule = async () => {
    if (!newRuleText.trim()) return;
    setSavingRule(true);
    try {
      const res = await fetch("/api/bot/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule_text: newRuleText.trim(), category: newRuleCategory }),
      });
      if (res.ok) {
        const data = await res.json();
        setRules((prev) => [...prev, data.rule]);
        setNewRuleText("");
        setShowAddRule(false);
      }
    } finally {
      setSavingRule(false);
    }
  };

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    setRules((prev) => prev.map((r) => r.id === ruleId ? { ...r, enabled } : r));
    await fetch(`/api/bot/rules/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  };

  const handleDeleteRule = async (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
    await fetch(`/api/bot/rules/${ruleId}`, { method: "DELETE" });
  };

  const handlePersonaSave = async (
    tone: "friendly" | "professional" | "casual",
    instructions: string
  ) => {
    await fetch("/api/bot/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona_tone: tone, custom_instructions: instructions }),
    });
  };

  const handleTimeoutChange = async (value: string) => {
    const hours = value === "never" ? null : parseInt(value, 10);
    setHandoffTimeout(hours);
    setSavingTimeout(true);
    try {
      await fetch("/api/bot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoff_timeout_hours: hours }),
      });
    } finally {
      setSavingTimeout(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--ws-bg-secondary)]" />
        ))}
      </div>
    );
  }

  const CATEGORY_LABELS: Record<string, string> = {
    behavior: "Instruction",
    boundary: "Restriction",
    tone: "Persona",
  };

  return (
    <div>
      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--ws-text-primary)]">Behavior Rules</h3>
          <Button variant="secondary" onClick={() => setShowAddRule(!showAddRule)}>
            <Plus className="h-4 w-4" />
            Add Rule
          </Button>
        </div>

        {showAddRule && (
          <Card className="mb-4 p-4">
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">Rule Type</label>
              <select
                value={newRuleCategory}
                onChange={(e) => setNewRuleCategory(e.target.value as typeof newRuleCategory)}
                className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none"
              >
                <option value="instruction">Instruction</option>
                <option value="restriction">Restriction</option>
                <option value="persona">Persona</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">Rule</label>
              <textarea
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                placeholder={'e.g. "Always ask for the lead\'s email address"'}
                rows={2}
                maxLength={500}
                className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
              />
              <p className="mt-1 text-right text-xs text-[var(--ws-text-muted)]">{newRuleText.length}/500</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAddRule(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSaveRule} disabled={savingRule || !newRuleText.trim()}>
                {savingRule ? "Saving..." : "Save Rule"}
              </Button>
            </div>
          </Card>
        )}

        {rules.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No rules defined"
            description="Add rules to control how your bot behaves — what to ask, what to avoid, and how to respond."
          />
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <Card key={rule.id} className="flex items-start gap-3 p-3">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="muted">{CATEGORY_LABELS[rule.category] ?? rule.category}</Badge>
                    {!rule.enabled && <Badge variant="warning">Disabled</Badge>}
                  </div>
                  <p className="text-sm text-[var(--ws-text-primary)]">{rule.rule_text}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleToggleRule(rule.id, !rule.enabled)}
                    className="text-xs text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
                  >
                    {rule.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--ws-border)] pt-6">
        <h3 className="mb-4 text-sm font-medium text-[var(--ws-text-primary)]">Persona</h3>
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">Tone</label>
          <select
            value={personaTone}
            onChange={(e) => {
              const t = e.target.value as typeof personaTone;
              setPersonaTone(t);
              handlePersonaSave(t, customInstructions);
            }}
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none"
          >
            <option value="friendly">Friendly</option>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">Custom Instructions</label>
          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            onBlur={() => handlePersonaSave(personaTone, customInstructions)}
            placeholder="Additional instructions for your bot's personality and behavior..."
            rows={4}
            maxLength={2000}
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
          />
          <p className="mt-1 text-right text-xs text-[var(--ws-text-muted)]">{customInstructions.length}/2000</p>
        </div>
      </div>

      <div className="mt-6 border-t border-[var(--ws-border)] pt-6">
        <h3 className="mb-1 text-sm font-medium text-[var(--ws-text-primary)]">Human Handoff</h3>
        <p className="mb-3 text-xs text-[var(--ws-text-muted)]">
          When a human agent takes over a conversation, the bot will automatically resume after this period of agent inactivity.
        </p>
        <div className="flex items-center gap-3">
          <label className="text-sm text-[var(--ws-text-secondary)]">Auto-resume bot after</label>
          <select
            value={handoffTimeout === null ? "never" : String(handoffTimeout)}
            onChange={(e) => handleTimeoutChange(e.target.value)}
            disabled={savingTimeout}
            className="rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
          >
            <option value="1">1 hour</option>
            <option value="6">6 hours</option>
            <option value="12">12 hours</option>
            <option value="24">24 hours</option>
            <option value="48">48 hours</option>
            <option value="never">Never</option>
          </select>
        </div>
      </div>
    </div>
  );
}

type ReasoningChunk = {
  content: string;
  similarity: number;
  source: string;
};

type PhaseInfo = {
  id: string;
  name: string;
  index: number;
  total: number;
  messageCount: number;
  maxMessages: number;
};

type Reasoning = {
  chunks: ReasoningChunk[];
  confidence: number;
  queryTarget: string;
  retrievalPass: number;
  phaseAction: string;
};

type Campaign = {
  id: string;
  name: string;
};

type PhaseOption = {
  id: string;
  name: string;
  order_index: number;
};

function TestChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [reasoning, setReasoning] = useState<Reasoning | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(() => `test-${Date.now()}`);

  // Campaign & phase state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [currentPhase, setCurrentPhase] = useState<PhaseInfo | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  // Load campaigns on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/campaigns");
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data.campaigns ?? []);
        }
      } finally {
        setLoadingCampaigns(false);
      }
    }
    load();
  }, []);

  // Load phases when campaign changes
  useEffect(() => {
    async function loadPhases() {
      const url = selectedCampaignId
        ? `/api/campaigns/${selectedCampaignId}/phases`
        : "/api/bot/phases";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPhases(data.phases ?? []);
      }
    }
    loadPhases();
  }, [selectedCampaignId]);

  const handleReset = async () => {
    await fetch("/api/bot/test-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "reset", sessionId, reset: true }),
    });
    setMessages([]);
    setReasoning(null);
    setCurrentPhase(null);
    setError(null);
  };

  const handleCampaignChange = async (campaignId: string | null) => {
    setSelectedCampaignId(campaignId);
    await handleReset();
  };

  const handleJumpToPhase = async (phaseId: string) => {
    try {
      const res = await fetch("/api/bot/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "jump",
          sessionId,
          campaignId: selectedCampaignId,
          jumpToPhaseId: phaseId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentPhase({
          id: data.currentPhase.id,
          name: data.currentPhase.name,
          index: data.phaseIndex,
          total: data.totalPhases,
          messageCount: 0,
          maxMessages: data.currentPhase.maxMessages ?? 3,
        });
        const jumpedPhase = phases.find((p) => p.id === phaseId);
        const systemMsg: Message = {
          id: `sys-${Date.now()}`,
          direction: "out",
          text: `--- Jumped to phase: ${jumpedPhase?.name ?? "Unknown"} ---`,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, systemMsg]);
      }
    } catch {
      setError("Failed to jump to phase");
    }
  };

  const handleSend = async (text: string) => {
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      direction: "in",
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/bot/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          campaignId: selectedCampaignId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
        return;
      }

      const data = await res.json();
      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        direction: "out",
        text: data.reply,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, botMsg]);

      // Update phase info
      if (data.currentPhase) {
        setCurrentPhase(data.currentPhase);
      }

      // Show phase advancement notification
      if (data.phaseAdvanced) {
        const advanceMsg: Message = {
          id: `sys-advance-${Date.now()}`,
          direction: "out",
          text: `--- Advanced to phase: ${data.currentPhase.name} ---`,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, advanceMsg]);
      }

      setReasoning({
        chunks: data.chunks ?? [],
        confidence: data.confidence ?? 0,
        queryTarget: data.queryTarget ?? "general",
        retrievalPass: data.retrievalPass ?? 1,
        phaseAction: data.phaseAction ?? "stay",
      });
    } catch {
      setError("Failed to reach the server. Check your connection.");
    } finally {
      setSending(false);
    }
  };

  const confidenceColor =
    reasoning && reasoning.confidence >= 0.7
      ? "bg-green-500"
      : reasoning && reasoning.confidence >= 0.4
        ? "bg-yellow-500"
        : "bg-red-500";

  const confidencePct = reasoning ? Math.round(reasoning.confidence * 100) : 0;

  return (
    <div className="flex h-[500px] flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Campaign Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[var(--ws-text-muted)]">Campaign:</label>
          <select
            value={selectedCampaignId ?? "__default__"}
            onChange={(e) => handleCampaignChange(e.target.value === "__default__" ? null : e.target.value)}
            disabled={loadingCampaigns}
            className="rounded-lg border border-[var(--ws-border)] bg-white px-3 py-1.5 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
          >
            <option value="__default__">Default Bot Flow</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Phase Jump */}
        {phases.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--ws-text-muted)]">Jump to:</label>
            <select
              value=""
              onChange={(e) => { if (e.target.value) handleJumpToPhase(e.target.value); }}
              className="rounded-lg border border-[var(--ws-border)] bg-white px-3 py-1.5 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
            >
              <option value="">Select phase...</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Phase Indicator */}
        {currentPhase && (
          <Badge variant="muted">
            Phase {currentPhase.index + 1}/{currentPhase.total}: {currentPhase.name}
            {" "}({currentPhase.messageCount}/{currentPhase.maxMessages} msgs)
          </Badge>
        )}

        {/* Reset Button */}
        <Button variant="ghost" onClick={handleReset} className="ml-auto">
          Reset
        </Button>
      </div>

      {/* Chat + Reasoning */}
      <div className="flex flex-1 gap-4">
        <Card className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--ws-border)] px-4 py-2">
              <Badge variant="warning">Test Mode</Badge>
              {sending && (
                <span className="flex items-center gap-1 text-xs text-[var(--ws-text-muted)]">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse delay-75">●</span>
                  <span className="animate-pulse delay-150">●</span>
                </span>
              )}
            </div>
            {error && (
              <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">
                {error}
              </div>
            )}
            <div className="flex-1">
              <MessageThread
                header={{ leadName: "Test User", leadPic: null }}
                messages={messages}
                onSend={sending ? undefined : handleSend}
              />
            </div>
          </div>
        </Card>

        <Card className="w-72 shrink-0 overflow-y-auto p-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--ws-text-muted)]">
            AI Reasoning
          </h3>

          {!reasoning ? (
            <p className="text-xs text-[var(--ws-text-muted)]">
              Send a message to see which rules and knowledge chunks the AI uses to generate its response.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Phase Action */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ws-text-muted)]">Phase action:</span>
                <Badge variant={reasoning.phaseAction === "advance" ? "success" : reasoning.phaseAction === "escalate" ? "warning" : "muted"}>
                  {reasoning.phaseAction}
                </Badge>
              </div>

              {/* Confidence */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-[var(--ws-text-muted)]">Confidence</span>
                  <span className="text-xs font-medium text-[var(--ws-text-primary)]">{confidencePct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ws-bg-secondary)]">
                  <div
                    className={`h-full rounded-full transition-all ${confidenceColor}`}
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Badge variant="muted">{reasoning.queryTarget}</Badge>
                {reasoning.retrievalPass === 2 && (
                  <Badge variant="warning">Reformulated query</Badge>
                )}
              </div>

              {/* Retrieved Knowledge */}
              <div>
                <p className="mb-2 text-xs font-medium text-[var(--ws-text-muted)]">
                  Retrieved Knowledge ({reasoning.chunks.length})
                </p>
                {reasoning.chunks.length === 0 ? (
                  <p className="text-xs text-[var(--ws-text-muted)]">No chunks retrieved.</p>
                ) : (
                  <div className="space-y-2">
                    {reasoning.chunks.map((chunk, i) => (
                      <div key={i} className="rounded-md border border-[var(--ws-border)] p-2">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-[var(--ws-text-muted)]">{chunk.source}</span>
                          <span className="text-xs font-medium text-[var(--ws-text-primary)]">
                            {Math.round(chunk.similarity * 100)}%
                          </span>
                        </div>
                        <p className="line-clamp-3 text-xs text-[var(--ws-text-secondary)]">
                          {chunk.content.slice(0, 120)}
                          {chunk.content.length > 120 ? "…" : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ReviewTab() {
  return (
    <EmptyState
      icon={ClipboardCheck}
      title="No conversations to review"
      description="Real conversations will appear here once your bot is live. You can mark responses as good or flag them for correction."
    />
  );
}

export default function BotClient() {
  const [activeTab, setActiveTab] = useState<Tab>("knowledge");

  return (
    <div className="flex h-full flex-col p-6 pt-14 md:pt-6">
      <h1 className="mb-6 text-2xl font-semibold text-[var(--ws-text-primary)]">
        Bot
      </h1>

      <div className="mb-6 flex gap-1 border-b border-[var(--ws-border)]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2",
                activeTab === tab.id
                  ? "border-[var(--ws-accent)] text-[var(--ws-accent)]"
                  : "border-transparent text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-primary)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1">
        {activeTab === "knowledge" && <KnowledgeTab />}
        {activeTab === "rules" && <RulesTab />}
        {activeTab === "test" && <TestChatTab />}
        {activeTab === "review" && <ReviewTab />}
      </div>
    </div>
  );
}
