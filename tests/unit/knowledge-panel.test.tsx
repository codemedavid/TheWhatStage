import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgePanel from "@/components/dashboard/knowledge/KnowledgePanel";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("KnowledgePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docs: [] }),
    });
  });

  it("renders four sub-tabs", async () => {
    render(<KnowledgePanel />);

    await waitFor(() => {
      expect(screen.getByText("Documents")).toBeInTheDocument();
      expect(screen.getByText("FAQ")).toBeInTheDocument();
      expect(screen.getByText("Editor")).toBeInTheDocument();
      expect(screen.getByText("Products")).toBeInTheDocument();
    });
  });

  it("defaults to Documents tab", async () => {
    render(<KnowledgePanel />);

    await waitFor(() => {
      expect(screen.getByText("No documents uploaded")).toBeInTheDocument();
    });
  });

  it("switches to FAQ tab", async () => {
    const user = userEvent.setup();
    render(<KnowledgePanel />);

    await waitFor(() => {
      expect(screen.getByText("FAQ")).toBeInTheDocument();
    });

    await user.click(screen.getByText("FAQ"));

    await waitFor(() => {
      expect(screen.getByText("No FAQs added")).toBeInTheDocument();
    });
  });

  it("switches to Editor tab", async () => {
    const user = userEvent.setup();
    render(<KnowledgePanel />);

    await waitFor(() => {
      expect(screen.getByText("Editor")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Editor"));

    await waitFor(() => {
      expect(screen.getByText("No knowledge written yet")).toBeInTheDocument();
    });
  });

  it("switches to Products tab", async () => {
    const user = userEvent.setup();
    render(<KnowledgePanel />);

    await waitFor(() => {
      expect(screen.getByText("Products")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Products"));

    await waitFor(() => {
      expect(screen.getByText("No product knowledge")).toBeInTheDocument();
    });
  });
});
