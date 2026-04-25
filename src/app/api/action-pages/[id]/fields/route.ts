import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

const FIELD_TYPES = ["text", "email", "phone", "textarea", "select", "number", "radio", "checkbox"] as const;

const fieldSchema = z.object({
  label: z.string().min(1).max(200),
  field_key: z.string().min(1).max(100),
  field_type: z.enum(FIELD_TYPES),
  placeholder: z.string().max(200).optional(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  order_index: z.number().int().min(0),
  lead_mapping: z
    .union([
      z.object({ target: z.literal("lead_contact"), type: z.enum(["email", "phone"]) }),
      z.object({ target: z.literal("lead_knowledge"), key: z.string().min(1) }),
    ])
    .nullable()
    .optional(),
});

const putSchema = z.object({
  fields: z.array(fieldSchema),
});

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("action_page_fields")
    .select("*")
    .eq("tenant_id", session.tenantId)
    .eq("action_page_id", id)
    .order("order_index", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ fields: data });
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();
  const parsed = putSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Delete existing fields
  await supabase
    .from("action_page_fields")
    .delete()
    .eq("tenant_id", session.tenantId)
    .eq("action_page_id", id);

  if (parsed.data.fields.length === 0) {
    return NextResponse.json({ fields: [] });
  }

  // Insert new fields
  const rows = parsed.data.fields.map((f) => ({
    tenant_id: session.tenantId,
    action_page_id: id,
    label: f.label,
    field_key: f.field_key,
    field_type: f.field_type,
    placeholder: f.placeholder ?? null,
    required: f.required,
    options: f.options ?? null,
    order_index: f.order_index,
    lead_mapping: f.lead_mapping ?? null,
  }));

  const { data, error } = await supabase
    .from("action_page_fields")
    .insert(rows)
    .select("*");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ fields: data });
}
