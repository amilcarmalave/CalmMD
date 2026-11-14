import { createSignal } from 'solid-js';
import { parseStoredLicense, readActivation, readValidation, shouldRevalidate, type StoredLicense } from '../core/license';
import type { Platform } from '../platform/types';
import { PRO_CONFIG } from './proConfig';

/**
 * Supporter extras ("Pro" in the code): one switch (`isPro`) for every extra, and the key that turns it on.
 * Rule: everything needed to write, organise and share is free; the extras are polish,
 * extra looks and advanced export. Gate a feature with `requirePro(id)` at the point of use.
 */
/** `soon`: listed in the Pro dialog as coming, not yet built. Clear it when the feature ships. */
export const PRO_FEATURES: Record<string, { title: string; detail: string; soon?: boolean }> = {
  customColors: { title: 'Any colour', detail: 'Pick any highlight or text colour, beyond the 12 included.' },
  pdfCover: { title: 'PDF cover page', detail: 'A title page with subtitle, author and date before your document.' },
  pdfTemplates: { title: 'PDF templates', detail: 'Report, Academic and Minimal page designs for exported PDFs.' },
  premiumThemes: { title: 'Extra themes', detail: 'Five more colour themes: Rosé, Parchment, Fjord, Nightshade and Forest.' },
  shareBundles: { title: 'Share bundles', detail: 'Share a document with its images as one file or a .zip.' },
  fileHistory: { title: 'File history', detail: 'Earlier versions of each file, saved when you close it or when you ask. Compare and restore.' },
};
export type ProFeature = 'customColors' | 'pdfCover' | 'pdfTemplates' | 'premiumThemes' | 'shareBundles' | 'fileHistory';

const KEY = 'license';
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type Pro = ReturnType<typeof createPro>;

export function createPro(deps: { platform: Platform; notify: (msg: string) => void; instanceName: () => string }) {
  const { platform } = deps;
  const [license, setLicense] = createSignal<StoredLicense | null>(null);
  const check = { storeId: PRO_CONFIG.storeId, productId: PRO_CONFIG.productId };

  const save = async (l: StoredLicense | null) => {
    setLicense(l);
    if (l) await platform.kvSet(KEY, JSON.stringify(l));
    else await platform.kvDelete(KEY);
    platform.broadcast('license');
  };

  async function load() {
    setLicense(parseStoredLicense(await platform.kvGet(KEY).catch(() => null)));
    void revalidate();
  }
  platform.onBroadcast('license', () => void platform.kvGet(KEY).then((raw) => setLicense(parseStoredLicense(raw))));

  /** About monthly, in the background. Only a definite "invalid" (refund, disabled) turns Pro off. */
  async function revalidate(force = false) {
    const l = license();
    if (!l || (!force && !shouldRevalidate(l, Date.now()))) return;
    let reply: unknown;
    try {
      reply = await platform.licenseRequest('validate', [
        ['license_key', l.key],
        ['instance_id', l.instanceId],
      ]);
    } catch {
      return; // offline: keep Pro
    }
    const v = readValidation(reply, check);
    if (v === 'valid') await save({ ...l, validatedAt: Date.now() });
    else if (v === 'invalid') {
      await save(null);
      deps.notify('Your Supporter key is no longer active on this device.');
    }
  }

  /** Activates a key on this device. Resolves to an error message, or null on success. */
  async function activate(rawKey: string): Promise<string | null> {
    const key = rawKey.trim();
    if (!key) return 'Paste your licence key.';
    let reply: unknown;
    try {
      reply = await platform.licenseRequest('activate', [
        ['license_key', key],
        ['instance_name', deps.instanceName()],
      ]);
    } catch (e) {
      return errText(e) || 'Couldn’t reach the licence server. Check your connection and try again.';
    }
    const r = readActivation(reply, key, check, Date.now());
    if (!r.ok) return r.error;
    await save(r.license);
    return null;
  }

  /** Frees this device's activation (so the key can be used elsewhere), then turns Pro off here. */
  async function deactivate(): Promise<string | null> {
    const l = license();
    if (!l) return null;
    try {
      await platform.licenseRequest('deactivate', [
        ['license_key', l.key],
        ['instance_id', l.instanceId],
      ]);
    } catch (e) {
      return `Couldn’t reach the licence server, so this device is still counted: ${errText(e)}`;
    }
    await save(null);
    return null;
  }

  return { license, isPro: () => !!license(), load, activate, deactivate, revalidate };
}
