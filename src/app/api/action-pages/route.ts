import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

const PAGE_TYPES = ["form", "calendar", "sales", "product_catalog", "checkout"] as const;

const createSchema = z.object({
  type: z.enum(PAGE_TYPES),
  title: z.string().min(1).max(200),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "untitled";
}

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const slug = `${slugify(parsed.data.title)}-${Date.now().toString(36)}`;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("action_pages")
    .insert({
      tenant_id: session.tenantId,
      type: parsed.data.type,
      title: parsed.data.title,
      slug,
      config: {},
      published: false,
    })
    .select("id, tenant_id, slug, type, title, config, published, version, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ actionPage: data }, { status: 201 });
}
