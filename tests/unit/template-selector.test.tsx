import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TemplateSelector from "@/components/dashboard/flow/TemplateSelector";

describe("TemplateSelector", () => {
  const mockOnSeed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders four business type options", () => {
    render(<TemplateSelector onSeed={mockOnSeed} seeding={false} />);

    expect(screen.getByText("E-Commerce")).toBeInTheDocument();
    expect(screen.getByText("Real Estate")).toBeInTheDocument();
    expect(screen.getByText("Digital Product")).toBeInTheDocument();
    expect(screen.getByText("Services")).toBeInTheDocument();
  });

  it("shows empty state heading", () => {
    render(<TemplateSelector onSeed={mockOnSeed} seeding={false} />);

    expect(screen.getByText("No conversation flow configured")).toBeInTheDocument();
  });

  it("calls onSeed with selected business type", async () => {
    const user = userEvent.setup();
    render(<TemplateSelector onSeed={mockOnSeed} seeding={false} />);

    await user.click(screen.getByText("Services"));

    expect(mockOnSeed).toHaveBeenCalledWith("services");
  });

  it("calls onSeed with ecommerce type", async () => {
    const user = userEvent.setup();
    render(<TemplateSelector onSeed={mockOnSeed} seeding={false} />);

    await user.click(screen.getByText("E-Commerce"));

    expect(mockOnSeed).toHaveBeenCalledWith("ecommerce");
  });

  it("disables buttons while seeding", () => {
    render(<TemplateSelector onSeed={mockOnSeed} seeding={true} />);

    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
