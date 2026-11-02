import { allLinks, googleFlightsLink, type Offer } from "@taniolatam/core";

export interface VerifyLink {
  id: string;
  label: string;
  href: string;
}

/**
 * Outbound verification links (Google Flights, Skyscanner, Kiwi, Aviasales and the source's own
 * link) from the shared builders in `@taniolatam/core`. We never call these sites, only link.
 *
 * Runs in the browser, so only public env is available: the Aviasales/Kiwi affiliate markers
 * (server-side `TRAVELPAYOUTS_MARKER`, `KIWI_AFFILIATE_ID`) are not applied here; links that
 * come from the Travelpayouts adapter (`offer.deepLink`) already carry the marker.
 */
export function verifyLinks(offer: Offer): VerifyLink[] {
  return allLinks(offer, {}).map((l) => ({
    id: l.id,
    // "Sprawdź w Google Flights" → "Google Flights": the row is already headed "Sprawdź cenę".
    label: l.label.replace(/^Sprawdź w /, ""),
    href: l.url,
  }));
}

/** Google Flights link for one calendar day; undefined when the codes/dates are malformed. */
export function dayLink(
  p: Pick<Offer, "origin" | "destination" | "departDate" | "returnDate" | "currency">,
): string | undefined {
  try {
    return googleFlightsLink(p);
  } catch {
    return undefined;
  }
}
