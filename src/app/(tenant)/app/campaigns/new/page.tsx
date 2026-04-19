"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";

const GOAL_OPTIONS = [
  { value: "form_submit", label: "Form Submitted", description: "Track when leads submit a form" },
  { value: "appointment_booked", label: "Appointment Booked", description: "Track when leads book an appointment" },
  { value: "purchase", label: "Purchase Made", description: "Track when leads make a purchase" },
  { value: "stage_reached", label: "Stage Reached", description: "Track when leads reach a pipeline stage" },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("form_submit");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, goal }),
      });
      if (!res.ok) { setError("Failed to create campaign"); return; }
      const data = await res.json();
      router.push(`/app/campaigns/${data.campaign.id}`);
    } catch {
      setError("Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  const labelClass = "block text-sm font-medium text-[var(--ws-text-primary)] mb-1";
  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/app/campaigns" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">New Campaign</h1>
      </div>

      <div className="max-w-lg space-y-5">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <div>
          <label className={labelClass}>Campaign Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Booking Funnel" />
        </div>

        <div>
          <label className={labelClass}>Conversion Goal</label>
          <div className="space-y-2 mt-2">
            {GOAL_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  goal === opt.value ? "border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)]" : "border-[var(--ws-border)]"
                }`}
              >
                <input
                  type="radio"
                  name="goal"
                  value={opt.value}
                  checked={goal === opt.value}
                  onChange={() => setGoal(opt.value)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-[var(--ws-text-primary)]">{opt.label}</div>
                  <div className="text-xs text-[var(--ws-text-muted)]">{opt.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <Button variant="primary" onClick={handleCreate} disabled={creating}>
          {creating ? "Creating..." : "Create Campaign"}
        </Button>
      </div>
    </div>
  );
}
