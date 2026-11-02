"use client";

import { useId, useState } from "react";
import {
  DAY_MINUTES,
  DAY_PERIODS,
  formatClock,
  setExactTime,
  TIME_STEP,
  timeChoiceLabel,
  togglePeriod,
  type TimeChoice,
} from "../lib/form-state";
import { inputCls, labelCls } from "./ui";

interface Props {
  /** "Godzina wylotu" / "Godzina przylotu". */
  label: string;
  value: TimeChoice;
  onChange: (next: TimeChoice) => void;
  testId: string;
}

const STEPS = Array.from({ length: DAY_MINUTES / TIME_STEP + 1 }, (_, i) => i * TIME_STEP);
const FROM_OPTIONS = STEPS.slice(0, -1); // 00:00 … 23:30
const TO_OPTIONS = STEPS.slice(1); // 00:30 … 24:00

const periodOn = "border-fg bg-fg text-bg";
const periodOff = "border-line bg-surface text-fg hover:border-line-strong";

/**
 * Departure or arrival time: four period chips (multi-select; every click, plain or with
 * Ctrl/Cmd, toggles just that chip) and, behind "Dokładny zakres", two selects. The chips and
 * the exact range exclude each other; nothing chosen = "dowolnie".
 */
export function TimeRangeField({ label, value, onChange, testId }: Props) {
  const id = useId();
  const [showExact, setShowExact] = useState(value.exact !== undefined);
  const from = value.exact?.from ?? 0;
  const to = value.exact?.to ?? DAY_MINUTES;
  return (
    <div data-testid={testId}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span id={`${id}-label`} className="text-[13px] font-medium text-fg">
          {label}
        </span>
        <span
          className="min-w-0 truncate text-sm tabular-nums text-muted"
          aria-live="polite"
          data-testid={`${testId}-label`}
        >
          {timeChoiceLabel(value)}
        </span>
      </div>
      {/* Content-sized chips that share the spare width: "Popołudnie" never gets cut. */}
      <div role="group" aria-labelledby={`${id}-label`} className="flex gap-1">
        {DAY_PERIODS.map((p) => {
          const on = value.periods.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              title={`${formatClock(p.window.from)}-${formatClock(p.window.to)}`}
              onClick={() => onChange(togglePeriod(value, p.id))}
              className={`flex flex-auto flex-col items-center rounded-md border px-1.5 py-1 leading-tight ${
                on ? periodOn : periodOff
              }`}
            >
              <span className="whitespace-nowrap text-[13px]">{p.label}</span>
              <span
                aria-hidden
                className={`text-[11px] tabular-nums ${on ? "opacity-75" : "text-muted"}`}
              >
                {p.hours}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-expanded={showExact}
        aria-controls={`${id}-exact`}
        onClick={() => setShowExact((s) => !s)}
        className="mt-1.5 text-[13px] text-accent underline-offset-2 hover:underline"
      >
        Dokładny zakres
      </button>
      <div id={`${id}-exact`} hidden={!showExact} className="mt-1.5">
        <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2">
          <label htmlFor={`${id}-from`} className={`${labelCls} mb-0 text-muted`}>
            od
          </label>
          <select
            id={`${id}-from`}
            aria-label={`${label} od`}
            className={`${inputCls} tabular-nums`}
            value={from}
            onChange={(e) => onChange(setExactTime({ from: Number(e.target.value), to }))}
          >
            {FROM_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {formatClock(m)}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-to`} className={`${labelCls} mb-0 text-muted`}>
            do
          </label>
          <select
            id={`${id}-to`}
            aria-label={`${label} do`}
            className={`${inputCls} tabular-nums`}
            value={to}
            onChange={(e) => onChange(setExactTime({ from, to: Number(e.target.value) }))}
          >
            {TO_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {formatClock(m)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
