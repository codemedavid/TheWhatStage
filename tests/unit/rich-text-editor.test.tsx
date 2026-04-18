import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RichTextEditor from "@/components/dashboard/knowledge/RichTextEditor";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockRichtextDocs = [
  {
    id: "rt-1",
    title: "About Us",
    type: "richtext" as const,
    status: "ready" as const,
    metadata: {},
    created_at: "2026-01-01",
  },
];

describe("RichTextEditor", () => {
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders existing rich text documents list", () => {
    render(<RichTextEditor docs={mockRichtextDocs} onSaveComplete={mockRefetch} />);
    expect(screen.getByText("About Us")).toBeInTheDocument();
  });

  it("shows empty state when no documents", () => {
    render(<RichTextEditor docs={[]} onSaveComplete={mockRefetch} />);
    expect(screen.getByText("No documents created")).toBeInTheDocument();
  });

  it("shows editor form when New Document clicked", async () => {
    const user = userEvent.setup();
    render(<RichTextEditor docs={[]} onSaveComplete={mockRefetch} />);

    await user.click(screen.getByText("New Document"));

    expect(screen.getByPlaceholderText(/document title/i)).toBeInTheDocument();
    expect(screen.getByTestId("tiptap-editor")).toBeInTheDocument();
  });

  it("validates empty title", async () => {
    const user = userEvent.setup();
    render(<RichTextEditor docs={[]} onSaveComplete={mockRefetch} />);

    await user.click(screen.getByText("New Document"));
    await user.click(screen.getByText("Save Document"));

    expect(screen.getByText(/title is required/i)).toBeInTheDocument();
  });
});
