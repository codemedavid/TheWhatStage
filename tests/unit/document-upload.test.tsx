import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DocumentUpload from "@/components/dashboard/knowledge/DocumentUpload";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockDocs = [
  { id: "1", title: "Test PDF", type: "pdf", status: "ready", metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  { id: "2", title: "Processing Doc", type: "docx", status: "processing", metadata: {}, created_at: "2026-01-02T00:00:00Z" },
];

describe("DocumentUpload", () => {
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders document list", () => {
    render(<DocumentUpload docs={mockDocs} onUploadComplete={mockRefetch} />);
    expect(screen.getByText("Test PDF")).toBeInTheDocument();
    expect(screen.getByText("Processing Doc")).toBeInTheDocument();
  });

  it("shows empty state when no docs", () => {
    render(<DocumentUpload docs={[]} onUploadComplete={mockRefetch} />);
    expect(screen.getByText("No documents uploaded")).toBeInTheDocument();
  });

  it("shows drop zone", () => {
    render(<DocumentUpload docs={[]} onUploadComplete={mockRefetch} />);
    expect(screen.getByText(/drag.*drop/i)).toBeInTheDocument();
  });

  it("uploads file on drop", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docId: "new-1", status: "processing" }),
    });

    render(<DocumentUpload docs={[]} onUploadComplete={mockRefetch} />);

    const dropZone = screen.getByTestId("drop-zone");
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/knowledge/upload",
        expect.objectContaining({ method: "POST" })
      );
    });

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it("rejects unsupported file types", async () => {
    render(<DocumentUpload docs={[]} onUploadComplete={mockRefetch} />);

    const dropZone = screen.getByTestId("drop-zone");
    const file = new File(["content"], "test.txt", { type: "text/plain" });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows file type badges", () => {
    render(<DocumentUpload docs={mockDocs} onUploadComplete={mockRefetch} />);
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("DOCX")).toBeInTheDocument();
  });
});
