import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies Facebook's x-hub-signature-256 header.
 * @param payload  Raw request body as Buffer
 * @param signature  Value of x-hub-signature-256 header (e.g. "sha256=abc...")
 * @param appSecret  Facebook app secret
 */
export function verifyFacebookSignature(
  payload: Buffer,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature) return false;

  const [algo, hash] = signature.split("=");
  if (algo !== "sha256" || !hash) return false;

  const expected = createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Signs a PSID for use in action page URLs.
 * URL: /a/{slug}?psid={psid}&sig={sig}
 */
export function signPsid(psid: string, secret: string): string {
  return createHmac("sha256", secret).update(psid).digest("hex");
}

/**
 * Verifies the PSID signature from an action page URL.
 */
export function verifyActionPageSignature(
  psid: string,
  sig: string,
  secret: string
): boolean {
  const expected = signPsid(psid, secret);
  try {
    return timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}
