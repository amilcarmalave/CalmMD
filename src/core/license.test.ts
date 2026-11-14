import { describe, expect, it } from 'vitest';
import { maskKey, parseStoredLicense, readActivation, readValidation, shouldRevalidate, REVALIDATE_MS } from './license';

const any = { storeId: null, productId: null };
const ours = { storeId: 11, productId: 22 };
const ok = {
  activated: true,
  error: null,
  license_key: { status: 'active', activation_limit: 3, activation_usage: 1 },
  instance: { id: 'inst-1', name: 'Laptop' },
  meta: { store_id: 11, product_id: 22, customer_email: 'a@b.c', customer_name: 'Ada' },
};

describe('licence activation', () => {
  it('stores the licence from a successful activation', () => {
    const r = readActivation(ok, ' KEY-1 ', ours, 1000);
    expect(r).toEqual({
      ok: true,
      license: { key: 'KEY-1', instanceId: 'inst-1', email: 'a@b.c', name: 'Ada', productId: 22, activatedAt: 1000, validatedAt: 1000 },
    });
  });

  it('rejects keys for another product or store', () => {
    expect(readActivation({ ...ok, meta: { ...ok.meta, product_id: 99 } }, 'k', ours, 0)).toEqual({ ok: false, error: 'This key is for a different product.' });
    expect(readActivation(ok, 'k', any, 0).ok).toBe(true);
  });

  it('explains common errors', () => {
    const limit = readActivation({ activated: false, error: 'This license key has reached the activation limit.' }, 'k', any, 0);
    expect(limit.ok === false && limit.error).toMatch(/maximum number of devices/);
    const bad = readActivation({ activated: false, error: 'license_key not found.' }, 'k', any, 0);
    expect(bad.ok === false && bad.error).toMatch(/wasn’t recognised/);
    expect(readActivation(null, 'k', any, 0).ok).toBe(false);
  });
});

describe('licence validation', () => {
  it('reads valid, invalid and unknown replies', () => {
    expect(readValidation({ valid: true, meta: ok.meta }, ours)).toBe('valid');
    expect(readValidation({ valid: true, meta: { store_id: 1 } }, ours)).toBe('invalid');
    expect(readValidation({ valid: false, error: 'disabled' }, ours)).toBe('invalid');
    expect(readValidation({ message: 'Server error' }, ours)).toBe('unknown');
  });

  it('rechecks about monthly', () => {
    const l = { key: 'k', instanceId: 'i', email: null, name: null, productId: null, activatedAt: 0, validatedAt: 0 };
    expect(shouldRevalidate(l, REVALIDATE_MS - 1)).toBe(false);
    expect(shouldRevalidate(l, REVALIDATE_MS + 1)).toBe(true);
  });
});

describe('stored licence', () => {
  it('round-trips and rejects broken data', () => {
    const l = { key: 'k', instanceId: 'i', email: 'e', name: null, productId: 3, activatedAt: 1, validatedAt: 2 };
    expect(parseStoredLicense(JSON.stringify(l))).toEqual(l);
    expect(parseStoredLicense('{"key":"k"}')).toBeNull();
    expect(parseStoredLicense('nope')).toBeNull();
    expect(parseStoredLicense(null)).toBeNull();
  });
  it('masks keys', () => {
    expect(maskKey('ABCD-1234-EFGH-5678')).toBe('ABCD…5678');
    expect(maskKey('short')).toBe('••••');
  });
});
