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

/** Accepted by the in-memory platform only (browser dev build and tests). */
export const DEV_TEST_KEY = 'CALMMD-TEST-PRO-KEY';
