import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EscalationBanner from "@/components/dashboard/EscalationBanner";

describe("EscalationBanner", () => {
  it("shows 'Bot is active' when not escalated and not paused", () => {
    render(<EscalationBanner needsHuman={false} botPausedAt={null} onResume={() => {}} />);
    expect(screen.getByText("Bot is active")).toBeInTheDocument();
  });

  it("shows 'Waiting for human' when escalated but not paused", () => {
    render(<EscalationBanner needsHuman={true} botPausedAt={null} onResume={() => {}} />);
    expect(screen.getByText("Waiting for human")).toBeInTheDocument();
  });

  it("shows 'Bot paused' and Resume button when paused", () => {
    render(<EscalationBanner needsHuman={true} botPausedAt="2026-01-01T00:00:00Z" onResume={() => {}} />);
    expect(screen.getByText(/Bot paused/)).toBeInTheDocument();
    expect(screen.getByText("Resume Bot")).toBeInTheDocument();
  });

  it("calls onResume when Resume Bot clicked", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    render(<EscalationBanner needsHuman={true} botPausedAt="2026-01-01T00:00:00Z" onResume={onResume} />);
    await user.click(screen.getByText("Resume Bot"));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("does not show Resume button when bot is active", () => {
    render(<EscalationBanner needsHuman={false} botPausedAt={null} onResume={() => {}} />);
    expect(screen.queryByText("Resume Bot")).not.toBeInTheDocument();
  });
});
