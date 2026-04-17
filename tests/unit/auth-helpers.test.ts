import { describe, it, expect } from "vitest";
import { needsEmailConfirmation } from "@/lib/auth/helpers";

describe("needsEmailConfirmation", () => {
  it("returns false when session exists (auto-confirm)", () => {
    const result = {
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          identities: [{ id: "1" }],
          email_confirmed_at: "2026-04-18T00:00:00Z",
        },
        session: { access_token: "abc", refresh_token: "def" },
      },
      error: null,
    };
    expect(needsEmailConfirmation(result)).toBe(false);
  });

  it("returns true when user has no identities (email confirm pending)", () => {
    const result = {
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          identities: [],
          email_confirmed_at: null,
        },
        session: null,
      },
      error: null,
    };
    expect(needsEmailConfirmation(result)).toBe(true);
  });

  it("returns true when session is null but user exists", () => {
    const result = {
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          identities: [{ id: "1" }],
          email_confirmed_at: null,
        },
        session: null,
      },
      error: null,
    };
    expect(needsEmailConfirmation(result)).toBe(true);
  });

  it("returns false when there is an error (let caller handle)", () => {
    const result = {
      data: { user: null, session: null },
      error: { message: "Something went wrong" },
    };
    expect(needsEmailConfirmation(result)).toBe(false);
  });
});
