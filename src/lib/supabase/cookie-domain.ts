function parseAppDomain() {
  const rawDomain = process.env.NEXT_PUBLIC_APP_DOMAIN?.trim();
  if (!rawDomain) return null;

  const hasProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(rawDomain);
  const candidate = hasProtocol ? rawDomain : `http://${rawDomain}`;

  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

export function getAppHostname(): string | null {
  const url = parseAppDomain();
  return url?.hostname.toLowerCase() ?? null;
}

export function getAppHost(): string | null {
  const url = parseAppDomain();
  return url?.host.toLowerCase() ?? null;
}

export function getAppProtocol(): "http" | "https" {
  const rawDomain = process.env.NEXT_PUBLIC_APP_DOMAIN?.trim();
  const url = parseAppDomain();

  if (!rawDomain) return "http";

  if (rawDomain && /^[a-z][a-z\d+\-.]*:\/\//i.test(rawDomain)) {
    return url?.protocol === "http:" ? "http" : "https";
  }

  const host = url?.host ?? "";
  return host.includes("localhost") || host.includes("lvh.me") ? "http" : "https";
}

/**
 * Returns the root domain with a leading dot so auth cookies
 * are shared across all tenant subdomains.
 *
 * e.g. "lvh.me:3000" -> ".lvh.me", "https://whatstage.com" -> ".whatstage.com"
 */
export function getCookieDomain(): string | undefined {
  const hostname = getAppHostname();
  if (!hostname) return undefined;

  const isIpAddress = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || isIpAddress) {
    return undefined;
  }

  return `.${hostname}`;
}
