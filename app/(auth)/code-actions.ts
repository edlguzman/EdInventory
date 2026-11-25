"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CodeError = "wrongCode" | "rateLimit" | "unavailable" | "unknown";
export type CodeResult = { ok: true } | { ok: false; error: CodeError };
export type CodeSetup = { ok: true; factorId: string; qr: string; secret: string; uri: string } | { ok: false; error: CodeError };

const codeSchema = z.string().regex(/^\d{6}$/);

function codeError(error: { code?: string; status?: number }): CodeError {
  switch (error.code) {
    case "mfa_verification_failed":
    case "mfa_verification_rejected":
    case "mfa_challenge_expired":
      return "wrongCode";
    case "mfa_totp_enroll_not_enabled":
    case "mfa_totp_verify_not_enabled":
      return "unavailable";
  }
  if (error.status === 429) return "rateLimit";
  console.error("sign-in code failed", { code: error.code, status: error.status });
  return "unknown";
}

const totpFactors = async (status: "verified" | "unverified") =>
  ((await getUser())?.factors ?? []).filter((f) => f.factor_type === "totp" && f.status === status);

/** The code of any of the account's apps (normally one). On success this session becomes aal2. */
async function enterCode(code: string): Promise<CodeResult> {
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) return { ok: false, error: "wrongCode" };
  const supabase = await createClient();
  let result: CodeResult = { ok: false, error: "unknown" };
  for (const factor of await totpFactors("verified")) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data });
    if (!error) return { ok: true };
    result = { ok: false, error: codeError(error) };
    if (result.error !== "wrongCode") break;
  }
  return result;
}

/** The second step of signing in (and of setting a new password). */
export async function verifyCode(code: string): Promise<CodeResult> {
  const result = await enterCode(code);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Turning the code on, step 1: the QR code and the key. Nothing is on until a code is confirmed. */
export async function startCode(): Promise<CodeSetup> {
  const user = await getUser();
  if (!user || (await totpFactors("verified")).length > 0) return { ok: false, error: "unknown" };
  const supabase = await createClient();
  // Earlier unfinished attempts.
  for (const f of await totpFactors("unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Inventory", friendlyName: "Inventory" });
  if (error) return { ok: false, error: codeError(error) };
  // As base64: a raw SVG in a data URI breaks at "#".
  const svg = data.totp.qr_code.slice(data.totp.qr_code.indexOf("<"));
  return {
    ok: true,
    factorId: data.id,
    qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/** Step 2: the first code turns it on. Supabase then ends the account's sessions on other devices. */
export async function confirmCode(factorId: string, code: string): Promise<CodeResult> {
  const id = z.uuid().safeParse(factorId);
  const parsed = codeSchema.safeParse(code);
  if (!id.success || !parsed.success) return { ok: false, error: "wrongCode" };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id.data, code: parsed.data });
  if (error) return { ok: false, error: codeError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Turning it off: only with a code. */
export async function disableCode(code: string): Promise<CodeResult> {
  const result = await enterCode(code);
  if (!result.ok) return result;
  const supabase = await createClient();
  for (const f of await totpFactors("verified")) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return { ok: false, error: codeError(error) };
  }
  // A token without the second step; the old one is refused by the database anyway.
  await supabase.auth.refreshSession();
  revalidatePath("/", "layout");
  return { ok: true };
}
