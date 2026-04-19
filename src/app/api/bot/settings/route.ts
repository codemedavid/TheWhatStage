import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const VALID_TIMEOUT_VALUES = [1, 6, 12, 24, 48];

const schema = z.object({
  handoff_timeout_hours: z
    .union([z.number().refine((v) => VALID_TIMEOUT_VALUES.includes(v)), z.null()])
    .optional(),
});

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { data: membership } = await service
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "No tenant membership" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.handoff_timeout_hours !== undefined) {
    updates.handoff_timeout_hours = parsed.data.handoff_timeout_hours;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await service
    .from("tenants")
    .update(updates)
    .eq("id", membership.tenant_id);

  if (error) {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
