import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "../server/og";

export const alt = "Gdzie Polecę - najtańsze loty z mapą";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOg(
    "Najtańsze kierunki z polskich lotnisk",
    "Na liście i na mapie, z ceną i wiekiem ceny",
  );
}
