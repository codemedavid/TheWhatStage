import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AiCampaignBuilderClient from "@/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient";

const push = vi.fn();
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const planResponse = {
  action: "plan",
  campaign: { id: "camp-1", name: "Trust First", status: "draft", goal: "form_submit" },
  plan: {
    goal_summary: "Qualify leads through trust",
    selling_approach: "Trust-first approach",
    buyer_context: "Warm leads from ads",
    key_behaviors: ["Lead with empathy"],
    phase_outline: [
      { name: "Intent", purpose: "Understand what they want" },
      { name: "Trust", purpose: "Build rapport" },
      { name: "Qualify", purpose: "Guide to form" },
    ],
  },
  rules: ["Never hard sell"],
};

const questionResponse = {
  action: "question",
  question: "What objections do your leads usually have?",
  campaign: null,
};

const phasesResponse = {
  phases: [
    { name: "Intent", order_index: 0, max_messages: 3, system_prompt: "Ask.", tone: "warm", goals: "Understand intent.", transition_hint: "Clear." },
    { name: "Trust", order_index: 1, max_messages: 4, system_prompt: "Build.", tone: "helpful", goals: "Build trust.", transition_hint: "Built." },
    { name: "Qualify", order_index: 2, max_messages: 3, system_prompt: "Guide.", tone: "calm", goals: "Qualify lead.", transition_hint: "Final." },
  ],
};

describe("AiCampaignBuilderClient v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows a question from the AI without generating a plan", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(questionResponse),
    });

    render(<AiCampaignBuilderClient />);
    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "booking campaign");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText(/objections/i)).toBeInTheDocument();
    });

    expect(screen.queryByText("Generate Phases")).not.toBeInTheDocument();
  });

  it("generates a plan and shows the Generate Phases button", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(planResponse),
    });

    render(<AiCampaignBuilderClient />);
    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "trust-first qualification");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText("Trust First")).toBeInTheDocument();
      expect(screen.getByText("Qualify leads through trust")).toBeInTheDocument();
      expect(screen.getByText("Generate Phases")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/campaigns/ai-builder/plan",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("generates phases when the button is clicked", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(planResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(phasesResponse) });

    render(<AiCampaignBuilderClient />);
    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "trust-first");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    await screen.findByText("Generate Phases");

    await userEvent.click(screen.getByRole("button", { name: /Generate Phases/i }));

    await waitFor(() => {
      expect(screen.getByText("Intent")).toBeInTheDocument();
      expect(screen.getByText("Trust")).toBeInTheDocument();
      expect(screen.getByText("Qualify")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/campaigns/ai-builder/phases",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("focuses a phase when its card is clicked", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(planResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(phasesResponse) });

    render(<AiCampaignBuilderClient />);
    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "trust-first");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    await screen.findByText("Generate Phases");
    await userEvent.click(screen.getByRole("button", { name: /Generate Phases/i }));
    await screen.findByText("Intent");

    await userEvent.click(screen.getByText("Trust").closest("button")!);

    expect(screen.getByPlaceholderText(/Describe changes for Trust/i)).toBeInTheDocument();
  });

  it("routes to experiment after testing against primary", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(planResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(phasesResponse) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiment: { id: "exp-1" } }),
      });

    render(<AiCampaignBuilderClient />);
    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "trust-first");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    await screen.findByText("Generate Phases");
    await userEvent.click(screen.getByRole("button", { name: /Generate Phases/i }));
    await screen.findByText("Intent");

    await userEvent.click(screen.getByRole("button", { name: /Test Against Primary/i }));

    expect(push).toHaveBeenCalledWith("/app/campaigns/experiments/exp-1");
  });
});
