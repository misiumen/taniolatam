"use client";

import { useId } from "react";
import {
  LAYOVER_RANGES,
  layoverLabel,
  toggleLayover,
  type LayoverRangeId,
} from "../lib/form-state";

interface Props {
  value: LayoverRangeId[];
  onChange: (next: LayoverRangeId[]) => void;
  /** Non-stop only: the ranges have nothing to filter. */
  disabled?: boolean;
}

const chipOn = "border-fg bg-fg text-bg";
const chipOff = "border-line bg-surface text-fg hover:border-line-strong";

/**
 * "Czas przesiadki": four range chips (multi-select, OR) of the estimated total layover per leg.
 * Nothing selected = any; direct flights always pass.
 */
export function LayoverField({ value, onChange, disabled }: Props) {
  const id = useId();
  return (
    <div data-testid="layover">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span id={`${id}-label`} className="text-[13px] font-medium text-fg">
          Czas przesiadki
        </span>
        <span
          className="min-w-0 truncate text-sm tabular-nums text-muted"
          aria-live="polite"
          data-testid="layover-label"
        >
          {disabled ? "tylko bezpośrednie" : layoverLabel(value)}
        </span>
      </div>
      <div role="group" aria-labelledby={`${id}-label`} className="grid grid-cols-4 gap-1">
        {LAYOVER_RANGES.map((r) => {
          const on = value.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange(toggleLayover(value, r.id))}
              className={`whitespace-nowrap rounded-md border px-1 py-1.5 text-[13px] tabular-nums disabled:cursor-not-allowed disabled:opacity-50 ${
                on ? chipOn : chipOff
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Szacowany; dokładny czas pokaże źródło na żywo. Loty bezpośrednie zawsze przechodzą.
      </p>
    </div>
  );
}
