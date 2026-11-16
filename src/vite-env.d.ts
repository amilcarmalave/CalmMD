/// <reference types="vite/client" />

/** package.json version, injected by vite.config.ts. */
declare const __APP_VERSION__: string;

declare module 'markdown-it-mark' {
  import type { PluginSimple } from 'markdown-it';
  const plugin: PluginSimple;
  export default plugin;
}
declare module 'markdown-it-sub' {
  import type { PluginSimple } from 'markdown-it';
  const plugin: PluginSimple;
  export default plugin;
}
declare module 'markdown-it-sup' {
  import type { PluginSimple } from 'markdown-it';
  const plugin: PluginSimple;
  export default plugin;
}

declare module 'katex/dist/katex.min.css?raw' {
  const source: string;
  export default source;
}

/** turndown-plugin-gfm ships without types. */
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export const gfm: TurndownService.Plugin;
}
