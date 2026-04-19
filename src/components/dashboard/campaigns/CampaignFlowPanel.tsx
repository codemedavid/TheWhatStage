"use client";

import { useCampaignPhases } from "@/hooks/useCampaignPhases";
import PhaseList from "@/components/dashboard/flow/PhaseList";
import type { FlowPhase } from "@/hooks/useFlowPhases";

export default function CampaignFlowPanel({ campaignId }: { campaignId: string }) {
  const {
    phases,
    loading,
    error,
    createPhase,
    updatePhase,
    deletePhase,
    reorderPhases,
  } = useCampaignPhases(campaignId);

  // Map CampaignPhase to FlowPhase shape for PhaseList compatibility
  const flowPhases: FlowPhase[] = phases.map((p) => ({
    id: p.id,
    tenant_id: p.tenant_id,
    name: p.name,
    order_index: p.order_index,
    max_messages: p.max_messages,
    system_prompt: p.system_prompt,
    tone: p.tone,
    goals: p.goals,
    transition_hint: p.transition_hint,
    action_button_ids: p.action_button_ids,
    image_attachment_ids: p.image_attachment_ids,
    created_at: p.created_at,
  }));

  const handleCreatePhase = async () => {
    const nextIndex = phases.length;
    await createPhase({
      name: `Phase ${nextIndex + 1}`,
      order_index: nextIndex,
      max_messages: 3,
      system_prompt: "Describe what the bot should do in this phase.",
    });
  };

  if (loading) {
    return <div className="animate-pulse h-40 rounded-lg bg-[var(--ws-border)]" />;
  }

  if (error) {
    return <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>;
  }

  return (
    <PhaseList
      phases={flowPhases}
      onUpdate={updatePhase}
      onDelete={deletePhase}
      onReorder={reorderPhases}
      onCreatePhase={handleCreatePhase}
    />
  );
}
