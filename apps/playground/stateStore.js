export function createPlaygroundStateStore(storageKey) {
  return {
    load: () => {
      try {
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : undefined;
      } catch {
        return undefined;
      }
    },
    save: (state) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        // no-op
      }
    },
    clear: () => {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // no-op
      }
    },
  };
}
