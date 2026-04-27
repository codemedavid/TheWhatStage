import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BotClient from "@/app/(tenant)/app/bot/BotClient";

vi.mock("@/components/dashboard/knowledge/KnowledgePanel", () => ({
  default: () => <div>Knowledge panel</div>,
}));

vi.mock("@/components/dashboard/MessageThread", () => ({
  default: ({ onSend }: { onSend?: (text: string) => void }) => (
    <button type="button" onClick={() => onSend?.("hello")}>
      Send test message
    </button>
  ),
}));

describe("BotClient test chat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads campaign funnels instead of campaign phases for test chat", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/campaigns") {
        return Response.json({
          campaigns: [{ id: "camp-1", name: "Spring Sale" }],
        });
      }

      if (url === "/api/campaigns/camp-1/funnels") {
        return Response.json({
          funnels: [{ id: "funnel-1", position: 0, actionPageId: "page-1" }],
          availablePages: [{ id: "page-1", title: "Book a Demo", type: "booking" }],
        });
      }

      if (url === "/api/bot/test-chat") {
        return Response.json({});
      }

      return Response.json({ funnels: [], availablePages: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<BotClient />);

    await user.click(screen.getByRole("button", { name: /test chat/i }));
    await screen.findByRole("option", { name: "Spring Sale" });
    await user.selectOptions(screen.getByRole("combobox"), "camp-1");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/campaigns/camp-1/funnels");
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
      "/api/bot/phases"
    );
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
      "/api/campaigns/camp-1/phases"
    );
  });

  it("does not show legacy message-count budgets in the current funnel badge", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/campaigns") {
        return Response.json({
          campaigns: [{ id: "camp-1", name: "Spring Sale" }],
        });
      }

      if (url === "/api/campaigns/camp-1/funnels") {
        return Response.json({
          funnels: [{ id: "funnel-1", position: 0, actionPageId: "page-1" }],
          availablePages: [{ id: "page-1", title: "Book a Demo", type: "booking" }],
        });
      }

      if (url === "/api/bot/test-chat") {
        return Response.json({
          reply: "hi",
          phaseAction: "stay",
          confidence: 0.9,
          currentFunnel: {
            id: "funnel-1",
            pageTitle: "Book a Demo",
            pageType: "booking",
            index: 0,
            total: 1,
            messageCount: 1,
            maxMessages: 8,
          },
        });
      }

      return Response.json({ funnels: [], availablePages: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<BotClient />);

    await user.click(screen.getByRole("button", { name: /test chat/i }));
    await screen.findByRole("option", { name: "Spring Sale" });
    await user.selectOptions(screen.getByRole("combobox"), "camp-1");
    await user.click(screen.getByRole("button", { name: /send test message/i }));

    expect(await screen.findByText(/Funnel 1\/1: Book a Demo/)).toBeInTheDocument();
    expect(screen.queryByText(/msgs/i)).not.toBeInTheDocument();
  });
});
