import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const MAX_RULES = 20;
const MAX_RULE_LENGTH = 500;

const CATEGORY_MAP: Record<string, string> = {
  instruction: "behavior",
  restriction: "boundary",
  persona: "tone",
};

const createSchema = z.object({
  rule_text: z.string().min(1).max(MAX_RULE_LENGTH),
  category: z.enum(["instruction", "restriction", "persona"]),
});

async function resolveSession(): Promise<{ userId: string; tenantId: string } | null> {
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
  return { userId: user.id, tenantId: data.tenant_id };
}

export async function GET() {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("bot_rules")
    .select("id, rule_text, category, enabled, created_at")
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 });

  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();

  const { count } = await service
    .from("bot_rules")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", session.tenantId);

  if ((count ?? 0) >= MAX_RULES) {
    return NextResponse.json({ error: `Maximum of ${MAX_RULES} rules allowed` }, { status: 422 });
  }

  const dbCategory = CATEGORY_MAP[parsed.data.category];
  const { data, error } = await service
    .from("bot_rules")
    .insert({ tenant_id: session.tenantId, rule_text: parsed.data.rule_text, category: dbCategory })
    .select("id, rule_text, category, enabled, created_at")
    .single();

  if (error) return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });

  return NextResponse.json({ rule: data }, { status: 201 });
}
