import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  verifyFacebookSignature,
  signPsid,
  verifyActionPageSignature,
} from "@/lib/fb/signature";

const APP_SECRET = "test-secret-abc123";

describe("verifyFacebookSignature", () => {
  it("returns true for a valid signature", () => {
    const payload = Buffer.from('{"test":"payload"}');
    const hash = createHmac("sha256", APP_SECRET).update(payload).digest("hex");
    expect(verifyFacebookSignature(payload, `sha256=${hash}`, APP_SECRET)).toBe(true);
  });

  it("returns false for a tampered payload", () => {
    const payload = Buffer.from('{"test":"payload"}');
    const hash = createHmac("sha256", APP_SECRET).update(payload).digest("hex");
    const tamperedPayload = Buffer.from('{"test":"tampered"}');
    expect(verifyFacebookSignature(tamperedPayload, `sha256=${hash}`, APP_SECRET)).toBe(false);
  });

  it("returns false when signature is null", () => {
    const payload = Buffer.from("{}");
    expect(verifyFacebookSignature(payload, null, APP_SECRET)).toBe(false);
  });

  it("returns false for wrong algorithm prefix", () => {
    const payload = Buffer.from("{}");
    const hash = createHmac("sha256", APP_SECRET).update(payload).digest("hex");
    expect(verifyFacebookSignature(payload, `sha1=${hash}`, APP_SECRET)).toBe(false);
  });
});

describe("signPsid / verifyActionPageSignature", () => {
  it("produces a verifiable signature", () => {
    const psid = "1234567890";
    const sig = signPsid(psid, APP_SECRET);
    expect(verifyActionPageSignature(psid, sig, APP_SECRET)).toBe(true);
  });

  it("fails for a different PSID", () => {
    const sig = signPsid("1234567890", APP_SECRET);
    expect(verifyActionPageSignature("9999999999", sig, APP_SECRET)).toBe(false);
  });
});
