// tests/unit/ai-builder-empty-state.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiBuilderEmptyState } from "@/components/dashboard/campaigns/AiBuilderEmptyState";

describe("AiBuilderEmptyState", () => {
  it("shows a CTA to build an action page", () => {
    render(<AiBuilderEmptyState />);
    expect(screen.getByText(/build your first action page/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /action pages/i })).toHaveAttribute(
      "href",
      "/app/action-pages"
    );
  });
});
