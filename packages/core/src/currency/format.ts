/** Thousands separator: narrow no-break space (U+202F). */
const NNBSP = " ";

/**
 * Formats a PLN amount for the UI: `1 890 zł` (integers have no decimals), `1 890,50 zł`
 * otherwise. Amounts are rounded to grosze first.
 */
export function formatPln(amount: number): string {
  if (!Number.isFinite(amount)) return "– zł";
  const cents = Math.round(Math.abs(amount) * 100);
  const sign = cents > 0 && amount < 0 ? "-" : "";
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  const int = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  const decimals = frac === 0 ? "" : `,${String(frac).padStart(2, "0")}`;
  return `${sign}${int}${decimals} zł`;
}
