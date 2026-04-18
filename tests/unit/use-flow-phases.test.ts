import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFlowPhases } from "@/hooks/useFlowPhases";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockPhases = [
  {
    id: "p1",
    name: "Greet",
    order_index: 0,
    max_messages: 1,
    system_prompt: "Welcome",
    tone: "friendly",
    goals: null,
    transition_hint: null,
    action_button_ids: null,
    image_attachment_ids: [],
    created_at: "2026-01-01",
  },
  {
    id: "p2",
    name: "Nurture",
    order_index: 1,
    max_messages: 3,
    system_prompt: "Build rapport",
    tone: "genuine",
    goals: "Build trust",
    transition_hint: "Move to qualify",
    action_button_ids: null,
    image_attachment_ids: [],
    created_at: "2026-01-01",
  },
];

describe("useFlowPhases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches phases on mount", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ phases: mockPhases }),
    });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.phases).toHaveLength(2);
    });

    expect(result.current.phases[0].name).toBe("Greet");
    expect(result.current.loading).toBe(false);
  });

  it("exposes a refetch function", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ phases: [] }),
    });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.refetch();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("createPhase calls POST and refetches", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phase: { id: "p3" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: [...mockPhases, { id: "p3", name: "New", order_index: 2 }] }),
      });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createPhase({
        name: "New",
        order_index: 2,
        max_messages: 3,
        system_prompt: "New prompt",
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bot/phases",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("updatePhase calls PATCH and refetches", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phase: { id: "p1", name: "Updated" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updatePhase("p1", { name: "Updated" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bot/phases/p1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("deletePhase calls DELETE and refetches", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: [mockPhases[1]] }),
      });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deletePhase("p1");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bot/phases/p1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("reorderPhases calls POST reorder and refetches", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: [mockPhases[1], mockPhases[0]] }),
      });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.reorderPhases([
        { id: "p2", order_index: 0 },
        { id: "p1", order_index: 1 },
      ]);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bot/phases/reorder",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("seedPhases calls POST seed and refetches", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.seedPhases("services");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bot/phases/seed",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ business_type: "services" }),
      })
    );
  });
});
