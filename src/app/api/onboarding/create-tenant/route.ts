import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { isReservedSlug } from "@/lib/utils/slug";

const schema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$/),
  businessType: z.enum(["ecommerce", "real_estate", "digital_product", "services"]),
  botGoal: z.enum(["qualify_leads", "sell", "understand_intent", "collect_lead_info"]),
});

export async function POST(request: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate input
  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, slug, businessType, botGoal } = parsed.data;

  // 3. Check reserved slugs
  if (isReservedSlug(slug)) {
    return NextResponse.json(
      { error: "This subdomain is reserved" },
      { status: 403 }
    );
  }

  const service = createServiceClient();

  // 4. Check tenant limit (1 tenant per user)
  const { data: existingMembership } = await service
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (existingMembership) {
    return NextResponse.json(
      { error: "You already own a workspace" },
      { status: 409 }
    );
  }

  // 5. Create tenant + owner atomically via RPC
  const { data, error } = await service.rpc("create_tenant_with_owner", {
    p_name: name,
    p_slug: slug,
    p_business_type: businessType,
    p_bot_goal: botGoal,
    p_user_id: user.id,
  });

  if (error) {
    console.error("Tenant creation error:", error);
    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  }

  return NextResponse.json({ tenantId: data.id, slug: data.slug }, { status: 201 });
}
