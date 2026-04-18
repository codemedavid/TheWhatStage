"use client";

import { useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import PhaseCard from "./PhaseCard";
import type { FlowPhase } from "@/hooks/useFlowPhases";

interface SortablePhaseProps {
  phase: FlowPhase;
  onSave: (updates: Partial<FlowPhase>) => Promise<void>;
  onDelete: () => void;
}

function SortablePhase({ phase, onSave, onDelete }: SortablePhaseProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: phase.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <PhaseCard
        phase={phase}
        onSave={onSave}
        onDelete={onDelete}
        dragHandleProps={listeners}
      />
    </div>
  );
}

interface PhaseListProps {
  phases: FlowPhase[];
  onUpdate: (id: string, updates: Partial<FlowPhase>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (order: { id: string; order_index: number }[]) => Promise<void>;
  onCreatePhase: () => void;
}

export default function PhaseList({
  phases,
  onUpdate,
  onDelete,
  onReorder,
  onCreatePhase,
}: PhaseListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = phases.findIndex((p) => p.id === active.id);
      const newIndex = phases.findIndex((p) => p.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...phases];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      const order = reordered.map((p, i) => ({ id: p.id, order_index: i }));
      onReorder(order);
    },
    [phases, onReorder]
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--ws-text-tertiary)]">
          {phases.length} phase{phases.length !== 1 ? "s" : ""}
        </p>
        <Button variant="secondary" onClick={onCreatePhase}>
          <Plus className="h-4 w-4" />
          Add Phase
        </Button>
      </div>

      {/* Sortable list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={phases.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {phases.map((phase) => (
              <SortablePhase
                key={phase.id}
                phase={phase}
                onSave={(updates) => onUpdate(phase.id, updates)}
                onDelete={() => onDelete(phase.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
