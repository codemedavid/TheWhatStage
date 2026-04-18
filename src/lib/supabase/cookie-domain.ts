/**
 * Returns the root domain with a leading dot so auth cookies
 * are shared across all tenant subdomains.
 *
 * e.g. "lvh.me:3000" → ".lvh.me", "whatstage.com" → ".whatstage.com"
 */
export function getCookieDomain(): string | undefined {
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "";
  const hostname = appDomain.split(":")[0];
  if (!hostname) return undefined;
  return `.${hostname}`;
}
