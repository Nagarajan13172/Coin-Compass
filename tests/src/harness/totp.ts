import { generate } from "otplib";

/** Produce a valid current TOTP code for a base32 secret (matches the server's otplib). */
export async function totpCode(secret: string): Promise<string> {
  return generate({ secret });
}
