import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ActionPageEditor from "@/app/(tenant)/app/actions/[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "action-page-1" }),
}));

vi.mock("@/components/action-pages/FormBuilder", () => ({
  default: ({
    initialTitle,
    initialFields,
  }: {
    initialTitle: string;
    initialFields: Array<{ id: string; label: string }>;
  }) => (
    <div data-testid="form-builder" data-field-count={initialFields.length}>
      {initialTitle}
    </div>
  ),
}));

const pageResponse = () =>
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
  );

const fieldsResponse = (
  fields: Array<{
    id: string;
    label: string;
    field_key: string;
    field_type: string;
    placeholder: string | null;
    required: boolean;
    options: unknown;
    order_index: number;
    lead_mapping: unknown;
  }>
) =>
  new Response(JSON.stringify({ fields }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("ActionPageEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("waits for fields to load before mounting the editor so existing fields aren't wiped on save", async () => {
    let resolveFields: (res: Response) => void = () => undefined;
    const fieldsPromise = new Promise<Response>((resolve) => {
      resolveFields = resolve;
    });

    vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/action-pages/action-page-1")) {
        return Promise.resolve(pageResponse());
      }
      if (url.endsWith("/api/action-pages/action-page-1/fields")) {
        return fieldsPromise;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<ActionPageEditor />);

    // Editor must NOT mount until fields arrive — otherwise FormBuilder freezes
    // initialFields=[] and any save would delete the real fields.
    await waitFor(() => {
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("form-builder")).not.toBeInTheDocument();

    resolveFields(
      fieldsResponse([
        {
          id: "f1",
          label: "Name",
          field_key: "name",
          field_type: "text",
          placeholder: null,
          required: true,
          options: null,
          order_index: 0,
          lead_mapping: null,
        },
      ])
    );

    await waitFor(() => {
      expect(screen.getByTestId("form-builder")).toHaveTextContent("Lead Form");
    });
    expect(screen.getByTestId("form-builder")).toHaveAttribute(
      "data-field-count",
      "1"
    );
  });

  it("shows an error instead of the editor when fields fail to load", async () => {
    vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/action-pages/action-page-1")) {
        return Promise.resolve(pageResponse());
      }
      if (url.endsWith("/api/action-pages/action-page-1/fields")) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "boom" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<ActionPageEditor />);

    await waitFor(() => {
      expect(screen.getByText(/couldn't load form/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("form-builder")).not.toBeInTheDocument();
  });
});
