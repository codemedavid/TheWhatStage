import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { deleteImage as deleteCloudinaryImage } from "@/lib/cloudinary";
import { embedText } from "@/lib/ai/embedding";
import { z } from "zod";

const updateSchema = z.object({
  description: z.string().min(1).max(500).optional(),
  tags: z.array(z.string().min(1)).min(1).optional(),
  context_hint: z.string().max(300).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  // 1. Authenticate
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  // 2. Parse and validate body
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;
  if (parsed.data.context_hint !== undefined) updates.context_hint = parsed.data.context_hint;

  // 3. Re-embed if description changed
  if (parsed.data.description !== undefined) {
    try {
      updates.embedding = await embedText(parsed.data.description);
    } catch {
      console.error("Failed to re-embed image description during update");
    }
  }

  // 4. Update in database (scoped to tenant)
  const service = createServiceClient();
  const { data: image, error: updateError } = await service
    .from("knowledge_images")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, url, description, tags, context_hint, created_at")
    .single();

  if (updateError || !image) {
    return NextResponse.json({ error: "Image not found or update failed" }, { status: 404 });
  }

  return NextResponse.json(image);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  // 1. Authenticate
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  // 2. Fetch the image to get the Cloudinary URL for cleanup
  const service = createServiceClient();
  const { data: image, error: fetchError } = await service
    .from("knowledge_images")
    .select("id, url")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchError || !image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // 3. Delete from database
  const { error: deleteError } = await service
    .from("knowledge_images")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (deleteError) {
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }

  // 4. Delete from Cloudinary (best-effort, don't fail if this errors)
  try {
    // Extract public ID from Cloudinary URL
    const urlParts = image.url.split("/upload/");
    if (urlParts[1]) {
      const publicId = urlParts[1].replace(/^v\d+\//, "").replace(/\.[^/.]+$/, "");
      await deleteCloudinaryImage(publicId);
    }
  } catch (err) {
    console.error("Failed to delete image from Cloudinary:", err);
  }

  return NextResponse.json({ deleted: true });
}
