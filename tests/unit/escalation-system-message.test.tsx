import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EscalationSystemMessage from "@/components/dashboard/EscalationSystemMessage";

describe("EscalationSystemMessage", () => {
  it("shows low confidence reason", () => {
    render(<EscalationSystemMessage reason="low_confidence" />);
    expect(screen.getByText(/low confidence/i)).toBeInTheDocument();
  });

  it("shows empty response reason", () => {
    render(<EscalationSystemMessage reason="empty_response" />);
    expect(screen.getByText(/couldn.*generate/i)).toBeInTheDocument();
  });

  it("shows LLM decision reason", () => {
    render(<EscalationSystemMessage reason="llm_decision" />);
    expect(screen.getByText(/decided to escalate/i)).toBeInTheDocument();
  });

  it("shows generic message for null reason", () => {
    render(<EscalationSystemMessage reason={null} />);
    expect(screen.getByText(/escalated/i)).toBeInTheDocument();
  });
});
