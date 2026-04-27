import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock embedding so we don't hit HuggingFace
vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn(async () => new Array(1024).fill(0.1)),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(async () => ({ tenantId: "tenant-1", userId: "u-1" })),
}));

const supabaseMock = {
  from: vi.fn(),
};
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => supabaseMock,
}));

import { PATCH, DELETE } from "@/app/api/knowledge/faq/[id]/route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/knowledge/faq/abc", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/knowledge/faq/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when question or answer missing", async () => {
    const res = await PATCH(makeReq({ question: "" }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects when doc not owned by tenant", async () => {
    supabaseMock.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    });

    const res = await PATCH(makeReq({ question: "Q", answer: "A" }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(404);
  });

  it("updates doc + replaces single chunk on success", async () => {
    const updateDoc = vi.fn().mockReturnValue({ eq: () => ({ error: null }) });
    const updateChunk = vi.fn().mockReturnValue({
      eq: () => ({ eq: () => ({ error: null }) }),
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "knowledge_docs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "abc", tenant_id: "tenant-1" },
                  error: null,
                }),
              }),
            }),
          }),
          update: (...args: unknown[]) => updateDoc(...args),
        };
      }
      if (table === "knowledge_chunks") {
        return { update: (...args: unknown[]) => updateChunk(...args) };
      }
      throw new Error("unexpected table " + table);
    });

    const res = await PATCH(makeReq({ question: "New Q", answer: "New A" }), {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(res.status).toBe(200);
    expect(updateDoc).toHaveBeenCalled();
    expect(updateChunk).toHaveBeenCalled();
  });
});

describe("DELETE /api/knowledge/faq/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes doc scoped to tenant", async () => {
    const del = vi.fn().mockReturnValue({
      eq: () => ({ eq: () => ({ error: null }) }),
    });
    supabaseMock.from.mockReturnValue({ delete: del });

    const res = await DELETE(
      new Request("http://localhost/api/knowledge/faq/abc", { method: "DELETE" }),
      { params: Promise.resolve({ id: "abc" }) }
    );
    expect(res.status).toBe(204);
    expect(del).toHaveBeenCalled();
  });
});
