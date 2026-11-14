import { describe, expect, it, vi } from 'vitest';
import { createMemoryPlatform } from '../platform/memory';
import { createPro } from './pro';
import { DEV_TEST_KEY } from './proConfig';

const setup = (platform = createMemoryPlatform()) => {
  const notify = vi.fn();
  return { platform, notify, pro: createPro({ platform, notify, instanceName: () => 'Test PC' }) };
};

describe('pro', () => {
  it('starts free and activates with a valid key', async () => {
    const { pro } = setup();
    await pro.load();
    expect(pro.isPro()).toBe(false);
    expect(await pro.activate(DEV_TEST_KEY)).toBeNull();
    expect(pro.isPro()).toBe(true);
    expect(pro.license()?.email).toBe('test@example.com');
  });

  it('explains a bad key and stays free', async () => {
    const { pro } = setup();
    expect(await pro.activate('WRONG')).toMatch(/wasn’t recognised/);
    expect(await pro.activate('   ')).toBe('Paste your licence key.');
    expect(pro.isPro()).toBe(false);
  });

  it('remembers the licence across restarts (works offline)', async () => {
    const { platform, pro } = setup();
    await pro.activate(DEV_TEST_KEY);
    const again = setup(platform).pro;
    await again.load();
    expect(again.isPro()).toBe(true);
  });

  it('stays Pro when the licence server is unreachable', async () => {
    const { platform, pro } = setup();
    await pro.activate(DEV_TEST_KEY);
    platform.licenseRequest = async () => {
      throw new Error('offline');
    };
    await pro.revalidate(true);
    expect(pro.isPro()).toBe(true);
  });

  it('turns Pro off when the provider says the licence is no longer valid', async () => {
    const { platform, pro, notify } = setup();
    await pro.activate(DEV_TEST_KEY);
    platform.licenseRequest = async () => ({ valid: false, error: 'This license key is disabled.' });
    await pro.revalidate(true);
    expect(pro.isPro()).toBe(false);
    expect(notify).toHaveBeenCalled();
  });

  it('deactivates this device', async () => {
    const { pro } = setup();
    await pro.activate(DEV_TEST_KEY);
    expect(await pro.deactivate()).toBeNull();
    expect(pro.isPro()).toBe(false);
  });
});
