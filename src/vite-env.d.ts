/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_PORT: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  const __APP_VERSION__: string;

  interface Window {
    electronAPI?: {
      findInPage: (text: string, forward: boolean, findNext: boolean) => Promise<void>;
      stopFindInPage: () => Promise<void>;
      onToggleFind: (callback: () => void) => () => void;
      onFindResult: (
        callback: (result: { activeMatchOrdinal: number; matches: number }) => void,
      ) => () => void;
    };
  }
}

export {};
