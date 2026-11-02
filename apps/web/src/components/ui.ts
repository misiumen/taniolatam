/** Shared Tailwind class strings. */
export const inputCls =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-muted focus:border-accent disabled:opacity-50";

/** Field label inside a form section (sentence case, not shouting). */
export const labelCls = "mb-1.5 block text-[13px] font-medium text-fg";

export const btnPrimaryCls =
  "inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export const btnGhostCls =
  "inline-flex items-center justify-center rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg hover:bg-surface-2 disabled:opacity-50";

/** Toggle chip (date presets, sort, examples); pair with `chipOnCls` / `chipOffCls`. */
export const chipCls = "rounded-full border px-3 py-1 text-sm transition-colors";
export const chipOnCls = "border-fg bg-fg text-bg";
export const chipOffCls = "border-line bg-surface text-fg hover:border-line-strong";
