"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { Campaign } from "@/hooks/useCampaigns";

interface CampaignFormProps {
  campaign: Campaign;
  onSave: (updates: Partial<Campaign>) => Promise<void>;
}

const GOAL_OPTIONS = [
  { value: "form_submit", label: "Form Submitted" },
  { value: "appointment_booked", label: "Appointment Booked" },
  { value: "purchase", label: "Purchase Made" },
  { value: "stage_reached", label: "Pipeline Stage Reached" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

export default function CampaignForm({ campaign, onSave }: CampaignFormProps) {
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? "");
  const [goal, setGoal] = useState(campaign.goal);
  const [status, setStatus] = useState(campaign.status);
  const [followUpDelay, setFollowUpDelay] = useState(campaign.follow_up_delay_minutes);
  const [followUpMessage, setFollowUpMessage] = useState(campaign.follow_up_message ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        name,
        description: description || null,
        goal: goal as Campaign["goal"],
        status: status as Campaign["status"],
        follow_up_delay_minutes: followUpDelay,
        follow_up_message: followUpMessage || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const labelClass = "block text-sm font-medium text-[var(--ws-text-primary)] mb-1";
  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <label className={labelClass}>Campaign Name</label>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          className={inputClass}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass}>Conversion Goal</label>
        <select className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value)}>
          {GOAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Status</label>
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Follow-up Delay (minutes)</label>
        <input
          type="number"
          className={inputClass}
          value={followUpDelay}
          min={15}
          max={1440}
          onChange={(e) => setFollowUpDelay(Number(e.target.value))}
        />
        <p className="mt-1 text-xs text-[var(--ws-text-muted)]">
          Time to wait before sending a follow-up to a silent lead
        </p>
      </div>

      <div>
        <label className={labelClass}>Follow-up Message</label>
        <textarea
          className={inputClass}
          rows={3}
          value={followUpMessage}
          onChange={(e) => setFollowUpMessage(e.target.value)}
          placeholder="Hey! Just checking in — did you have any other questions?"
        />
      </div>

      {campaign.is_primary && (
        <div className="rounded-lg bg-[var(--ws-accent-subtle)] p-3">
          <Badge variant="default">PRIMARY CAMPAIGN</Badge>
          <p className="mt-1 text-xs text-[var(--ws-text-muted)]">
            All new leads are assigned to this campaign by default
          </p>
        </div>
      )}

      <Button variant="primary" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
