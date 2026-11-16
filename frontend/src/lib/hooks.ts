"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./api";

/**
 * Memuat data dari API dan menyediakan state loading/error/reload.
 * `deps` menentukan kapan data dimuat ulang (dibandingkan sebagai JSON).
 */
export function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const key = JSON.stringify(deps);

  const load = useCallback(async () => {
    const id = ++seq.current;
    await Promise.resolve();
    if (id !== seq.current) return;
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (id === seq.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(errorMessage(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Sinkronisasi dengan sistem eksternal (API): memuat data saat deps berubah
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, key]);

  return { data, error, loading, reload: load, setData };
}
