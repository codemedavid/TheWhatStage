import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { proposeFunnelStructure, type AvailablePage } from "@/lib/ai/funnel-builder";

const bodySchema = z.object({ kickoff: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  // Validate body first so we can return 400 without touching auth
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Auth
  let session;
  try {
    session = await requireTenantSession();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const service = createServiceClient();

  const { data, error } = await service
    .from("action_pages")
    .select("id, type, title, published")
    .eq("tenant_id", session.tenantId)
    .eq("published", true)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pages: AvailablePage[] = (data ?? []).map((p) => ({
    id: p.id,
    type: p.type as AvailablePage["type"],
    title: p.title,
  }));

  if (pages.length === 0) {
    return NextResponse.json(
      { error: "No published action pages — build one first." },
      { status: 409 }
    );
  }

  try {
    const result = await proposeFunnelStructure({ kickoff: parsed.kickoff, availablePages: pages });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
