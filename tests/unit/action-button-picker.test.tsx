import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActionButtonPicker from "@/components/dashboard/flow/ActionButtonPicker";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockPages = [
  { id: "ap1", title: "Book a Call", type: "calendar", slug: "book-call" },
  { id: "ap2", title: "Contact Form", type: "form", slug: "contact" },
];

describe("ActionButtonPicker", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ actionPages: mockPages }),
    });
  });

  it("loads and displays available action pages", async () => {
    render(<ActionButtonPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Book a Call")).toBeInTheDocument();
      expect(screen.getByText("Contact Form")).toBeInTheDocument();
    });
  });

  it("shows selected state for pre-selected pages", async () => {
    render(<ActionButtonPicker selectedIds={["ap1"]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Book a Call")).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText("Book a Call");
    expect(checkbox).toBeChecked();
  });

  it("calls onChange when toggling", async () => {
    const user = userEvent.setup();
    render(<ActionButtonPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Book a Call")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Book a Call"));

    expect(mockOnChange).toHaveBeenCalledWith(["ap1"]);
  });

  it("shows empty state when no action pages exist", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ actionPages: [] }),
    });

    render(<ActionButtonPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText(/no action pages/i)).toBeInTheDocument();
    });
  });

  it("shows type badge for each page", async () => {
    render(<ActionButtonPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("calendar")).toBeInTheDocument();
      expect(screen.getByText("form")).toBeInTheDocument();
    });
  });
});
