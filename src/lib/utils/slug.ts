const RESERVED_SLUGS = new Set(["www", "app", "api"]);

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export function validateSlug(slug: string): string | null {
  if (!slug) return "Slug is required";
  if (isReservedSlug(slug)) return "This subdomain is reserved";
  if (!/^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$/.test(slug))
    return "Slug must be 3–63 lowercase letters, numbers, or hyphens";
  return null;
}
