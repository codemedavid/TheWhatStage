import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { uploadImage, validateImageFile, ValidationError } from "@/lib/cloudinary";
import { embedText } from "@/lib/ai/embedding";
import { z } from "zod";

const createSchema = z.object({
  description: z.string().min(1).max(500),
  tags: z.array(z.string().min(1)).min(1),
  context_hint: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  // 1. Authenticate
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  // 2. Parse form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const description = formData.get("description") as string | null;
  const tagsRaw = formData.get("tags") as string | null;
  const contextHint = formData.get("context_hint") as string | null;

  // Parse tags JSON
  let tags: unknown;
  try {
    tags = tagsRaw ? JSON.parse(tagsRaw) : undefined;
  } catch {
    return NextResponse.json({ error: "tags must be valid JSON array" }, { status: 400 });
  }

  const parsed = createSchema.safeParse({
    description,
    tags,
    context_hint: contextHint ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  // 3. Validate file type and size
  try {
    validateImageFile(file);
  } catch (err) {
    if (err instanceof ValidationError || (err instanceof Error && err.name === "ValidationError")) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
    throw err;
  }

  // 4. Upload to Cloudinary
  let uploadResult;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    uploadResult = await uploadImage(buffer, tenantId);
  } catch {
    return NextResponse.json(
      { error: "Image upload failed. Please try again." },
      { status: 502 }
    );
  }

  // 5. Embed description
  let embedding: number[];
  try {
    embedding = await embedText(parsed.data.description);
  } catch {
    // Upload succeeded but embedding failed — still save, just without embedding
    console.error("Failed to embed image description, saving without embedding");
    embedding = [];
  }

  // 6. Insert into database
  const service = createServiceClient();
  const insertData: Record<string, unknown> = {
    tenant_id: tenantId,
    url: uploadResult.url,
    description: parsed.data.description,
    tags: parsed.data.tags,
    context_hint: parsed.data.context_hint ?? null,
  };

  if (embedding.length > 0) {
    insertData.embedding = embedding;
  }

  const { data: image, error: insertError } = await service
    .from("knowledge_images")
    .insert(insertData)
    .select("id, tenant_id, url, description, tags, context_hint, created_at")
    .single();

  if (insertError || !image) {
    return NextResponse.json(
      { error: "Failed to save image record" },
      { status: 500 }
    );
  }

  return NextResponse.json(image, { status: 201 });
}

export async function GET(request: Request) {
  // 1. Authenticate
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  // 2. Fetch images
  const service = createServiceClient();
  const { data: images, error } = await service
    .from("knowledge_images")
    .select("id, url, description, tags, context_hint, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch images" }, { status: 500 });
  }

  return NextResponse.json({ images: images ?? [] });
}
