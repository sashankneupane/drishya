export interface PersistenceScheduler {
  schedule: () => void;
  flush: () => void;
  cancel: () => void;
}

export function createPersistenceScheduler(
  runNow: () => void,
  delayMs: number
): PersistenceScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        runNow();
      }, delayMs);
    },
    flush: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      runNow();
    },
    cancel: () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    },
  };
}

