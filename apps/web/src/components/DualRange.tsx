"use client";

interface Props {
  min: number;
  max: number;
  step: number;
  lo: number;
  hi: number;
  /** Called with the new handles, already kept at least one `step` apart. */
  onChange: (lo: number, hi: number) => void;
  loLabel: string;
  hiLabel: string;
  /** Spoken value of a handle (`aria-valuetext`). */
  valueText: (n: number) => string;
}

/**
 * Two stacked `input type=range` forming one dual-handle slider (no library, keyboard works:
 * arrows move one step, Home/End jump to the ends). Styled by `.dual-range` in globals.css.
 */
export function DualRange({
  min,
  max,
  step,
  lo,
  hi,
  onChange,
  loLabel,
  hiLabel,
  valueText,
}: Props) {
  const pct = (n: number) => (n - min) / (max - min);
  // Keep the fill under the thumb centres (native thumbs are inset by half their width).
  const edge = (n: number) => `calc(0.5rem + (100% - 1rem) * ${pct(n)})`;
  return (
    <div className="relative h-6">
      <div className="absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" />
      <div
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
        style={{ left: edge(lo), right: `calc(100% - ${edge(hi)})` }}
      />
      <input
        type="range"
        className="dual-range"
        min={min}
        max={max}
        step={step}
        value={lo}
        aria-label={loLabel}
        aria-valuetext={valueText(lo)}
        onChange={(e) => onChange(Math.min(e.target.valueAsNumber, hi - step), hi)}
      />
      <input
        type="range"
        className="dual-range"
        min={min}
        max={max}
        step={step}
        value={hi}
        aria-label={hiLabel}
        aria-valuetext={valueText(hi)}
        onChange={(e) => onChange(lo, Math.max(e.target.valueAsNumber, lo + step))}
      />
    </div>
  );
}
