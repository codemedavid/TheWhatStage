import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useKnowledgeDocs } from "@/hooks/useKnowledgeDocs";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("useKnowledgeDocs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches docs on mount", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          docs: [
            { id: "1", title: "Doc 1", type: "pdf", status: "ready", metadata: {}, created_at: "2026-01-01" },
          ],
        }),
    });

    const { result } = renderHook(() => useKnowledgeDocs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.docs).toHaveLength(1);
    expect(result.current.docs[0].title).toBe("Doc 1");
    expect(result.current.loading).toBe(false);
  });

  it("polls when there are processing docs", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ id: "1", title: "Doc", type: "pdf", status: "processing", metadata: {}, created_at: "2026-01-01" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ id: "1", title: "Doc", type: "pdf", status: "ready", metadata: {}, created_at: "2026-01-01" }],
          }),
      });

    const { result } = renderHook(() => useKnowledgeDocs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.docs).toHaveLength(1);
    expect(result.current.docs[0].status).toBe("processing");

    // Advance past polling interval (3 seconds)
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    // Wait for the new fetch to complete
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.docs[0].status).toBe("ready");
  });

  it("exposes a refetch function", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docs: [] }),
    });

    const { result } = renderHook(() => useKnowledgeDocs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.loading).toBe(false);

    await act(async () => {
      result.current.refetch();
      await vi.runAllTimersAsync();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
