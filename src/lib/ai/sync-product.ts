import { createServiceClient } from "@/lib/supabase/service";
import { embedText } from "@/lib/ai/embedding";
import { serializeProduct, type ProductInput } from "@/lib/ai/processors/product";

interface SyncParams {
  tenantId: string;
  productId: string;
  product: ProductInput | null;
}

export async function syncProductChunk(params: SyncParams): Promise<void> {
  const { tenantId, productId, product } = params;
  const supabase = createServiceClient();

  if (!product) {
    await supabase
      .from("knowledge_docs")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("metadata->>product_id", productId);
    return;
  }

  const text = serializeProduct(product);
  const embedding = await embedText(text);

  const { data: doc, error: docError } = await supabase
    .from("knowledge_docs")
    .insert({
      tenant_id: tenantId,
      title: product.name,
      type: "product",
      content: text,
      status: "ready",
      metadata: { product_id: productId },
    })
    .select("id")
    .single();

  if (docError || !doc) return;

  await supabase.from("knowledge_chunks").upsert({
    doc_id: doc.id,
    tenant_id: tenantId,
    content: text,
    kb_type: "product",
    embedding,
    metadata: { product_id: productId },
  });
}
