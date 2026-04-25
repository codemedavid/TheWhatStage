export type QueryTarget = "general" | "product" | "both";

const PRODUCT_KEYWORDS = [
  "price", "cost", "how much", "pricing", "deal", "discount",
  "product", "item", "catalog", "buy", "purchase", "order",
  "stock", "available", "inventory", "color", "size", "spec",
  "shipping", "deliver", "sell", "widget",
];

const GENERAL_KEYWORDS = [
  "hours", "hour", "open", "close", "location", "address", "where",
  "contact", "phone", "email", "support",
  "company", "who are", "what do you do",
  "policy", "refund", "return", "warranty", "warrant", "guarantee",
  "process", "how does", "how do",
  "faq", "question",
];

const VAGUE_BUYING_KEYWORDS = [
  "interested",
  "details",
  "detail",
  "pa info",
  "info",
  "hm",
  "available",
  "avail",
];

const GENERIC_AVAILABILITY_KEYWORDS = new Set(["available"]);

export function classifyQuery(query: string): QueryTarget {
  const lower = query.toLowerCase().trim();
  if (!lower) return "both";

  const productMatches = PRODUCT_KEYWORDS.filter((kw) => lower.includes(kw));
  const productScore = productMatches.length;
  const generalScore = GENERAL_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const vagueBuyingScore = VAGUE_BUYING_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const concreteProductScore = productMatches.filter(
    (kw) => !GENERIC_AVAILABILITY_KEYWORDS.has(kw)
  ).length;

  if (vagueBuyingScore > 0 && concreteProductScore === 0 && generalScore === 0) return "both";
  if (productScore > 0 && generalScore === 0) return "product";
  if (generalScore > 0 && productScore === 0) return "general";
  if (productScore > 0 && generalScore > 0) {
    return productScore >= generalScore ? "product" : "general";
  }

  return "both";
}
