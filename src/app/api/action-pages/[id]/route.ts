import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  published: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("action_pages")
    .select("id, tenant_id, slug, type, title, config, published, version, created_at")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ actionPage: data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("action_pages")
    .update(parsed.data)
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .select("id, tenant_id, slug, type, title, config, published, version, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: error ? 500 : 404 });
  }

  return NextResponse.json({ actionPage: data });
}
