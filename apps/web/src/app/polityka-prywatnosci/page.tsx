import type { Metadata } from "next";
import { socialMeta } from "../../lib/seo-meta";
import { EMAIL_PLACEHOLDER, LegalPage } from "../../components/site/LegalPage";

const TITLE = "Polityka prywatności";
const DESCRIPTION =
  "Jakie dane przetwarza Gdzie Polecę, z jakich usług zewnętrznych korzysta strona i jak działają linki partnerskie.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/polityka-prywatnosci" },
  ...socialMeta(TITLE, DESCRIPTION, "/polityka-prywatnosci"),
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Polityka prywatności" updated="2 listopada 2026">
      <p>
        Gdzie Polecę to bezpłatna wyszukiwarka tanich lotów z polskich lotnisk. Poniżej opisujemy,
        jakie dane przetwarza serwis i z jakich usług zewnętrznych korzysta. Kontakt w sprawach
        prywatności: {EMAIL_PLACEHOLDER}.
      </p>

      <h2>Jakie dane zbieramy</h2>
      <ul>
        <li>
          Nie wymagamy konta ani logowania i nie prosimy o imię, nazwisko, adres e-mail czy numer
          telefonu.
        </li>
        <li>
          Parametry wyszukiwania (skąd, dokąd, daty, filtry) są wysyłane do naszego serwera, żeby
          zwrócić wyniki. Są też zapisane w adresie strony, dzięki czemu wyszukiwanie można
          udostępnić linkiem. Nie łączymy ich z konkretną osobą.
        </li>
        <li>
          Serwer i dostawca hostingu (Render) mogą zapisywać techniczne logi żądań, na przykład
          adres IP, czas i adres odwiedzonej strony. Służą do zapewnienia bezpieczeństwa i działania
          serwisu.
        </li>
      </ul>

      <h2>Pliki cookie</h2>
      <p>
        Dziś strona nie ustawia własnych plików cookie i nie korzysta z narzędzi analitycznych ani
        reklamowych. Jeśli w przyszłości dodamy cokolwiek poza technicznie niezbędnymi plikami
        cookie, zaktualizujemy tę politykę i poprosimy o zgodę.
      </p>

      <h2>Usługi zewnętrzne</h2>
      <ul>
        <li>
          Czcionki ładowane są z Google Fonts. Twoja przeglądarka łączy się wtedy z serwerami
          Google, które widzą adres IP.
        </li>
        <li>
          Mapa na stronie wyszukiwania pobiera kafelki z serwera OpenFreeMap (adres IP jest widoczny
          dla tego serwera).
        </li>
        <li>
          Linki &bdquo;Sprawdź cenę&rdquo; prowadzą do Google Flights, Skyscannera, Kiwi.com i
          Aviasales. Po kliknięciu opuszczasz nasz serwis i obowiązują zasady prywatności tych
          serwisów, które mogą ustawiać własne pliki cookie.
        </li>
      </ul>

      <h2>Linki partnerskie</h2>
      <p>
        Część linków do wyszukiwarek ofert to linki partnerskie. Jeśli kupisz bilet po kliknięciu
        takiego linku, serwis partnerski może wypłacić nam prowizję. Prowizja nie zmienia ceny,
        którą płacisz. Link przekazuje partnerowi identyfikator, po którym rozpoznaje, że przejście
        pochodzi od nas.
      </p>

      <h2>Twoje prawa</h2>
      <p>
        Masz prawo do dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania i
        sprzeciwu, a także do wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych. Ponieważ
        nie prowadzimy kont użytkowników, zwykle nie jesteśmy w stanie powiązać danych z konkretną
        osobą. Napisz do nas: {EMAIL_PLACEHOLDER}.
      </p>

      <h2>Zmiany</h2>
      <p>
        Gdy zmieni się sposób działania serwisu, zaktualizujemy tę stronę i datę na jej początku.
      </p>
    </LegalPage>
  );
}
