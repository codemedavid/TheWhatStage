"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useCampaigns } from "@/hooks/useCampaigns";

interface Variant {
  campaign_id: string;
  weight: number;
}

export default function NewExperimentClient() {
  const router = useRouter();
  const { campaigns } = useCampaigns();
  const [name, setName] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableCampaigns = campaigns.filter(
    (c) => !variants.some((v) => v.campaign_id === c.id)
  );

  const addVariant = (campaignId: string) => {
    setVariants([...variants, { campaign_id: campaignId, weight: 50 }]);
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateWeight = (index: number, weight: number) => {
    setVariants(variants.map((v, i) => (i === index ? { ...v, weight } : v)));
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    if (variants.length < 2) { setError("At least 2 campaign variants required"); return; }

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, campaigns: variants }),
      });
      if (!res.ok) { setError("Failed to create experiment"); return; }
      const data = await res.json();
      router.push(`/app/campaigns/experiments/${data.experiment.id}`);
    } catch {
      setError("Failed to create experiment");
    } finally {
      setCreating(false);
    }
  };

  const getCampaignName = (id: string) => campaigns.find((c) => c.id === id)?.name ?? id;

  const labelClass = "block text-sm font-medium text-[var(--ws-text-primary)] mb-1";
  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/app/campaigns/experiments" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">New Experiment</h1>
      </div>

      <div className="max-w-lg space-y-5">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <div>
          <label className={labelClass}>Experiment Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. July Booking Test" />
        </div>

        <div>
          <label className={labelClass}>Campaign Variants</label>
          <div className="space-y-2 mt-2">
            {variants.map((v, i) => (
              <div key={v.campaign_id} className="flex items-center gap-3 rounded-lg border border-[var(--ws-border)] p-3">
                <span className="flex-1 text-sm font-medium text-[var(--ws-text-primary)]">{getCampaignName(v.campaign_id)}</span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--ws-text-muted)]">Weight:</label>
                  <input
                    type="number"
                    className="w-16 rounded border border-[var(--ws-border)] px-2 py-1 text-sm"
                    value={v.weight}
                    min={1}
                    max={100}
                    onChange={(e) => updateWeight(i, Number(e.target.value))}
                  />
                </div>
                <button onClick={() => removeVariant(i)} className="text-[var(--ws-text-muted)] hover:text-red-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            {availableCampaigns.length > 0 && variants.length < 4 && (
              <select
                className={inputClass}
                value=""
                onChange={(e) => { if (e.target.value) addVariant(e.target.value); }}
              >
                <option value="">+ Add campaign variant...</option>
                {availableCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <Button variant="primary" onClick={handleCreate} disabled={creating || variants.length < 2}>
          {creating ? "Creating..." : "Create Experiment"}
        </Button>
      </div>
    </div>
  );
}
