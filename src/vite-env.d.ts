/// <reference types="vite/client" />

/** Injected by vite.config.ts define — package.json version. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** '1' points this dev run at the local emulators (npm run dev:emulator). */
  readonly VITE_EMULATORS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
