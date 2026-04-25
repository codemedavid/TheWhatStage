import { signPsid } from "@/lib/fb/signature";

export interface ActionPageUrlParams {
  tenantSlug: string;
  actionPageSlug: string;
  psid: string;
  appSecret: string;
  appDomain: string;
  protocol: "http" | "https";
}

export function buildActionPageUrl(params: ActionPageUrlParams): string {
  const { tenantSlug, actionPageSlug, psid, appSecret, appDomain, protocol } = params;
  const sig = signPsid(psid, appSecret);
  return `${protocol}://${tenantSlug}.${appDomain}/a/${actionPageSlug}?psid=${encodeURIComponent(psid)}&sig=${sig}`;
}
