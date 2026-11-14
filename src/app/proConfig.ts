/**
 * Where CalmMD Pro is sold. These are public values (a checkout link and numeric ids), never API keys.
 *
 * While `buyUrl` is null, the Supporter dialog says supporting opens soon. Activation still works with a
 * real key, and the browser dev build accepts the test key below.
 */
export const PRO_CONFIG = {
  price: '$6',
  /** Lemon Squeezy checkout URL for the Pro product, e.g. https://<store>.lemonsqueezy.com/buy/<id>. */
  buyUrl: null as string | null,
  /** Only keys for this store and product are accepted (null = any, until configured). */
  storeId: null as number | null,
  productId: null as number | null,
};

/**
 * Accepted by the browser dev build and tests, and by desktop builds made with
 * VITE_SUPPORTER_TEST=1 (local testing only; release builds never set it).
 */
export const DEV_TEST_KEY = 'CALMMD-TEST-PRO-KEY';

/** What the licence server would answer for the test key (one device slot, "dev-instance"). */
export function testLicenseReply(action: 'activate' | 'validate' | 'deactivate', params: [string, string][]): unknown {
  const p = Object.fromEntries(params);
  const valid = p.license_key === DEV_TEST_KEY;
  const meta = { store_id: PRO_CONFIG.storeId ?? 1, product_id: PRO_CONFIG.productId ?? 1, customer_email: 'test@example.com', customer_name: 'Test User' };
  if (action === 'activate') return valid ? { activated: true, error: null, instance: { id: 'dev-instance' }, meta } : { activated: false, error: 'license_key not found.' };
  if (action === 'validate') return valid ? { valid: true, error: null, meta } : { valid: false, error: 'license_key not found.' };
  return { deactivated: valid, error: valid ? null : 'license_key not found.' };
}
