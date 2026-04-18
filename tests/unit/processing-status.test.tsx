import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProcessingStatus from "@/components/dashboard/knowledge/ProcessingStatus";

describe("ProcessingStatus", () => {
  it("shows processing state with spinner", () => {
    render(<ProcessingStatus status="processing" />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("shows ready state", () => {
    render(<ProcessingStatus status="ready" />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows error state with message", () => {
    render(<ProcessingStatus status="error" errorMessage="Parse failed" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Parse failed")).toBeInTheDocument();
  });

  it("shows error state without message", () => {
    render(<ProcessingStatus status="error" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
  });
});
