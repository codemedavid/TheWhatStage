import { describe, it, expect } from "vitest";
import {
  parseSections,
  diffSections,
  hashContent,
  type ExistingDoc,
  type ParsedSection,
} from "@/lib/knowledge/section-diff";

describe("hashContent", () => {
  it("returns deterministic sha256 hex for identical input", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
    expect(hashContent("hello")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("differs when content differs", () => {
    expect(hashContent("a")).not.toBe(hashContent("b"));
  });
});

describe("parseSections", () => {
  it("splits markdown on ## headings", () => {
    const md = `## About\nHello\n\n## Pricing\nWe charge $10`;
    const sections = parseSections(md);
    expect(sections).toEqual([
      { title: "About", content: "Hello", order: 0 },
      { title: "Pricing", content: "We charge $10", order: 1 },
    ]);
  });

  it("trims title and content whitespace", () => {
    const md = `##   Spaced Title   \n\n  body line  \n`;
    expect(parseSections(md)).toEqual([
      { title: "Spaced Title", content: "body line", order: 0 },
    ]);
  });

  it("returns empty array for input with no headings", () => {
    expect(parseSections("just prose with no headings")).toEqual([]);
  });

  it("ignores leading content before the first heading", () => {
    const md = `prefix\n## First\nbody`;
    expect(parseSections(md)).toEqual([
      { title: "First", content: "body", order: 0 },
    ]);
  });

  it("treats H1 (#) and H3 (###) as part of section content", () => {
    const md = `## Section\n### Subheading\ntext`;
    expect(parseSections(md)).toEqual([
      { title: "Section", content: "### Subheading\ntext", order: 0 },
    ]);
  });

  it("throws on duplicate titles (case-insensitive, trimmed)", () => {
    const md = `## About\na\n## about\nb`;
    expect(() => parseSections(md)).toThrow(/duplicate/i);
  });
});

describe("diffSections", () => {
  const existing: ExistingDoc[] = [
    { id: "doc-a", title: "About", contentHash: hashContent("Hello") },
    { id: "doc-b", title: "Pricing", contentHash: hashContent("Old price") },
    { id: "doc-c", title: "Refunds", contentHash: hashContent("30 days") },
  ];

  it("classifies created/updated/deleted/unchanged correctly", () => {
    const incoming: ParsedSection[] = [
      { title: "About", content: "Hello", order: 0 },        // unchanged
      { title: "Pricing", content: "New price", order: 1 },  // updated
      { title: "Team", content: "We are 3", order: 2 },       // created
      // Refunds removed → deleted
    ];

    const result = diffSections(existing, incoming);

    expect(result.unchanged.map((s) => s.title)).toEqual(["About"]);
    expect(result.updated.map((s) => s.title)).toEqual(["Pricing"]);
    expect(result.created.map((s) => s.title)).toEqual(["Team"]);
    expect(result.deleted.map((d) => d.id)).toEqual(["doc-c"]);
  });

  it("matches titles case-insensitively and trims whitespace", () => {
    const incoming: ParsedSection[] = [
      { title: "  about ", content: "Hello", order: 0 },
    ];
    const result = diffSections(existing.slice(0, 1), incoming);
    expect(result.unchanged).toHaveLength(1);
    expect(result.created).toHaveLength(0);
  });

  it("returns empty arrays when nothing to do", () => {
    const result = diffSections([], []);
    expect(result).toEqual({
      created: [],
      updated: [],
      deleted: [],
      unchanged: [],
    });
  });
});
