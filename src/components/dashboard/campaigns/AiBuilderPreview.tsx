"use client";

import { ArrowRight, CheckCircle2, FlaskConical, Pencil, Plus, Rocket } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { CampaignPlan, GeneratedCampaignPhase } from "@/lib/ai/campaign-builder";

interface PreviewCampaign {
  id: string;
  name: string;
  description?: string | null;
  goal?: string;
}

interface AiBuilderPreviewProps {
  campaign: PreviewCampaign | null;
  plan: CampaignPlan | null;
  rules: string[];
  phases: GeneratedCampaignPhase[];
  focusedPhaseIndex: number | null;
  actionLoading: string | null;
  onGeneratePhases: () => void;
  onAddPhase: () => void;
  onFocusPhase: (index: number | null) => void;
  onTestAgainstPrimary: () => void;
  onMakePrimary: () => void;
}

const GOAL_LABELS: Record<string, string> = {
  form_submit: "Form Submitted",
  appointment_booked: "Appointment Booked",
  purchase: "Purchase",
  stage_reached: "Stage Reached",
};

export default function AiBuilderPreview({
  campaign,
  plan,
  rules,
  phases,
  focusedPhaseIndex,
  actionLoading,
  onGeneratePhases,
  onAddPhase,
  onFocusPhase,
  onTestAgainstPrimary,
  onMakePrimary,
}: AiBuilderPreviewProps) {
  if (!plan) {
    return (
      <section className="flex min-h-[620px] flex-1 items-center justify-center bg-[var(--ws-page)] p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ws-accent-subtle)]">
            <Rocket className="h-5 w-5 text-[var(--ws-accent)]" />
          </div>
          <h2 className="text-base font-semibold text-[var(--ws-text-primary)]">
            Draft preview appears here
          </h2>
          <p className="mt-2 text-sm text-[var(--ws-text-muted)]">
            Describe the campaign you want to build. The AI will design a plan before generating phases.
          </p>
        </div>
      </section>
    );
  }

  const hasPhases = phases.length > 0;

  return (
    <section className="flex-1 overflow-y-auto bg-[var(--ws-page)] p-6">
      {campaign && (
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="default">DRAFT</Badge>
            {campaign.goal && (
              <Badge variant="success">{GOAL_LABELS[campaign.goal] ?? campaign.goal}</Badge>
            )}
          </div>
          <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">{campaign.name}</h1>
          {campaign.description && (
            <p className="mt-1 max-w-2xl text-sm text-[var(--ws-text-muted)]">{campaign.description}</p>
          )}
        </div>
      )}

      <div className={`mb-5 rounded-lg border border-[var(--ws-border)] bg-white p-4 ${hasPhases ? "" : ""}`}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--ws-text-primary)]">
          Campaign Plan
        </h2>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <span className="text-xs text-[var(--ws-text-muted)]">Goal</span>
            <p className="font-medium text-[var(--ws-text-primary)]">{plan.goal_summary}</p>
          </div>
          <div>
            <span className="text-xs text-[var(--ws-text-muted)]">Approach</span>
            <p className="font-medium text-[var(--ws-text-primary)]">{plan.selling_approach}</p>
          </div>
          <div>
            <span className="text-xs text-[var(--ws-text-muted)]">Buyer Context</span>
            <p className="font-medium text-[var(--ws-text-primary)]">{plan.buyer_context}</p>
          </div>
        </div>
        <div className="mt-4">
          <span className="text-xs text-[var(--ws-text-muted)]">Key Behaviors</span>
          <ul className="mt-1 list-inside list-disc text-sm text-[var(--ws-text-secondary)]">
            {plan.key_behaviors.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
        {!hasPhases && (
          <div className="mt-4">
            <span className="text-xs text-[var(--ws-text-muted)]">Phase Outline</span>
            <ol className="mt-1 list-inside list-decimal text-sm text-[var(--ws-text-secondary)]">
              {plan.phase_outline.map((p) => (
                <li key={p.name}><strong>{p.name}</strong> — {p.purpose}</li>
              ))}
            </ol>
          </div>
        )}
        {rules.length > 0 && (
          <div className="mt-4">
            <span className="text-xs text-[var(--ws-text-muted)]">Campaign Rules</span>
            <ul className="mt-1 list-inside list-disc text-sm text-[var(--ws-text-secondary)]">
              {rules.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        )}
      </div>

      {!hasPhases && (
        <Button
          variant="primary"
          onClick={onGeneratePhases}
          disabled={actionLoading !== null}
        >
          {actionLoading === "phases" ? "Generating Phases..." : "Generate Phases"}
        </Button>
      )}

      {hasPhases && (
        <>
          <div className="mb-5 rounded-lg border border-[var(--ws-border)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--ws-text-primary)]">
              Generated Phases
            </h2>
            <div className="space-y-3">
              {phases.map((phase, index) => (
                <button
                  key={`${phase.name}-${index}`}
                  type="button"
                  onClick={() => onFocusPhase(focusedPhaseIndex === index ? null : index)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    focusedPhaseIndex === index
                      ? "border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)]"
                      : "border-[var(--ws-border)] hover:border-[var(--ws-accent)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ws-accent-subtle)] text-xs font-semibold text-[var(--ws-accent)]">
                      {index + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-[var(--ws-text-primary)]">{phase.name}</h3>
                  </div>
                  <p className="mt-2 text-sm text-[var(--ws-text-secondary)]">{phase.goals}</p>
                  <p className="mt-1 text-xs text-[var(--ws-text-muted)]">Tone: {phase.tone}</p>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Button variant="secondary" onClick={onAddPhase} disabled={actionLoading !== null}>
                <Plus className="h-4 w-4" />
                Add Phase
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {campaign && (
              <Link href={`/app/campaigns/${campaign.id}`}>
                <Button variant="secondary">
                  <Pencil className="h-4 w-4" />
                  Edit Draft
                </Button>
              </Link>
            )}
            <Button variant="secondary" onClick={onTestAgainstPrimary} disabled={actionLoading !== null}>
              <FlaskConical className="h-4 w-4" />
              {actionLoading === "test" ? "Creating Test..." : "Test Against Primary"}
            </Button>
            <Button variant="primary" onClick={onMakePrimary} disabled={actionLoading !== null}>
              <CheckCircle2 className="h-4 w-4" />
              {actionLoading === "primary" ? "Promoting..." : "Make Primary"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
