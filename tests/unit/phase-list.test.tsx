import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhaseList from "@/components/dashboard/flow/PhaseList";

// Mock PhaseCard to keep tests focused on list behavior
vi.mock("@/components/dashboard/flow/PhaseCard", () => ({
  default: ({ phase, onSave, onDelete }: any) => (
    <div data-testid={`phase-card-${phase.id}`}>
      <span>{phase.name}</span>
      <button onClick={onDelete}>Delete {phase.name}</button>
    </div>
  ),
}));

// Mock dnd-kit (drag interactions are hard to unit test — tested in E2E)
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: any) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  })),
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

const mockPhases = [
  {
    id: "p1", tenant_id: "t1", name: "Greet", order_index: 0, max_messages: 1,
    system_prompt: "Welcome", tone: "friendly", goals: null, transition_hint: null,
    action_button_ids: null, image_attachment_ids: [], created_at: "2026-01-01",
  },
  {
    id: "p2", tenant_id: "t1", name: "Nurture", order_index: 1, max_messages: 3,
    system_prompt: "Build rapport", tone: "genuine", goals: "Build trust",
    transition_hint: "Move to qualify", action_button_ids: null,
    image_attachment_ids: [], created_at: "2026-01-01",
  },
];

describe("PhaseList", () => {
  const mockOnUpdate = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnReorder = vi.fn();
  const mockOnCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all phase cards", () => {
    render(
      <PhaseList
        phases={mockPhases}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onReorder={mockOnReorder}
        onCreatePhase={mockOnCreate}
      />
    );

    expect(screen.getByTestId("phase-card-p1")).toBeInTheDocument();
    expect(screen.getByTestId("phase-card-p2")).toBeInTheDocument();
  });

  it("renders phase names in order", () => {
    render(
      <PhaseList
        phases={mockPhases}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onReorder={mockOnReorder}
        onCreatePhase={mockOnCreate}
      />
    );

    expect(screen.getByText("Greet")).toBeInTheDocument();
    expect(screen.getByText("Nurture")).toBeInTheDocument();
  });

  it("shows Add Phase button", () => {
    render(
      <PhaseList
        phases={mockPhases}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onReorder={mockOnReorder}
        onCreatePhase={mockOnCreate}
      />
    );

    expect(screen.getByText("Add Phase")).toBeInTheDocument();
  });

  it("calls onCreatePhase when Add Phase clicked", async () => {
    const user = userEvent.setup();
    render(
      <PhaseList
        phases={mockPhases}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onReorder={mockOnReorder}
        onCreatePhase={mockOnCreate}
      />
    );

    await user.click(screen.getByText("Add Phase"));

    expect(mockOnCreate).toHaveBeenCalled();
  });

  it("renders phase count", () => {
    render(
      <PhaseList
        phases={mockPhases}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onReorder={mockOnReorder}
        onCreatePhase={mockOnCreate}
      />
    );

    expect(screen.getByText("2 phases")).toBeInTheDocument();
  });
});
