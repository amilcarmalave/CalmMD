/**
 * CalmMD Pro licences: reading the payment provider's replies (Lemon Squeezy's licence API) and
 * deciding what to store. Pure, so it's tested without a network.
 *
 * Flow: the user pastes a key → "activate" registers this device (the provider enforces the
 * activation limit) → we store the licence locally, so Pro works offline from then on → about
 * monthly, when online, "validate" checks it wasn't refunded or disabled. Network failures never
 * take Pro away.
 */
export interface StoredLicense {
  key: string;
  instanceId: string;
  email: string | null;
  name: string | null;
  productId: number | null;
  activatedAt: number;
  validatedAt: number;
}

export interface ProductCheck {
  /** Accept only keys for this store and product (null = not configured yet: accept any). */
  storeId: number | null;
  productId: number | null;
}

export type ActivationResult = { ok: true; license: StoredLicense } | { ok: false; error: string };

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const asNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const asStr = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** Friendlier wording for the provider's usual errors. */
export function licenseError(raw: string | null): string {
  const e = (raw ?? '').toLowerCase();
  if (e.includes('activation limit')) return 'This key is already active on the maximum number of devices. Deactivate it on one of them first.';
  if (e.includes('not found') || e.includes('invalid')) return 'That key wasn’t recognised. Check it was copied completely.';
  if (e.includes('expired')) return 'This key has expired.';
  if (e.includes('disabled')) return 'This key has been disabled.';
  return raw || 'The key couldn’t be activated.';
}

function matchesProduct(meta: Record<string, unknown>, check: ProductCheck): boolean {
  if (check.storeId !== null && asNum(meta.store_id) !== check.storeId) return false;
  if (check.productId !== null && asNum(meta.product_id) !== check.productId) return false;
  return true;
}

/** Reads an "activate" reply. */
export function readActivation(reply: unknown, key: string, check: ProductCheck, now: number): ActivationResult {
  const r = asObj(reply);
  const meta = asObj(r.meta);
  const instance = asObj(r.instance);
  if (r.activated !== true) return { ok: false, error: licenseError(asStr(r.error)) };
  if (!matchesProduct(meta, check)) return { ok: false, error: 'This key is for a different product.' };
  const instanceId = asStr(instance.id);
  if (!instanceId) return { ok: false, error: 'The licence server sent an incomplete reply. Try again.' };
  return {
    ok: true,
    license: {
      key: key.trim(),
      instanceId,
      email: asStr(meta.customer_email),
      name: asStr(meta.customer_name),
      productId: asNum(meta.product_id),
      activatedAt: now,
      validatedAt: now,
    },
  };
}

/** Reads a "validate" reply: 'valid', 'invalid' (refunded, disabled, deactivated) or 'unknown'. */
export function readValidation(reply: unknown, check: ProductCheck): 'valid' | 'invalid' | 'unknown' {
  const r = asObj(reply);
  if (r.valid === true) return matchesProduct(asObj(r.meta), check) ? 'valid' : 'invalid';
  if (r.valid === false) return 'invalid';
  return 'unknown';
}

export const REVALIDATE_MS = 30 * 24 * 3600 * 1000;
export const shouldRevalidate = (l: StoredLicense, now: number) => now - l.validatedAt > REVALIDATE_MS;

/** A stored licence from kv, or null if missing or malformed. */
export function parseStoredLicense(raw: string | null): StoredLicense | null {
  if (!raw) return null;
  try {
    const v = asObj(JSON.parse(raw));
    const key = asStr(v.key);
    const instanceId = asStr(v.instanceId);
    if (!key || !instanceId) return null;
    return {
      key,
      instanceId,
      email: asStr(v.email),
      name: asStr(v.name),
      productId: asNum(v.productId),
      activatedAt: asNum(v.activatedAt) ?? 0,
      validatedAt: asNum(v.validatedAt) ?? 0,
    };
  } catch {
    return null;
  }
}

/** "ABCD-…-WXYZ": enough to recognise a key without showing it. */
export const maskKey = (key: string) => (key.length <= 8 ? '••••' : `${key.slice(0, 4)}…${key.slice(-4)}`);
