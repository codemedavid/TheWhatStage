import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { isReservedSlug } from "@/lib/utils/slug";
import { getDefaultFunnelConfig } from "@/lib/onboarding/defaults";
import type { BusinessType, BotGoal } from "@/lib/onboarding/types";
import type { Json } from "@/types/database";

const schema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$/),
  businessType: z.enum(["ecommerce", "real_estate", "digital_product", "services"]),
  botGoal: z.enum(["qualify_leads", "sell", "understand_intent", "collect_lead_info"]),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional().default(""),
  botTone: z.enum(["friendly", "professional", "casual"]).default("friendly"),
  botRules: z.array(z.string().max(500)).max(10).default([]),
  customInstruction: z.string().max(1000).optional().default(""),
  actionTypes: z
    .array(z.enum(["form", "calendar", "sales", "product_catalog"]))
    .default([]),
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

  const {
    name,
    slug,
    businessType,
    botGoal,
    firstName,
    lastName,
    botTone,
    botRules,
    customInstruction,
    actionTypes,
  } = parsed.data;

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
  // RPC returns table(id, slug) → Supabase client returns an array
  const { data: rows, error } = await service.rpc("create_tenant_with_owner", {
    p_name: name,
    p_slug: slug,
    p_business_type: businessType,
    p_bot_goal: botGoal,
    p_user_id: user.id,
  });

  if (error || !rows || (Array.isArray(rows) && rows.length === 0)) {
    console.error("Tenant creation error:", error);
    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  }

  const tenant = Array.isArray(rows) ? rows[0] : rows;
  const tenantId = tenant.id;

  // 6. Post-creation setup (non-blocking failures — workspace is already created)
  try {
    // Update user metadata with name
    await service.auth.admin.updateUserById(user.id, {
      user_metadata: { first_name: firstName, last_name: lastName },
      app_metadata: { tenant_id: tenantId },
    });
  } catch (e) {
    console.error("Failed to update user metadata:", e);
  }

  // Insert bot rules
  if (botRules.length > 0) {
    const ruleRows: {
      tenant_id: string;
      rule_text: string;
      category: "tone" | "boundary" | "behavior";
      enabled: boolean;
    }[] = botRules.map((rule) => ({
      tenant_id: tenantId,
      rule_text: rule,
      category: "behavior" as const,
      enabled: true,
    }));

    // Add tone rule
    ruleRows.push({
      tenant_id: tenantId,
      rule_text: `Respond in a ${botTone} tone`,
      category: "tone",
      enabled: true,
    });

    // Add custom instruction as a rule
    if (customInstruction) {
      ruleRows.push({
        tenant_id: tenantId,
        rule_text: customInstruction,
        category: "behavior",
        enabled: true,
      });
    }

    const { error: rulesErr } = await service.from("bot_rules").insert(ruleRows);
    if (rulesErr) console.error("Failed to insert bot rules:", rulesErr);
  }

  // Insert greeting bot flow
  const funnelConfig = getDefaultFunnelConfig(
    businessType as BusinessType,
    botGoal as BotGoal
  );
  const { error: flowErr } = await service.from("bot_flows").insert({
    tenant_id: tenantId,
    trigger: "greeting",
    config: funnelConfig as unknown as Json,
    enabled: true,
  });
  if (flowErr) console.error("Failed to insert bot flow:", flowErr);

  // Create placeholder action pages
  if (actionTypes.length > 0) {
    const actionPageTitles: Record<string, string> = {
      form: "Lead Capture Form",
      calendar: "Book an Appointment",
      sales: "Sales Page",
      product_catalog: "Product Catalog",
    };

    const actionPageRows = actionTypes.map((type) => ({
      tenant_id: tenantId,
      slug: type.replace(/_/g, "-"),
      type: type,
      title: actionPageTitles[type] ?? type,
      config: {} as Json,
      published: false,
    }));

    const { error: pagesErr } = await service.from("action_pages").insert(actionPageRows);
    if (pagesErr) console.error("Failed to insert action pages:", pagesErr);
  }

  return NextResponse.json({ tenantId, slug: tenant.slug }, { status: 201 });
}
