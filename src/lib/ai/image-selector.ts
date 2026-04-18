import { createServiceClient } from "@/lib/supabase/service";
import { embedText } from "@/lib/ai/embedding";
import type { ChunkResult } from "@/lib/ai/vector-search";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImageSelectionContext {
  tenantId: string;
  leadMessage: string;
  currentPhaseName: string;
  retrievedChunks: ChunkResult[];
  maxImages: number;
}

export interface SelectedImage {
  id: string;
  url: string;
  description: string;
  contextHint: string | null;
  similarity: number;
}

// ---------------------------------------------------------------------------
// Stopwords — common English words to filter from keyword extraction
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "about", "up",
  "what", "which", "who", "whom", "this", "that", "these", "those",
  "am", "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves", "he", "him", "his",
  "himself", "she", "her", "hers", "herself", "it", "its", "itself",
  "they", "them", "their", "theirs", "themselves", "show", "please",
  "tell", "give", "get", "let", "make", "know", "think", "want", "like",
]);

// ---------------------------------------------------------------------------
// Tag extraction
// ---------------------------------------------------------------------------

interface TagExtractionInput {
  currentPhaseName: string;
  leadMessage: string;
  retrievedChunks: ChunkResult[];
}

/**
 * Extract search tags from the current context.
 * Returns a deduplicated, lowercased array of meaningful keywords.
 */
export function extractSearchTags(input: TagExtractionInput): string[] {
  const tags = new Set<string>();

  // Phase name
  const phaseName = input.currentPhaseName.trim().toLowerCase();
  if (phaseName.length > 0) {
    tags.add(phaseName);
  }

  // Keywords from lead message
  const words = input.leadMessage
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  for (const word of words) {
    tags.add(word);
  }

  // Tags from chunk metadata
  for (const chunk of input.retrievedChunks) {
    const imageTags = chunk.metadata?.image_tags;
    if (Array.isArray(imageTags)) {
      for (const tag of imageTags) {
        if (typeof tag === "string" && tag.length > 0) {
          tags.add(tag.toLowerCase());
        }
      }
    }
  }

  return [...tags];
}

// ---------------------------------------------------------------------------
// Main selector
// ---------------------------------------------------------------------------

/**
 * Select relevant images for a conversation turn using hybrid
 * tag-filter + semantic re-rank.
 *
 * Returns up to `maxImages` images, sorted by semantic similarity.
 * Returns empty array on any failure (graceful degradation).
 */
export async function selectImages(
  ctx: ImageSelectionContext
): Promise<SelectedImage[]> {
  const searchTags = extractSearchTags({
    currentPhaseName: ctx.currentPhaseName,
    leadMessage: ctx.leadMessage,
    retrievedChunks: ctx.retrievedChunks,
  });

  // No meaningful tags → no images
  if (searchTags.length === 0) return [];

  const supabase = createServiceClient();

  // Step 1: Tag filter — find candidate images with overlapping tags
  const { data: candidates, error: tagError } = await supabase
    .from("knowledge_images")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .overlaps("tags", searchTags);

  if (tagError || !candidates || candidates.length === 0) return [];

  // Step 2: Semantic re-rank
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(ctx.leadMessage);
  } catch (err) {
    console.error("Image selector: embedding failed, skipping images", err);
    return [];
  }

  const candidateIds = candidates.map((c) => c.id);

  const { data: ranked, error: rpcError } = await supabase.rpc(
    "match_knowledge_images",
    {
      query_embedding: queryEmbedding,
      p_tenant_id: ctx.tenantId,
      p_candidate_ids: candidateIds,
      p_top_k: ctx.maxImages,
      p_similarity_threshold: 0.3,
    }
  );

  if (rpcError || !ranked) return [];

  return ranked.map((row) => ({
    id: row.id,
    url: row.url,
    description: row.description,
    contextHint: row.context_hint,
    similarity: row.similarity,
  }));
}
