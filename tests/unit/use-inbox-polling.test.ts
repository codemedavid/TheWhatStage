import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useInboxPolling } from "@/hooks/useInboxPolling";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("useInboxPolling", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("fetches conversations on mount", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ conversations: [{ id: "c1", needsHuman: true }] }),
    });
    const { result } = renderHook(() => useInboxPolling());

    // Wait for the initial fetch to resolve
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.conversations).toHaveLength(1);
  });

  it("polls every 5 seconds", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ conversations: [] }) });
    const { unmount } = renderHook(() => useInboxPolling());

    // Wait for initial fetch
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Wait for next poll interval (5 seconds + buffer)
    await new Promise(resolve => setTimeout(resolve, 5100));

    expect(mockFetch).toHaveBeenCalledTimes(2);

    unmount();
  }, 10000);

  it("exposes refetch", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ conversations: [] }) });
    const { result } = renderHook(() => useInboxPolling());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => { result.current.refetch(); });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
