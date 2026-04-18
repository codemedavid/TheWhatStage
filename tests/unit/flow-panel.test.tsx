import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import FlowPanel from "@/components/dashboard/flow/FlowPanel";

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock PhaseList
vi.mock("@/components/dashboard/flow/PhaseList", () => ({
  default: ({ phases, onCreatePhase }: any) => (
    <div data-testid="phase-list">
      <span>{phases.length} phases loaded</span>
      <button onClick={onCreatePhase}>Add Phase</button>
    </div>
  ),
}));

// Mock TemplateSelector
vi.mock("@/components/dashboard/flow/TemplateSelector", () => ({
  default: ({ onSeed }: any) => (
    <div data-testid="template-selector">
      <button onClick={() => onSeed("services")}>Seed Services</button>
    </div>
  ),
}));

describe("FlowPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows TemplateSelector when no phases exist", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ phases: [] }),
    });

    render(<FlowPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("template-selector")).toBeInTheDocument();
    });
  });

  it("shows PhaseList when phases exist", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          phases: [
            {
              id: "p1", name: "Greet", order_index: 0, max_messages: 1,
              system_prompt: "Welcome", tone: "friendly", goals: null,
              transition_hint: null, action_button_ids: null,
              image_attachment_ids: [], created_at: "2026-01-01",
            },
          ],
        }),
    });

    render(<FlowPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("phase-list")).toBeInTheDocument();
      expect(screen.getByText("1 phases loaded")).toBeInTheDocument();
    });
  });

  it("shows loading spinner initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<FlowPanel />);

    expect(screen.getByTestId("flow-loading")).toBeInTheDocument();
  });
});
