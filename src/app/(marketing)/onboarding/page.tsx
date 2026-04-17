"use client";

import { useState } from "react";
import { generateSlug, validateSlug } from "@/lib/utils/slug";
import { buildTenantUrl } from "@/lib/auth/redirect";

const BUSINESS_TYPES = [
  { value: "ecommerce", label: "E-Commerce", icon: "🛒" },
  { value: "real_estate", label: "Real Estate", icon: "🏠" },
  { value: "digital_product", label: "Digital Product", icon: "💾" },
  { value: "services", label: "Services", icon: "🤝" },
] as const;

const BOT_GOALS = [
  { value: "qualify_leads", label: "Qualify Leads" },
  { value: "sell", label: "Sell Products / Services" },
  { value: "understand_intent", label: "Understand Intent" },
  { value: "collect_lead_info", label: "Collect Lead Info" },
] as const;

export default function OnboardingPage() {
  const [step, setStep] = useState<"business" | "goal" | "slug">("business");
  const [businessType, setBusinessType] = useState<string>("");
  const [botGoal, setBotGoal] = useState<string>("");
  const [tenantName, setTenantName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setTenantName(value);
    const generated = generateSlug(value);
    setSlug(generated);
    setSlugError(null);
  }

  function handleSlugChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(cleaned);
    setSlugError(null);
  }

  async function handleCreate() {
    const err = validateSlug(slug);
    if (err) {
      setSlugError(err);
      return;
    }

    setError(null);
    setLoading(true);

    const response = await fetch("/api/onboarding/create-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tenantName, slug, businessType, botGoal }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Something went wrong");
      setLoading(false);
      return;
    }

    window.location.href = buildTenantUrl(data.slug);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Set up your workspace</h1>
          <p className="text-gray-500 mt-1">Just a few questions to get you started</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {step === "business" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">What type of business do you run?</h2>
            <div className="grid grid-cols-2 gap-3">
              {BUSINESS_TYPES.map((bt) => (
                <button
                  key={bt.value}
                  onClick={() => { setBusinessType(bt.value); setStep("goal"); }}
                  className="flex flex-col items-center p-4 border-2 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                >
                  <span className="text-3xl mb-2">{bt.icon}</span>
                  <span className="font-medium text-gray-800">{bt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "goal" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">What&apos;s your main bot goal?</h2>
            <div className="space-y-3">
              {BOT_GOALS.map((goal) => (
                <button
                  key={goal.value}
                  onClick={() => { setBotGoal(goal.value); setStep("slug"); }}
                  className="w-full text-left p-4 border-2 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors font-medium"
                >
                  {goal.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "slug" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Name your workspace</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business name
                </label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subdomain
                </label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    className="flex-1 px-3 py-2 focus:outline-none"
                  />
                  <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm border-l border-gray-300">
                    .whatstage.app
                  </span>
                </div>
                {slugError && <p className="mt-1 text-sm text-red-600">{slugError}</p>}
              </div>
              <button
                onClick={handleCreate}
                disabled={loading || !tenantName || !slug}
                className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Creating workspace..." : "Create Workspace"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
