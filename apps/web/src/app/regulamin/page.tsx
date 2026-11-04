import type { Metadata } from "next";
import { socialMeta } from "../../lib/seo-meta";
import { CONTACT_EMAIL, LegalPage } from "../../components/site/LegalPage";

const TITLE = "Regulamin";
const DESCRIPTION =
  "Zasady korzystania z serwisu Gdzie Polecę: charakter informacji o cenach, linki partnerskie i odpowiedzialność.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/regulamin" },
  ...socialMeta(TITLE, DESCRIPTION, "/regulamin"),
};

export default function TermsPage() {
  return (
    <LegalPage title="Regulamin" updated="2 listopada 2026">
      <h2>1. Czym jest serwis</h2>
      <p>
        Gdzie Polecę to bezpłatna wyszukiwarka informacyjna, która pokazuje najtańsze kierunki lotów
        z polskich lotnisk. Serwis nie jest linią lotniczą ani biurem podróży, nie sprzedaje biletów
        i nie przyjmuje rezerwacji ani płatności.
      </p>

      <h2>2. Charakter cen</h2>
      <ul>
        <li>
          Ceny pochodzą z wyszukiwań użytkowników Aviasales z ostatnich 7 dni. Nie są cenami na żywo
          z systemów rezerwacyjnych.
        </li>
        <li>
          Przy cenie pokazujemy jej wiek. Cena mogła się zmienić, a oferta zniknąć. Informacje w
          serwisie mają charakter orientacyjny i nie stanowią oferty handlowej.
        </li>
        <li>
          Wiążącą cenę i warunki (bagaż, opłaty, zmiany) podaje sprzedawca biletu. Przed zakupem
          sprawdź ją w Google Flights, Skyscannerze, Kiwi.com lub Aviasales.
        </li>
      </ul>

      <h2>3. Linki partnerskie</h2>
      <p>
        Część linków prowadzących do serwisów trzecich to linki partnerskie. Gdy kupisz bilet po
        kliknięciu takiego linku, możemy otrzymać prowizję od serwisu partnerskiego. Prowizja nie
        zmienia ceny, którą płacisz, i nie wpływa na kolejność wyników, która zależy od ceny.
      </p>

      <h2>4. Korzystanie z serwisu</h2>
      <ul>
        <li>Z serwisu można korzystać bez rejestracji i bez opłat.</li>
        <li>
          Nie wolno utrudniać działania serwisu ani pobierać z niego danych masowo i automatycznie.
        </li>
        <li>Treści i układ serwisu podlegają ochronie prawnej.</li>
      </ul>

      <h2>5. Odpowiedzialność</h2>
      <p>
        Serwis udostępniamy w stanie, w jakim jest, i dokładamy starań, by dane były rzetelne, ale
        nie gwarantujemy ich kompletności ani aktualności. Nie odpowiadamy za decyzje zakupowe
        podjęte na podstawie wyświetlonych cen ani za działanie serwisów trzecich, do których
        prowadzą linki. Przepisy, których nie można wyłączyć umownie, pozostają w mocy.
      </p>

      <h2>6. Reklamacje i kontakt</h2>
      <p>
        Uwagi i reklamacje dotyczące działania serwisu przyjmujemy pod adresem {CONTACT_EMAIL}.
        Odpowiadamy możliwie szybko.
      </p>

      <h2>7. Zmiany regulaminu</h2>
      <p>
        Możemy zmieniać regulamin, gdy zmieni się sposób działania serwisu. Aktualna wersja jest
        zawsze na tej stronie, z datą ostatniej aktualizacji. Obowiązuje prawo polskie.
      </p>
    </LegalPage>
  );
}
