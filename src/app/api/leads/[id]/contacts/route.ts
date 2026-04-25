import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";

const createContactSchema = z
  .object({
    type: z.enum(["phone", "email"]),
    value: z.string().min(1).max(200),
    is_primary: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.value);
      if (data.type === "phone") return /^\+?[\d\s\-()]{7,20}$/.test(data.value);
      return true;
    },
    { message: "Invalid contact value for the given type" }
  );

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;
  const { id } = await context.params;
  const service = createServiceClient();

  const { data, error } = await service
    .from("lead_contacts")
    .select("*")
    .eq("lead_id", id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  return NextResponse.json({ contacts: data });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;
  const { id } = await context.params;
  const body = await request.json();
  const parsed = createContactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("lead_contacts")
    .insert({
      tenant_id: tenantId,
      lead_id: id,
      type: parsed.data.type,
      value: parsed.data.value,
      is_primary: parsed.data.is_primary ?? false,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  return NextResponse.json({ contact: data }, { status: 201 });
}
