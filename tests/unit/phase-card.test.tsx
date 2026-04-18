import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhaseCard from "@/components/dashboard/flow/PhaseCard";

// Mock PhaseForm
vi.mock("@/components/dashboard/flow/PhaseForm", () => ({
  default: ({ phase, onSave, onDelete }: any) => (
    <div data-testid="phase-form">
      <span>Form for {phase.name}</span>
      <button onClick={onDelete}>Delete Phase</button>
    </div>
  ),
}));

const mockPhase = {
  id: "p1",
  tenant_id: "t1",
  name: "Greet",
  order_index: 0,
  max_messages: 1,
  system_prompt: "Welcome the lead",
  tone: "friendly",
  goals: "Make them feel welcome",
  transition_hint: "Move to nurture",
  action_button_ids: null,
  image_attachment_ids: [],
  created_at: "2026-01-01",
};

describe("PhaseCard", () => {
  const mockOnSave = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders phase name and order", () => {
    render(
      <PhaseCard phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.getByText("Greet")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows tone badge", () => {
    render(
      <PhaseCard phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.getByText("friendly")).toBeInTheDocument();
  });

  it("shows max messages info", () => {
    render(
      <PhaseCard phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.getByText(/1 msg/i)).toBeInTheDocument();
  });

  it("expands to show PhaseForm on click", async () => {
    const user = userEvent.setup();
    render(
      <PhaseCard phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.queryByTestId("phase-form")).not.toBeInTheDocument();

    await user.click(screen.getByText("Greet"));

    expect(screen.getByTestId("phase-form")).toBeInTheDocument();
  });

  it("collapses when clicking header again", async () => {
    const user = userEvent.setup();
    render(
      <PhaseCard phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    await user.click(screen.getByText("Greet"));
    expect(screen.getByTestId("phase-form")).toBeInTheDocument();

    await user.click(screen.getByText("Greet"));
    expect(screen.queryByTestId("phase-form")).not.toBeInTheDocument();
  });
});
