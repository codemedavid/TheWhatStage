import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const MAX_RULE_LENGTH = 500;

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    rule_text: z.string().min(1).max(MAX_RULE_LENGTH).optional(),
  })
  .refine((d) => d.enabled !== undefined || d.rule_text !== undefined, {
    message: "At least one field required",
  });

async function resolveSession(): Promise<{ tenantId: string } | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const service = createServiceClient();
  const { data } = await service
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data?.tenant_id) return null;
  return { tenantId: data.tenant_id };
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;
  if (parsed.data.rule_text !== undefined) updates.rule_text = parsed.data.rule_text;

  const service = createServiceClient();
  const { data, error } = await service
    .from("bot_rules")
    .update(updates)
    .eq("id", params.id)
    .eq("tenant_id", session.tenantId)
    .select("id, rule_text, category, enabled, created_at")
    .single();

  if (error) return NextResponse.json({ error: "Rule not found or update failed" }, { status: 404 });

  return NextResponse.json({ rule: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { error } = await service
    .from("bot_rules")
    .delete()
    .eq("id", params.id)
    .eq("tenant_id", session.tenantId);

  if (error) return NextResponse.json({ error: "Rule not found or delete failed" }, { status: 404 });

  return NextResponse.json({ success: true });
}
