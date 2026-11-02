import type { Metadata } from "next";
import { socialMeta } from "../../lib/seo-meta";
import { EMAIL_PLACEHOLDER, LegalPage } from "../../components/site/LegalPage";

const TITLE = "Kontakt";
const DESCRIPTION =
  "Jak skontaktować się z zespołem Gdzie Polecę: uwagi, błędy w cenach i współpraca.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/kontakt" },
  ...socialMeta(TITLE, DESCRIPTION, "/kontakt"),
};

export default function ContactPage() {
  return (
    <LegalPage title="Kontakt">
      <p>
        Masz uwagę do serwisu, znalazłeś błąd w cenie albo chcesz o czymś zapytać? Napisz do nas:
      </p>
      <p className="text-lg font-semibold" data-testid="contact-email">
        {EMAIL_PLACEHOLDER}
      </p>
      <p>
        Opisz, na jakiej stronie to się stało, i podaj parametry wyszukiwania (najlepiej link do
        wyniku). Dzięki temu szybciej sprawdzimy sprawę.
      </p>
    </LegalPage>
  );
}
