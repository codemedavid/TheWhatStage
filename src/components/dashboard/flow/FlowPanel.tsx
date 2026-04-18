"use client";

import { useState } from "react";
import { useFlowPhases } from "@/hooks/useFlowPhases";
import TemplateSelector from "./TemplateSelector";
import PhaseList from "./PhaseList";

export default function FlowPanel() {
  const {
    phases,
    loading,
    createPhase,
    updatePhase,
    deletePhase,
    reorderPhases,
    seedPhases,
  } = useFlowPhases();
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async (businessType: "ecommerce" | "real_estate" | "digital_product" | "services") => {
    setSeeding(true);
    try {
      await seedPhases(businessType);
    } finally {
      setSeeding(false);
    }
  };

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
    return (
      <div className="flex items-center justify-center py-16" data-testid="flow-loading">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--ws-border-strong)] border-t-[var(--ws-accent)]" />
      </div>
    );
  }

  if (phases.length === 0) {
    return <TemplateSelector onSeed={handleSeed} seeding={seeding} />;
  }

  return (
    <PhaseList
      phases={phases}
      onUpdate={updatePhase}
      onDelete={deletePhase}
      onReorder={reorderPhases}
      onCreatePhase={handleCreatePhase}
    />
  );
}
