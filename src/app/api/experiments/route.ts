import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  min_sample_size: z.number().int().min(10).max(10000).optional(),
  campaigns: z
    .array(
      z.object({
        campaign_id: z.string().uuid(),
        weight: z.number().int().min(1).max(100),
      })
    )
    .min(2)
    .max(4),
});

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };
  return { tenantId };
}

export async function GET() {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const service = createServiceClient();
  const { data: experiments, error } = await service
    .from("experiments")
    .select("*, experiment_campaigns(campaign_id, weight, campaigns(id, name, status))")
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch experiments" }, { status: 500 });
  }

  return NextResponse.json({ experiments: experiments ?? [] });
}

export async function POST(request: Request) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { data: experiment, error: expError } = await service
    .from("experiments")
    .insert({
      tenant_id: auth.tenantId,
      name: parsed.data.name,
      min_sample_size: parsed.data.min_sample_size ?? 50,
    })
    .select("*")
    .single();

  if (expError || !experiment) {
    return NextResponse.json({ error: "Failed to create experiment" }, { status: 500 });
  }

  const { error: joinError } = await service
    .from("experiment_campaigns")
    .insert(
      parsed.data.campaigns.map((c) => ({
        experiment_id: experiment.id,
        campaign_id: c.campaign_id,
        weight: c.weight,
      }))
    );

  if (joinError) {
    return NextResponse.json({ error: "Failed to add experiment campaigns" }, { status: 500 });
  }

  return NextResponse.json({ experiment }, { status: 201 });
}
