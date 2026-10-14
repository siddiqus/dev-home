import { useCallback, useState } from "react";

/** A localStorage-backed string state limited to `allowed` values. */
export function useStoredState<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : initial;
  });
  const set = useCallback(
    (v: T) => {
      localStorage.setItem(key, v);
      setValue(v);
    },
    [key],
  );
  return [value, set] as const;
}
