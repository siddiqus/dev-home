/** Test stand-in for vite-plugin-pwa's `virtual:pwa-register/react` (aliased in vitest.config.ts). */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async () => {},
  };
}
