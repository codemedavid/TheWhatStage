"use client";

import { useState } from "react";
import { clsx } from "clsx";
import {
  BookOpen,
  ShieldCheck,
  MessageCircle,
  ClipboardCheck,
  GitBranch,
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
import FlowPanel from "@/components/dashboard/flow/FlowPanel";

type Tab = "knowledge" | "flow" | "rules" | "test" | "review";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { id: "flow", label: "Flow Builder", icon: GitBranch },
  { id: "rules", label: "Rules & Persona", icon: ShieldCheck },
  { id: "test", label: "Test Chat", icon: MessageCircle },
  { id: "review", label: "Review", icon: ClipboardCheck },
];

const MOCK_MESSAGES: Message[] = [
  {
    id: "1",
    direction: "out",
    text: "Hi! Welcome to our page. How can I help you today?",
    createdAt: new Date(Date.now() - 120000).toISOString(),
  },
];

function KnowledgeTab() {
  return <KnowledgePanel />;
}

function RulesTab() {
  const [showAddRule, setShowAddRule] = useState(false);

  return (
    <div>
      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--ws-text-primary)]">
            Behavior Rules
          </h3>
          <Button variant="secondary" onClick={() => setShowAddRule(!showAddRule)}>
            <Plus className="h-4 w-4" />
            Add Rule
          </Button>
        </div>

        {showAddRule && (
          <Card className="mb-4 p-4">
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
                Rule Type
              </label>
              <select className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none">
                <option value="instruction">Instruction</option>
                <option value="restriction">Restriction</option>
                <option value="persona">Persona</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
                Rule
              </label>
              <textarea
                placeholder={"e.g. \"Always ask for the lead's email address\""}
                rows={2}
                className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAddRule(false)}>
                Cancel
              </Button>
              <Button variant="primary">Save Rule</Button>
            </div>
          </Card>
        )}

        <EmptyState
          icon={ShieldCheck}
          title="No rules defined"
          description="Add rules to control how your bot behaves — what to ask, what to avoid, and how to respond."
        />
      </div>

      <div className="border-t border-[var(--ws-border)] pt-6">
        <h3 className="mb-4 text-sm font-medium text-[var(--ws-text-primary)]">
          Persona
        </h3>
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
            Tone
          </label>
          <select className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none">
            <option value="friendly">Friendly</option>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
            Custom Instructions
          </label>
          <textarea
            placeholder="Additional instructions for your bot's personality and behavior..."
            rows={4}
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
          />
        </div>
      </div>
    </div>
  );
}

function TestChatTab() {
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);

  const handleSend = (text: string) => {
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      direction: "in",
      text,
      createdAt: new Date().toISOString(),
    };
    const botMsg: Message = {
      id: `bot-${Date.now()}`,
      direction: "out",
      text: "Thanks for your message! I'm a test bot — this is a simulated response. Connect your knowledge base and rules to see real AI responses.",
      createdAt: new Date(Date.now() + 1000).toISOString(),
    };
    setMessages((prev) => [...prev, userMsg, botMsg]);
  };

  return (
    <div className="flex h-[500px] gap-4">
      <Card className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="border-b border-[var(--ws-border)] px-4 py-2">
            <Badge variant="warning">Test Mode</Badge>
          </div>
          <div className="flex-1">
            <MessageThread
              header={{ leadName: "Test User", leadPic: null }}
              messages={messages}
              onSend={handleSend}
            />
          </div>
        </div>
      </Card>
      <Card className="w-72 shrink-0 p-4">
        <h3 className="mb-3 text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
          AI Reasoning
        </h3>
        <p className="text-xs text-[var(--ws-text-muted)]">
          Send a message to see which rules and knowledge chunks the AI uses to
          generate its response.
        </p>
      </Card>
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
        {activeTab === "flow" && <FlowPanel />}
        {activeTab === "rules" && <RulesTab />}
        {activeTab === "test" && <TestChatTab />}
        {activeTab === "review" && <ReviewTab />}
      </div>
    </div>
  );
}
