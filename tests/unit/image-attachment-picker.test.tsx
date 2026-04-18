import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImageAttachmentPicker from "@/components/dashboard/flow/ImageAttachmentPicker";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockImages = [
  { id: "img1", url: "https://example.com/img1.jpg", description: "Office photo", tags: ["office"] },
  { id: "img2", url: "https://example.com/img2.jpg", description: "Product shot", tags: ["product"] },
  { id: "img3", url: "https://example.com/img3.jpg", description: "Team photo", tags: ["team"] },
];

describe("ImageAttachmentPicker", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ images: mockImages }),
    });
  });

  it("loads and displays available images", async () => {
    render(<ImageAttachmentPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Office photo")).toBeInTheDocument();
      expect(screen.getByText("Product shot")).toBeInTheDocument();
      expect(screen.getByText("Team photo")).toBeInTheDocument();
    });
  });

  it("shows selected state for pre-selected images", async () => {
    render(<ImageAttachmentPicker selectedIds={["img1"]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Office photo")).toBeInTheDocument();
    });

    const img1Checkbox = screen.getByLabelText("Office photo");
    expect(img1Checkbox).toBeChecked();
  });

  it("calls onChange when toggling an image", async () => {
    const user = userEvent.setup();
    render(<ImageAttachmentPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Office photo")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Office photo"));

    expect(mockOnChange).toHaveBeenCalledWith(["img1"]);
  });

  it("calls onChange with removed id when deselecting", async () => {
    const user = userEvent.setup();
    render(<ImageAttachmentPicker selectedIds={["img1", "img2"]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Office photo")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Office photo"));

    expect(mockOnChange).toHaveBeenCalledWith(["img2"]);
  });

  it("shows empty state when no images exist", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ images: [] }),
    });

    render(<ImageAttachmentPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText(/no images available/i)).toBeInTheDocument();
    });
  });
});
