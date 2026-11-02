import type { CarrierType } from "../../domain/offer.ts";

/**
 * Small, hand-kept IATA lists for `Offer.carrierType`. The Data API returns only the airline
 * code, so the type is our own classification. Unknown codes are "scheduled".
 */
export const LOWCOST_CARRIERS: ReadonlySet<string> = new Set([
  // Europe
  "FR", // Ryanair
  "RK", // Ryanair UK
  "AL", // Malta Air (Ryanair group)
  "W6", // Wizz Air
  "W4", // Wizz Air Malta
  "W9", // Wizz Air UK
  "5W", // Wizz Air Abu Dhabi
  "U2", // easyJet
  "EC", // easyJet Europe
  "DS", // easyJet Switzerland
  "VY", // Vueling
  "V7", // Volotea
  "PC", // Pegasus
  "TO", // Transavia France
  "HV", // Transavia
  "LS", // Jet2
  "EW", // Eurowings
  "DY", // Norwegian
  "D8", // Norwegian Air Sweden
  "BT", // airBaltic (hybrid; priced like a low-cost on most routes)
  "XQ", // SunExpress
  "VF", // AJet
  "FZ", // flydubai
  "G9", // Air Arabia
  "3O", // Air Arabia Maroc
  "J9", // Jazeera Airways
  "XY", // flynas
  // Asia / Pacific
  "AK", // AirAsia
  "D7", // AirAsia X
  "FD", // Thai AirAsia
  "TR", // Scoot
  "VJ", // VietJet
  "6E", // IndiGo
  "IX", // Air India Express
  "5J", // Cebu Pacific
  "JQ", // Jetstar
  "GK", // Jetstar Japan
  "MM", // Peach
  "7C", // Jeju Air
  "DD", // Nok Air
  "SL", // Thai Lion Air
  // Americas
  "NK", // Spirit
  "F9", // Frontier
  "G4", // Allegiant
  "WN", // Southwest
  "Y4", // Volaris
  "VB", // VivaAerobus
]);

export const CHARTER_CARRIERS: ReadonlySet<string> = new Set([
  "E4", // Enter Air
  "X3", // TUIfly
  "BY", // TUI Airways
  "OR", // TUI fly Netherlands
  "TB", // TUI fly Belgium
  "6B", // TUIfly Nordic
  "XR", // Corendon Airlines Europe
  "XC", // Corendon Airlines
  "DK", // Sunclass Airlines
]);

export function classifyCarrier(code: string | undefined): CarrierType {
  const c = code?.trim().toUpperCase() ?? "";
  if (LOWCOST_CARRIERS.has(c)) return "lowcost";
  if (CHARTER_CARRIERS.has(c)) return "charter";
  return "scheduled";
}
