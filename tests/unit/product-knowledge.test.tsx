import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProductKnowledge from "@/components/dashboard/knowledge/ProductKnowledge";

describe("ProductKnowledge", () => {
  const mockProductDocs = [
    {
      id: "prod-1",
      title: "Blue Widget",
      type: "product" as const,
      status: "ready" as const,
      metadata: {},
      created_at: "2026-01-01",
    },
  ];

  it("renders product knowledge list", () => {
    render(<ProductKnowledge docs={mockProductDocs} />);
    expect(screen.getByText("Blue Widget")).toBeInTheDocument();
  });

  it("shows empty state when no product docs", () => {
    render(<ProductKnowledge docs={[]} />);
    expect(screen.getByText("No product knowledge")).toBeInTheDocument();
  });

  it("shows explanation about auto-sync", () => {
    render(<ProductKnowledge docs={[]} />);
    expect(screen.getByText(/automatically synced/i)).toBeInTheDocument();
  });

  it("filters to only product type docs", () => {
    const mixedDocs = [
      ...mockProductDocs,
      { id: "faq-1", title: "Some FAQ", type: "faq" as const, status: "ready" as const, metadata: {}, created_at: "2026-01-01" },
    ];
    render(<ProductKnowledge docs={mixedDocs} />);
    expect(screen.getByText("Blue Widget")).toBeInTheDocument();
    expect(screen.queryByText("Some FAQ")).not.toBeInTheDocument();
  });
});
