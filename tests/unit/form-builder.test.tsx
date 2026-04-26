import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FormBuilder from "@/components/action-pages/FormBuilder";

vi.mock("@/components/action-pages/FormRenderer", () => ({
  default: () => <div data-testid="form-preview" />,
}));

const defaultConfig = {
  heading: "",
  layout: "single_column" as const,
  submit_button_text: "Submit",
  thank_you_message: "Thanks!",
};

describe("FormBuilder", () => {
  it("shows a readable validation error instead of saving a blank field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <FormBuilder
        actionPageId="action-page-1"
        initialTitle="Lead Form"
        initialSlug="lead-form"
        initialPublished={false}
        initialConfig={defaultConfig}
        initialFields={[]}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole("button", { name: /add field/i }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Field 1 needs a label.")).toBeInTheDocument();
  });
});
