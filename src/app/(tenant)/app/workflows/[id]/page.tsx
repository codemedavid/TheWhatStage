"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Save,
  Plus,
  MessageSquare,
  Image,
  Clock,
  GitBranch,
  ArrowRightLeft,
  Tag,
  Globe,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface WorkflowStep {
  id: string;
  type: string;
  expanded: boolean;
}

const TRIGGER_EVENTS = [
  { value: "message_in", label: "Lead sends a message" },
  { value: "form_submit", label: "Form is submitted" },
  { value: "appointment_booked", label: "Appointment is booked" },
  { value: "purchase", label: "Purchase is made" },
  { value: "stage_changed", label: "Stage changes" },
  { value: "action_click", label: "Action button is clicked" },
];

const STEP_TYPES: { value: string; label: string; icon: LucideIcon; color: string }[] = [
  { value: "send_message", label: "Send Message", icon: MessageSquare, color: "text-blue-500" },
  { value: "send_image", label: "Send Image", icon: Image, color: "text-purple-500" },
  { value: "wait", label: "Wait", icon: Clock, color: "text-amber-500" },
  { value: "condition", label: "Condition", icon: GitBranch, color: "text-cyan-600" },
  { value: "move_stage", label: "Move Stage", icon: ArrowRightLeft, color: "text-[var(--ws-accent)]" },
  { value: "tag", label: "Add Tag", icon: Tag, color: "text-pink-500" },
  { value: "http", label: "HTTP Request", icon: Globe, color: "text-orange-500" },
];

function StepConfig({ type }: { type: string }) {
  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]";

  switch (type) {
    case "send_message":
      return <textarea placeholder="Type the message to send..." rows={3} className={inputClass} />;
    case "send_image":
      return <input type="text" placeholder="Image URL" className={inputClass} />;
    case "wait":
      return (
        <div className="flex items-center gap-2">
          <input type="number" defaultValue={1} min={1} className={`w-20 ${inputClass}`} />
          <select className={inputClass}>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
      );
    case "condition":
      return (
        <div className="space-y-2">
          <select className={inputClass}>
            <option>Lead has tag...</option>
            <option>Lead is in stage...</option>
            <option>Lead name contains...</option>
          </select>
          <input type="text" placeholder="Value" className={inputClass} />
        </div>
      );
    case "move_stage":
      return (
        <select className={inputClass}>
          <option value="">Select stage...</option>
          <option>New Lead</option>
          <option>Engaged</option>
          <option>Qualified</option>
          <option>Customer</option>
        </select>
      );
    case "tag":
      return <input type="text" placeholder="Tag name" className={inputClass} />;
    case "http":
      return (
        <div className="flex gap-2">
          <select className={`w-24 ${inputClass}`}>
            <option>POST</option>
            <option>GET</option>
            <option>PUT</option>
          </select>
          <input type="text" placeholder="https://..." className={`flex-1 ${inputClass}`} />
        </div>
      );
    default:
      return null;
  }
}

export default function WorkflowEditorPage() {
  const [name, setName] = useState("New Workflow");
  const [enabled, setEnabled] = useState(true);
  const [triggerEvent, setTriggerEvent] = useState("message_in");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [showAddStep, setShowAddStep] = useState(false);

  const addStep = (type: string) => {
    setSteps((prev) => [...prev, { id: String(Date.now()), type, expanded: true }]);
    setShowAddStep(false);
  };

  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  };

  const toggleExpand = (id: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, expanded: !s.expanded } : s)));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-[var(--ws-border)] bg-white px-6 py-3">
        <Link href="/app/workflows" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 bg-transparent text-lg font-semibold text-[var(--ws-text-primary)] outline-none"
        />
        <button
          onClick={() => setEnabled(!enabled)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            enabled
              ? "bg-[var(--ws-success-light)] text-[var(--ws-success)]"
              : "bg-[var(--ws-border-subtle)] text-[var(--ws-text-muted)]"
          }`}
        >
          {enabled ? "Active" : "Disabled"}
        </button>
        <Button variant="primary">
          <Save className="h-4 w-4" />
          Save
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-xl">
          <Card className="mb-6 p-4">
            <h3 className="mb-3 text-sm font-medium text-[var(--ws-text-primary)]">
              When this happens...
            </h3>
            <select
              value={triggerEvent}
              onChange={(e) => setTriggerEvent(e.target.value)}
              className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
            >
              {TRIGGER_EVENTS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Card>

          <div className="relative">
            {steps.length > 0 && (
              <div className="absolute bottom-0 left-5 top-0 w-px bg-[var(--ws-border)]" />
            )}

            {steps.map((step) => {
              const stepType = STEP_TYPES.find((t) => t.value === step.type);
              if (!stepType) return null;
              const Icon = stepType.icon;

              return (
                <div key={step.id} className="relative mb-4 pl-12">
                  <div className="absolute left-3.5 top-4 h-3 w-3 rounded-full border-2 border-[var(--ws-border)] bg-white" />
                  <Card className="p-4">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${stepType.color}`} />
                      <span className="flex-1 text-sm font-medium text-[var(--ws-text-primary)]">
                        {stepType.label}
                      </span>
                      <button
                        onClick={() => toggleExpand(step.id)}
                        className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
                      >
                        {step.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => removeStep(step.id)}
                        className="text-[var(--ws-text-muted)] hover:text-[var(--ws-danger)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {step.expanded && (
                      <div className="mt-3">
                        <StepConfig type={step.type} />
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>

          {showAddStep ? (
            <Card className="p-4">
              <h4 className="mb-3 text-sm font-medium text-[var(--ws-text-primary)]">Add a step</h4>
              <div className="grid grid-cols-2 gap-2">
                {STEP_TYPES.map((st) => {
                  const Icon = st.icon;
                  return (
                    <button
                      key={st.value}
                      onClick={() => addStep(st.value)}
                      className="flex items-center gap-2 rounded-lg border border-[var(--ws-border)] px-3 py-2.5 text-sm text-[var(--ws-text-tertiary)] transition-colors hover:bg-[var(--ws-page)] hover:text-[var(--ws-text-primary)]"
                    >
                      <Icon className={`h-4 w-4 ${st.color}`} />
                      {st.label}
                    </button>
                  );
                })}
              </div>
            </Card>
          ) : (
            <button
              onClick={() => setShowAddStep(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--ws-border-strong)] py-3 text-sm text-[var(--ws-text-tertiary)] transition-colors hover:border-[var(--ws-accent)] hover:text-[var(--ws-accent)]"
            >
              <Plus className="h-4 w-4" />
              Add Step
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
