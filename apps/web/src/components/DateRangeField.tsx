"use client";

import { useMemo } from "react";
import {
  addMonthsIso,
  applyDatePreset,
  DATE_PRESETS,
  matchPreset,
  SLIDER_MONTHS,
  sliderDates,
  sliderPositions,
  todayIso,
  type FormState,
} from "../lib/form-state";
import { formatMonthYear } from "../lib/format";
import { DualRange } from "./DualRange";
import { chipCls, chipOffCls, chipOnCls, inputCls, labelCls } from "./ui";

interface Props {
  state: FormState;
  onChange: (next: FormState) => void;
}

/** "Kiedy (wylot)": preset chips, a month-range slider and, on demand, two exact date inputs. */
export function DateRangeField({ state, onChange }: Props) {
  const today = useMemo(() => todayIso(), []);
  const exact = state.datePreset === "exact";
  const [lo, hi] = sliderPositions(state.departFrom, state.departTo, today);
  const monthAt = (n: number) => formatMonthYear(addMonthsIso(today, n));

  const moveSlider = (nextLo: number, nextHi: number) => {
    const dates = sliderDates(nextLo, nextHi, today);
    onChange({
      ...state,
      ...dates,
      datePreset: matchPreset(dates.departFrom, dates.departTo, today),
    });
  };

  return (
    <fieldset>
      <legend className={labelCls}>Kiedy (wylot)</legend>
      <div role="group" aria-label="Zakres dat wylotu" className="flex flex-wrap gap-1.5">
        {DATE_PRESETS.map((p) => {
          const on = state.datePreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(applyDatePreset(state, p.id, today))}
              className={`${chipCls} ${on ? chipOnCls : chipOffCls}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {exact ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="date"
            suppressHydrationWarning
            aria-label="Wylot od"
            className={inputCls}
            value={state.departFrom}
            onChange={(e) => onChange({ ...state, departFrom: e.target.value })}
          />
          <input
            type="date"
            suppressHydrationWarning
            aria-label="Wylot do"
            className={inputCls}
            value={state.departTo}
            onChange={(e) => onChange({ ...state, departTo: e.target.value })}
          />
        </div>
      ) : (
        <div className="mt-3" data-testid="month-slider">
          <DualRange
            min={0}
            max={SLIDER_MONTHS}
            step={1}
            lo={lo}
            hi={hi}
            onChange={moveSlider}
            loLabel="Początek zakresu dat (miesiące od dziś)"
            hiLabel="Koniec zakresu dat (miesiące od dziś)"
            valueText={monthAt}
          />
          <p
            className="mt-1 text-center text-sm text-muted"
            data-testid="month-slider-label"
            aria-live="polite"
            suppressHydrationWarning
          >
            {monthAt(lo)} - {monthAt(hi)}
          </p>
        </div>
      )}
    </fieldset>
  );
}
