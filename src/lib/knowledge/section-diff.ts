import { createHash } from "crypto";

export interface ParsedSection {
  title: string;
  content: string;
  order: number;
}

export interface ExistingDoc {
  id: string;
  title: string;
  contentHash: string | null;
}

export interface DiffResult {
  created: ParsedSection[];
  updated: Array<ParsedSection & { id: string }>;
  deleted: ExistingDoc[];
  unchanged: Array<ParsedSection & { id: string }>;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const HEADING_RE = /^##[ \t]+(.+?)\s*$/;

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function parseSections(markdown: string): ParsedSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let current: { title: string; bodyLines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(HEADING_RE);
    if (match) {
      if (current) {
        sections.push({
          title: current.title,
          content: current.bodyLines.join("\n").trim(),
          order: sections.length,
        });
      }
      current = { title: match[1].trim(), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }

  if (current) {
    sections.push({
      title: current.title,
      content: current.bodyLines.join("\n").trim(),
      order: sections.length,
    });
  }

  const seen = new Set<string>();
  for (const s of sections) {
    const key = normalizeTitle(s.title);
    if (seen.has(key)) {
      throw new Error(`Duplicate section title: "${s.title}"`);
    }
    seen.add(key);
  }

  return sections;
}

export function diffSections(
  existing: ExistingDoc[],
  incoming: ParsedSection[]
): DiffResult {
  const existingByTitle = new Map<string, ExistingDoc>();
  for (const doc of existing) {
    existingByTitle.set(normalizeTitle(doc.title), doc);
  }

  const created: ParsedSection[] = [];
  const updated: Array<ParsedSection & { id: string }> = [];
  const unchanged: Array<ParsedSection & { id: string }> = [];
  const incomingTitles = new Set<string>();

  for (const section of incoming) {
    const normalized = { ...section, title: section.title.trim() };
    const key = normalizeTitle(normalized.title);
    incomingTitles.add(key);

    const match = existingByTitle.get(key);
    if (!match) {
      created.push(normalized);
      continue;
    }

    const incomingHash = hashContent(normalized.content);
    if (incomingHash === match.contentHash) {
      unchanged.push({ ...normalized, id: match.id });
    } else {
      updated.push({ ...normalized, id: match.id });
    }
  }

  const deleted = existing.filter(
    (doc) => !incomingTitles.has(normalizeTitle(doc.title))
  );

  return { created, updated, deleted, unchanged };
}
