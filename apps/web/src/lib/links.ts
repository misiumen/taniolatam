import { allLinks, googleFlightsLink, type Offer } from "@gdziepolece/core";

export interface VerifyLink {
  id: string;
  label: string;
  href: string;
  /** Set for open-jaw offers: which leg the link prices ("wylot" / "powrót" suffix of its label). */
  leg?: "out" | "back";
}

/**
 * Outbound verification links (Google Flights, Skyscanner, Kiwi, Aviasales and the source's own
 * link) from the shared builders in `@gdziepolece/core`. We never call these sites, only link.
 *
 * Runs in the browser, so only public env is available: the Aviasales/Kiwi affiliate markers
 * (server-side `TRAVELPAYOUTS_MARKER`, `KIWI_AFFILIATE_ID`) are not applied here; links that
 * come from the Travelpayouts adapter (`offer.deepLink`) already carry the marker.
 */
export function verifyLinks(offer: Offer): VerifyLink[] {
  return allLinks(offer, {}).map((l) => {
    const leg = l.label.endsWith("(wylot)")
      ? "out"
      : l.label.endsWith("(powrót)")
        ? "back"
        : undefined;
    return {
      id: l.id,
      // "Sprawdź w Google Flights (wylot)" → "Google Flights": the row is already headed
      // "Sprawdź cenę" and, for open-jaw, sits under its leg.
      label: l.label.replace(/^Sprawdź w /, "").replace(/ \((wylot|powrót)\)$/, ""),
      href: l.url,
      ...(leg ? { leg } : {}),
    };
  });
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

export interface OpenJawLeg {
  kind: "out" | "back";
  origin: string;
  destination: string;
  /** ISO date (`YYYY-MM-DD`). */
  date: string;
  carrier?: string;
  /** Source id that priced this leg, when it differs per leg. */
  source?: string;
  /** Per-leg booking link, when the leg is booked separately. */
  deepLink?: string;
}

/**
 * The two legs of an open-jaw offer (return lands at, or leaves from, another airport than the
 * outbound), or undefined for an ordinary round trip / one-way. Prefers `offer.legs`, falling
 * back to `returnTo` + the offer's own dates.
 */
export function openJawLegs(offer: Offer): [OpenJawLeg, OpenJawLeg] | undefined {
  const [first, second] = offer.legs ?? [];
  if (first && second && offer.returnDate) {
    if (first.origin === second.destination && first.destination === second.origin) {
      return undefined;
    }
    const day = (iso: string, fallback: string) =>
      /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : fallback;
    return [
      {
        kind: "out",
        origin: first.origin,
        destination: first.destination,
        date: day(first.departAt, offer.departDate),
        carrier: first.carrier,
        source: first.source,
        deepLink: first.deepLink,
      },
      {
        kind: "back",
        origin: second.origin,
        destination: second.destination,
        date: day(second.departAt, offer.returnDate ?? offer.departDate),
        carrier: second.carrier,
        source: second.source,
        deepLink: second.deepLink,
      },
    ];
  }
  if (offer.returnTo && offer.returnTo !== offer.origin && offer.returnDate) {
    return [
      { kind: "out", origin: offer.origin, destination: offer.destination, date: offer.departDate },
      {
        kind: "back",
        origin: offer.destination,
        destination: offer.returnTo,
        date: offer.returnDate,
      },
    ];
  }
  return undefined;
}
