import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedPhaseTemplates } from "@/lib/ai/phase-templates";
import { z } from "zod";

const seedSchema = z.object({
  business_type: z.enum(["ecommerce", "real_estate", "digital_product", "services"]),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = seedSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await seedPhaseTemplates(tenantId, parsed.data.business_type);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to seed phases";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
