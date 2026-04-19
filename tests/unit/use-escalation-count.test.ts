import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useEscalationCount } from "@/hooks/useEscalationCount";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("useEscalationCount", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns escalation count on mount", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        conversations: [
          { id: "c1", needsHuman: true },
          { id: "c2", needsHuman: true },
          { id: "c3", needsHuman: false },
        ],
      }),
    });
    const { result } = renderHook(() => useEscalationCount());

    await waitFor(() => {
      expect(result.current).toBe(2);
    });
  });

  it("returns 0 when no escalated conversations", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ conversations: [{ id: "c1", needsHuman: false }] }),
    });
    const { result } = renderHook(() => useEscalationCount());

    await waitFor(() => {
      expect(result.current).toBe(0);
    });
  });
});
