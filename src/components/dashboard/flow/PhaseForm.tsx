"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import ImageAttachmentPicker from "./ImageAttachmentPicker";
import ActionButtonPicker from "./ActionButtonPicker";
import type { FlowPhase } from "@/hooks/useFlowPhases";

interface PhaseFormProps {
  phase: FlowPhase;
  onSave: (updates: Partial<FlowPhase>) => Promise<void>;
  onDelete: () => void;
}

export default function PhaseForm({ phase, onSave, onDelete }: PhaseFormProps) {
  const [name, setName] = useState(phase.name);
  const [maxMessages, setMaxMessages] = useState(phase.max_messages);
  const [systemPrompt, setSystemPrompt] = useState(phase.system_prompt);
  const [tone, setTone] = useState(phase.tone ?? "");
  const [goals, setGoals] = useState(phase.goals ?? "");
  const [transitionHint, setTransitionHint] = useState(phase.transition_hint ?? "");
  const [actionButtonIds, setActionButtonIds] = useState<string[]>(phase.action_button_ids ?? []);
  const [imageAttachmentIds, setImageAttachmentIds] = useState<string[]>(phase.image_attachment_ids ?? []);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        name,
        max_messages: maxMessages,
        system_prompt: systemPrompt,
        tone: tone || null,
        goals: goals || null,
        transition_hint: transitionHint || null,
        action_button_ids: actionButtonIds,
        image_attachment_ids: imageAttachmentIds,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Name + Max Messages row */}
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
            Phase Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]" htmlFor={`max-msg-${phase.id}`}>
            Max Messages
          </label>
          <input
            id={`max-msg-${phase.id}`}
            type="number"
            min={1}
            max={50}
            value={maxMessages}
            onChange={(e) => setMaxMessages(parseInt(e.target.value) || 1)}
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
          />
        </div>
      </div>

      {/* System Prompt */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          System Prompt
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>

      {/* Tone */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Tone
        </label>
        <input
          type="text"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="e.g. friendly and helpful"
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>

      {/* Goals */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Goals
        </label>
        <textarea
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          rows={2}
          placeholder="What should the bot accomplish in this phase?"
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>

      {/* Transition Hint */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Transition Hint
        </label>
        <input
          type="text"
          value={transitionHint}
          onChange={(e) => setTransitionHint(e.target.value)}
          placeholder="When should the bot move to the next phase?"
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>

      {/* Action Buttons */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Action Buttons
        </label>
        <p className="mb-2 text-xs text-[var(--ws-text-tertiary)]">
          Select action pages the bot can send as buttons during this phase.
        </p>
        <ActionButtonPicker selectedIds={actionButtonIds} onChange={setActionButtonIds} />
      </div>

      {/* Image Attachments */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Image Attachments
        </label>
        <p className="mb-2 text-xs text-[var(--ws-text-tertiary)]">
          Select images the bot can send during this phase when contextually relevant.
        </p>
        <ImageAttachmentPicker selectedIds={imageAttachmentIds} onChange={setImageAttachmentIds} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-[var(--ws-border)] pt-4">
        <Button variant="ghost" onClick={onDelete} className="text-[var(--ws-danger)]">
          <Trash2 className="h-4 w-4" />
          Delete Phase
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
