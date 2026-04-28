import { createServiceClient } from "@/lib/supabase/service";
import { chunkText, chunkFaqAtomic, type AtomicChunk, type FaqPair } from "@/lib/ai/chunking";
import { embedBatch } from "@/lib/ai/embedding";
import { extractPdfText } from "@/lib/ai/processors/pdf";
import { extractDocxText } from "@/lib/ai/processors/docx";
import { extractXlsxText } from "@/lib/ai/processors/xlsx";
import { detectLanguage } from "@/lib/ai/language-detect";

export interface IngestParams {
  docId: string;
  tenantId: string;
  type: "pdf" | "docx" | "xlsx" | "richtext" | "faq";
  kbType: "general" | "product";
  buffer: Buffer;
  docTitle: string;
  faqPairs?: FaqPair[];
}

export async function ingestDocument(params: IngestParams): Promise<void> {
  const { docId, tenantId, type, kbType, buffer, docTitle, faqPairs } = params;

  // Validate type before any DB operations
  const supportedTypes: IngestParams["type"][] = ["pdf", "docx", "xlsx", "richtext", "faq"];
  if (!supportedTypes.includes(type)) {
    throw new Error(`Unsupported document type: ${type}`);
  }

  const supabase = createServiceClient();

  try {
    let atomicChunks: AtomicChunk[];
    let docMetadata: Record<string, unknown> = { doc_title: docTitle };

    switch (type) {
      case "faq": {
        if (!faqPairs) throw new Error("faqPairs required for FAQ ingest");
        atomicChunks = chunkFaqAtomic(faqPairs);
        break;
      }
      case "pdf": {
        const result = await extractPdfText(buffer);
        atomicChunks = chunkText(result.text).map((content) => ({
          content,
          metadata: { chunk_kind: "doc" },
        }));
        docMetadata = { ...docMetadata, page_count: result.pageCount };
        break;
      }
      case "docx": {
        const text = await extractDocxText(buffer);
        atomicChunks = chunkText(text).map((content) => ({
          content,
          metadata: { chunk_kind: "doc" },
        }));
        break;
      }
      case "xlsx": {
        atomicChunks = extractXlsxText(buffer).map((content) => ({
          content,
          metadata: { chunk_kind: "row" },
        }));
        break;
      }
      case "richtext": {
        const text = buffer.toString("utf-8");
        atomicChunks = chunkText(text).map((content) => ({
          content,
          metadata: { chunk_kind: "doc" },
        }));
        break;
      }
    }

    if (atomicChunks!.length === 0) {
      await supabase.from("knowledge_docs").update({
        status: "ready",
        metadata: { ...docMetadata, warning: "no_chunks" },
      }).eq("id", docId);
      return;
    }

    const embeddings = await embedBatch(atomicChunks!.map((c) => c.content));

    const chunkRows = atomicChunks!.map((c, i) => ({
      doc_id: docId,
      tenant_id: tenantId,
      content: c.content,
      kb_type: kbType,
      embedding: embeddings[i] as any,
      language: detectLanguage(c.content) as any,
      metadata: {
        ...c.metadata,
        doc_title: docTitle,
        source_id: docId,
      },
    })) as any;

    const { error: insertError } = await supabase
      .from("knowledge_chunks")
      .insert(chunkRows);
    if (insertError) throw new Error(`Failed to store chunks: ${insertError.message}`);

    await supabase
      .from("knowledge_docs")
      .update({ status: "ready", metadata: docMetadata as unknown as Record<string, never> })
      .eq("id", docId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("knowledge_docs")
      .update({ status: "error", metadata: { error: message } as unknown as Record<string, never> })
      .eq("id", docId);
  }
}
