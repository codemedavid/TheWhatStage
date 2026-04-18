import { createServiceClient } from "@/lib/supabase/service";
import { chunkText } from "@/lib/ai/chunking";
import { embedBatch } from "@/lib/ai/embedding";
import { extractPdfText } from "@/lib/ai/processors/pdf";
import { extractDocxText } from "@/lib/ai/processors/docx";
import { extractXlsxText } from "@/lib/ai/processors/xlsx";

export interface IngestParams {
  docId: string;
  tenantId: string;
  type: "pdf" | "docx" | "xlsx";
  kbType: "general" | "product";
  buffer: Buffer;
}

export async function ingestDocument(params: IngestParams): Promise<void> {
  const { docId, tenantId, type, kbType, buffer } = params;

  // Validate type before any DB operations
  const supportedTypes: IngestParams["type"][] = ["pdf", "docx", "xlsx"];
  if (!supportedTypes.includes(type)) {
    throw new Error(`Unsupported document type: ${type}`);
  }

  const supabase = createServiceClient();

  try {
    let texts: string[];
    let docMetadata: Record<string, unknown> = {};

    switch (type) {
      case "pdf": {
        const result = await extractPdfText(buffer);
        texts = chunkText(result.text);
        docMetadata = { page_count: result.pageCount };
        break;
      }
      case "docx": {
        const text = await extractDocxText(buffer);
        texts = chunkText(text);
        break;
      }
      case "xlsx": {
        texts = extractXlsxText(buffer);
        break;
      }
    }

    const embeddings = await embedBatch(texts!);

    const chunkRows = texts!.map((content, i) => ({
      doc_id: docId,
      tenant_id: tenantId,
      content,
      kb_type: kbType,
      embedding: embeddings[i],
      metadata: {},
    }));

    const { error: insertError } = await supabase
      .from("knowledge_chunks")
      .insert(chunkRows);

    if (insertError) {
      throw new Error(`Failed to store chunks: ${insertError.message}`);
    }

    await supabase
      .from("knowledge_docs")
      .update({ status: "ready", metadata: docMetadata })
      .eq("id", docId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await supabase
      .from("knowledge_docs")
      .update({ status: "error", metadata: { error: message } })
      .eq("id", docId);
  }
}
