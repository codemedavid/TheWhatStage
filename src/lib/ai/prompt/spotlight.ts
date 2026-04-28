export type UntrustedSource =
  | "messenger_lead"
  | "tenant_kb"
  | "tenant_config"
  | "form_submission";

const CLOSE_TAG_RE = /<\s*\/\s*untrusted\s*>/gi;

export function wrapUntrusted(source: UntrustedSource, content: string): string {
  const safe = content.replace(CLOSE_TAG_RE, "[REDACTED_TAG]");
  return `<untrusted source="${source}">\n${safe}\n</untrusted>`;
}
