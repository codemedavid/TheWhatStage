import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ActionPageEditor from "@/app/(tenant)/app/actions/[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "action-page-1" }),
}));

vi.mock("@/components/action-pages/FormBuilder", () => ({
  default: ({ initialTitle }: { initialTitle: string }) => (
    <div data-testid="form-builder">{initialTitle}</div>
  ),
}));

describe("ActionPageEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the form editor when the page loads even if fields are unavailable", async () => {
    vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/action-pages/action-page-1")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              actionPage: {
                id: "action-page-1",
                title: "Lead Form",
                slug: "lead-form",
                type: "form",
                published: false,
                config: {},
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (url.endsWith("/api/action-pages/action-page-1/fields")) {
        return new Promise<Response>(() => undefined);
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<ActionPageEditor />);

    await waitFor(() => {
      expect(screen.getByTestId("form-builder")).toHaveTextContent("Lead Form");
    });
  });
});
