import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ContactPage, { metadata as contactMeta } from "./kontakt/page";
import HomePage, { metadata as homeMeta } from "./page";
import PrivacyPage, { metadata as privacyMeta } from "./polityka-prywatnosci/page";
import TermsPage, { metadata as termsMeta } from "./regulamin/page";
import { metadata as searchMeta } from "./szukaj/page";

const FORBIDDEN = /[…—–]/;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("home page", () => {
  const out = html(<HomePage />);

  it("has the promise as H1, a button into /szukaj and six example links", () => {
    expect(out).toMatch(
      /<h1[^>]*>Najtańsze kierunki z polskich lotnisk, na liście i na mapie<\/h1>/,
    );
    expect(out).toContain('href="/szukaj"');
    const examples = out.split('data-testid="home-examples"')[1]!.split("</ul>")[0]!;
    expect(examples.match(/href="\/szukaj\?/g)).toHaveLength(6);
  });

  it("has the three sections, twelve popular destinations and the footer links", () => {
    expect(out).toContain('id="jak-to-dziala"');
    expect(out).toContain('id="skad-ceny"');
    expect(out).toContain("Czartery i pakiety wakacyjne: wkrótce");
    const popular = out.split('data-testid="popular-destinations"')[1]!.split("</ul>")[0]!;
    expect(popular.match(/href="\/loty\/do\//g)).toHaveLength(12);
    for (const href of ["/polityka-prywatnosci", "/regulamin", "/kontakt"]) {
      expect(out).toContain(`href="${href}"`);
    }
  });

  it("describes a WebSite with a SearchAction", () => {
    expect(out).toContain('"@type":"WebSite"');
    expect(out).toContain('"@type":"SearchAction"');
  });
});

describe("copy style", () => {
  it("uses no ellipsis, em dash or en dash in the visible text or metadata", () => {
    const pages = [
      <HomePage key="h" />,
      <PrivacyPage key="p" />,
      <TermsPage key="t" />,
      <ContactPage key="c" />,
    ];
    for (const el of pages) expect(html(el)).not.toMatch(FORBIDDEN);
    for (const m of [homeMeta, privacyMeta, termsMeta, contactMeta, searchMeta]) {
      expect(JSON.stringify(m)).not.toMatch(FORBIDDEN);
    }
  });
});

describe("legal pages", () => {
  it("use only the official contact address", () => {
    for (const el of [<PrivacyPage key="p" />, <TermsPage key="t" />, <ContactPage key="c" />]) {
      const out = html(el);
      expect(out).toContain("kontakt@gdziepolece.pl");
      const addresses = out.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
      expect(new Set(addresses)).toEqual(new Set(["kontakt@gdziepolece.pl"]));
    }
  });

  it("disclose affiliate links and say there are no cookies beyond technical ones", () => {
    const privacy = html(<PrivacyPage />);
    expect(privacy).toContain("prowizja nie zmienia ceny");
    expect(privacy).toContain("nie ustawia własnych plików cookie");
    expect(html(<TermsPage />)).toContain("Prowizja nie zmienia ceny");
  });
});

describe("/szukaj metadata", () => {
  it("canonicalises to /szukaj", () => {
    expect(searchMeta.alternates?.canonical).toBe("/szukaj");
    expect(searchMeta.title).toBeTruthy();
    expect(searchMeta.description).toBeTruthy();
  });
});
