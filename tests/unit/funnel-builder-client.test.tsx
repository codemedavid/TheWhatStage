// tests/unit/funnel-builder-client.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FunnelBuilderClient } from "@/components/dashboard/campaigns/FunnelBuilderClient";
import type { AvailablePage } from "@/lib/ai/funnel-builder";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const pages: AvailablePage[] = [
  { id: "p-sales", type: "sales", title: "Sales Page" },
  { id: "p-qual", type: "qualification", title: "Qualification" },
];

describe("FunnelBuilderClient", () => {
  it("kickoff -> proposal -> review -> save", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          action: "propose",
          mainGoal: "Sell coaching to qualified leads.",
          campaignPersonality: null,
          funnels: [
            { actionPageId: "p-qual", pitch: "Qualify them first.", qualificationQuestions: [] },
            { actionPageId: "p-sales", pitch: "Send the sales page.", qualificationQuestions: [] },
          ],
          topLevelRules: ["Be friendly"],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaignId: "c-1" }) });

    render(<FunnelBuilderClient availablePages={pages} />);

    fireEvent.change(screen.getByPlaceholderText(/vacation package/i), {
      target: { value: "Sell coaching to qualified leads" },
    });
    fireEvent.click(screen.getByRole("button", { name: /propose funnel/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /next: chat rules/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /next: chat rules/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /next: review/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /next: review/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save campaign/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /save campaign/i }));
    await waitFor(() => expect(screen.getByText(/campaign saved/i)).toBeInTheDocument());
  });

  it("renders a question if the proposer asks one", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ action: "question", question: "What's the offer?" }),
    });

    render(<FunnelBuilderClient availablePages={pages} />);
    fireEvent.change(screen.getByPlaceholderText(/vacation package/i), {
      target: { value: "uhh" },
    });
    fireEvent.click(screen.getByRole("button", { name: /propose funnel/i }));

    await waitFor(() =>
      expect(screen.getByText(/what's the offer\?/i)).toBeInTheDocument()
    );
  });
});
