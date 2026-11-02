"use client";

import type { TimeWindow } from "../lib/api-extensions";
import { DAY_MINUTES, formatClock, TIME_STEP, timeWindowLabel } from "../lib/form-state";
import { DualRange } from "./DualRange";
import { labelCls } from "./ui";

interface Props {
  /** "Godzina wylotu" / "Godzina przylotu". */
  label: string;
  /** Lower-case noun for the handle labels: "wylotu" / "przylotu". */
  noun: string;
  value: TimeWindow;
  onChange: (next: TimeWindow) => void;
  testId: string;
}

/** Hour window with two handles, 00:00 … 24:00 in 30-minute steps; the full day = "dowolnie". */
export function TimeRangeField({ label, noun, value, onChange, testId }: Props) {
  return (
    <div data-testid={testId}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className={`${labelCls} mb-0`}>{label}</span>
        <span
          className="text-sm tabular-nums text-muted"
          aria-live="polite"
          data-testid={`${testId}-label`}
        >
          {timeWindowLabel(value)}
        </span>
      </div>
      <DualRange
        min={0}
        max={DAY_MINUTES}
        step={TIME_STEP}
        lo={value.from}
        hi={value.to}
        onChange={(from, to) => onChange({ from, to })}
        loLabel={`Najwcześniejsza godzina ${noun}`}
        hiLabel={`Najpóźniejsza godzina ${noun}`}
        valueText={formatClock}
      />
    </div>
  );
}
