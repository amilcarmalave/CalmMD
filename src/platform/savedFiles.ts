import type { Platform } from './types';

/**
 * Calls `onCreated` once a file picked in a save dialog has been written (Save As, exports,
 * share bundles), so the Files sidebar can show it straight away. Other writes, like autosave,
 * don't trigger it.
 */
export function notifySavedFiles(platform: Platform, onCreated: (path: string) => void): Platform {
  const picked = new Set<string>();
  const written = <T>(path: string, result: T): T => {
    if (picked.delete(path)) onCreated(path);
    return result;
  };
  return Object.assign(Object.create(platform) as Platform, {
    saveFileDialog: async (...args: Parameters<Platform['saveFileDialog']>) => {
      const path = await platform.saveFileDialog(...args);
      if (path) picked.add(path);
      return path;
    },
    writeTextFile: async (path: string, text: string) => written(path, await platform.writeTextFile(path, text)),
    writeBinaryFile: async (path: string, data: Uint8Array) => written(path, await platform.writeBinaryFile(path, data)),
    printPdf: async (...args: Parameters<Platform['printPdf']>) => written(args[1], await platform.printPdf(...args)),
    takumiPdf: async (...args: Parameters<Platform['takumiPdf']>) => written(args[1], await platform.takumiPdf(...args)),
    pandocConvert: async (...args: Parameters<Platform['pandocConvert']>) => written(args[1], await platform.pandocConvert(...args)),
  });
}
