import { createHash } from "node:crypto";

/**
 * Deterministic ("canonical") JSON: object keys sorted recursively so the same
 * logical value always serializes to the same string. Without this, two equal
 * specs could hash differently just because of key order, and the chain would
 * be useless for verification.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** The tamper-evident hash binding an entry to its predecessor. */
export function entryHash(args: {
  seq: number;
  ts: string;
  prevHash: string;
  payloadCanonical: string;
}): string {
  return sha256(
    `${args.prevHash}|${args.seq}|${args.ts}|${args.payloadCanonical}`,
  );
}
