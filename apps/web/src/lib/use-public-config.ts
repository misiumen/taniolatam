"use client";

import { useEffect, useState } from "react";
import type { PublicConfig } from "./public-config";

let cached: PublicConfig | undefined;
let pending: Promise<PublicConfig | undefined> | undefined;

/** Fetches `/api/v1/config` once per page and shares it between components. */
export function loadPublicConfig(): Promise<PublicConfig | undefined> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = fetch("/api/v1/config")
      .then((r) => (r.ok ? (r.json() as Promise<PublicConfig>) : undefined))
      .then((c) => {
        cached = c;
        return c;
      })
      .catch(() => undefined);
  }
  return pending;
}

/** Public affiliate identifiers for outbound links; `{}` until the config has loaded. */
export function useAffiliateEnv(): Record<string, string | undefined> {
  const [env, setEnv] = useState<Record<string, string | undefined>>(cached?.affiliates ?? {});
  useEffect(() => {
    let alive = true;
    void loadPublicConfig().then((c) => {
      if (alive && c?.affiliates) setEnv(c.affiliates);
    });
    return () => {
      alive = false;
    };
  }, []);
  return env;
}
