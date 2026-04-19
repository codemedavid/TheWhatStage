import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImageAttachmentPicker from "@/components/dashboard/ImageAttachmentPicker";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ImageAttachmentPicker", () => {
  const onSelect = vi.fn();
  const onClear = vi.fn();
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows attach image button when no image selected", () => {
    render(<ImageAttachmentPicker selectedUrl={null} onSelect={onSelect} onClear={onClear} />);
    expect(screen.getByLabelText("Attach image")).toBeInTheDocument();
  });

  it("shows thumbnail when image is selected", () => {
    render(<ImageAttachmentPicker selectedUrl="https://example.com/img.jpg" onSelect={onSelect} onClear={onClear} />);
    expect(screen.getByAltText("Attached image")).toBeInTheDocument();
  });

  it("calls onClear when remove clicked", async () => {
    const user = userEvent.setup();
    render(<ImageAttachmentPicker selectedUrl="https://example.com/img.jpg" onSelect={onSelect} onClear={onClear} />);
    await user.click(screen.getByLabelText("Remove image"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("opens picker dropdown on button click", async () => {
    const user = userEvent.setup();
    render(<ImageAttachmentPicker selectedUrl={null} onSelect={onSelect} onClear={onClear} />);
    await user.click(screen.getByLabelText("Attach image"));
    expect(screen.getByText("Upload from device")).toBeInTheDocument();
    expect(screen.getByText("Knowledge Images")).toBeInTheDocument();
  });

  it("fetches and displays knowledge images", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        images: [{ id: "img-1", url: "https://example.com/img1.jpg", description: "Office photo" }],
      }),
    });
    render(<ImageAttachmentPicker selectedUrl={null} onSelect={onSelect} onClear={onClear} />);
    await user.click(screen.getByLabelText("Attach image"));
    await user.click(screen.getByText("Knowledge Images"));
    await waitFor(() => { expect(screen.getByText("Office photo")).toBeInTheDocument(); });
  });
});
