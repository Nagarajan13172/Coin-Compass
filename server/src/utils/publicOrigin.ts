import type { Request } from "express";
import { env } from "../config/env";

function firstHeaderValue(value: string | undefined): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

function parseOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function publicAppOrigin(req?: Request): string {
  if (req) {
    const forwardedProto = firstHeaderValue(req.get("x-forwarded-proto") ?? undefined);
    const forwardedHost = firstHeaderValue(req.get("x-forwarded-host") ?? undefined);
    if (forwardedProto && forwardedHost) {
      return `${forwardedProto}://${forwardedHost}`;
    }

    const origin = parseOrigin(req.get("origin") ?? undefined);
    if (origin) return origin;

    const refererOrigin = parseOrigin(req.get("referer") ?? undefined);
    if (refererOrigin) return refererOrigin;

    const host = firstHeaderValue(req.get("host") ?? undefined);
    if (host) return `${req.protocol}://${host}`;
  }

  return parseOrigin(env.appUrl) ?? env.appUrl;
}