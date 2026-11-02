import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "../../server/og";

// A page with its own openGraph metadata does not inherit the root image, so each one has its own.
export const alt = "Polityka prywatności - Gdzie Polecę";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOg("Polityka prywatności", "Jakie dane przetwarzamy");
}
