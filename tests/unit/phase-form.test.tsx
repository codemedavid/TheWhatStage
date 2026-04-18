import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhaseForm from "@/components/dashboard/flow/PhaseForm";

// Mock the picker sub-components to isolate PhaseForm testing
vi.mock("@/components/dashboard/flow/ImageAttachmentPicker", () => ({
  default: ({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) => (
    <div data-testid="image-picker">Images: {selectedIds.length}</div>
  ),
}));

vi.mock("@/components/dashboard/flow/ActionButtonPicker", () => ({
  default: ({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) => (
    <div data-testid="action-picker">Actions: {selectedIds.length}</div>
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

describe("PhaseForm", () => {
  const mockOnSave = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
  });

  it("renders form fields with phase data", () => {
    render(
      <PhaseForm phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.getByDisplayValue("Greet")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Welcome the lead")).toBeInTheDocument();
    expect(screen.getByDisplayValue("friendly")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Make them feel welcome")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Move to nurture")).toBeInTheDocument();
  });

  it("renders max_messages input", () => {
    render(
      <PhaseForm phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    const input = screen.getByLabelText(/max messages/i);
    expect(input).toHaveValue(1);
  });

  it("calls onSave with updated values", async () => {
    const user = userEvent.setup();
    render(
      <PhaseForm phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    const nameInput = screen.getByDisplayValue("Greet");
    await user.clear(nameInput);
    await user.type(nameInput, "Welcome");
    await user.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Welcome" })
      );
    });
  });

  it("calls onDelete when delete button clicked", async () => {
    const user = userEvent.setup();
    render(
      <PhaseForm phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    await user.click(screen.getByText("Delete Phase"));

    expect(mockOnDelete).toHaveBeenCalled();
  });

  it("renders image and action pickers", () => {
    render(
      <PhaseForm phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.getByTestId("image-picker")).toBeInTheDocument();
    expect(screen.getByTestId("action-picker")).toBeInTheDocument();
  });
});
