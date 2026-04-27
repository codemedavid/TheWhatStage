import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FaqEditor from "@/components/dashboard/knowledge/FaqEditor";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockFaqDocs = [
  {
    id: "faq-1",
    title: "What are your hours?",
    type: "faq" as const,
    status: "ready" as const,
    metadata: {},
    created_at: "2026-01-01",
  },
];

describe("FaqEditor", () => {
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders FAQ list from docs", () => {
    render(<FaqEditor docs={mockFaqDocs} onFaqAdded={mockRefetch} />);
    expect(screen.getByText("What are your hours?")).toBeInTheDocument();
  });

  it("shows empty state when no FAQs", () => {
    render(<FaqEditor docs={[]} onFaqAdded={mockRefetch} />);
    expect(screen.getByText("No FAQs added")).toBeInTheDocument();
  });

  it("shows add FAQ form when button clicked", async () => {
    const user = userEvent.setup();
    render(<FaqEditor docs={[]} onFaqAdded={mockRefetch} />);

    await user.click(screen.getByText("Add FAQ"));

    expect(screen.getByPlaceholderText(/question/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/answer/i)).toBeInTheDocument();
  });

  it("submits FAQ via API", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docId: "new-faq" }),
    });

    const user = userEvent.setup();
    render(<FaqEditor docs={[]} onFaqAdded={mockRefetch} />);

    await user.click(screen.getByText("Add FAQ"));
    await user.type(screen.getByPlaceholderText(/question/i), "How much?");
    await user.type(screen.getByPlaceholderText(/answer/i), "Starting at $99");
    await user.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/knowledge/faq",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ question: "How much?", answer: "Starting at $99" }),
        })
      );
    });

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it("validates empty fields", async () => {
    const user = userEvent.setup();
    render(<FaqEditor docs={[]} onFaqAdded={mockRefetch} />);

    await user.click(screen.getByText("Add FAQ"));
    await user.click(screen.getByText("Save"));

    expect(screen.getByText(/question and answer are required/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
