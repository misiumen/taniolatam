import { describe, expect, it } from "vitest";
import {
  detectCsvDelimiter,
  iterateCsvRecords,
  iterateJsonRecords,
  iterateXmlRecords,
  responseTextChunks,
} from "../../src/index.ts";
import { chunkedBody, fixture } from "./helpers.ts";

async function all<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

/** Splits text into fixed-size chunks (records then straddle chunk boundaries). */
const chunks = (text: string, size: number) =>
  Array.from({ length: Math.ceil(text.length / size) }, (_, i) =>
    text.slice(i * size, (i + 1) * size),
  );

describe("iterateXmlRecords", () => {
  const xml = fixture("travellead-style.xml");

  it("yields every <oferta> with attributes, nested elements, entities and CDATA", async () => {
    const recs = await all(iterateXmlRecords([xml], "oferty.oferta"));
    expect(recs).toHaveLength(7);
    const first = recs[0]!;
    expect(first["@id"]).toBe("TL-1001");
    expect(first["@typ"]).toBe("lot");
    expect(first.wylot).toEqual({
      lotnisko: "Katowice Pyrzowice",
      data: "12.01.2027",
      godzina: "06:15",
    });
    expect(first.cena).toEqual({ "#text": "1 299,00", "@waluta": "PLN" });
    expect(first.url).toBe("https://example.test/oferta/TL-1001?a=1&b=2");
    expect((recs[2]!.cel as Record<string, unknown>).miejsce).toBe("Kreta / Heraklion");
    // Self-closing record.
    expect(recs[6]).toEqual({ "@id": "TL-1007", "@typ": "lot" });
  });

  it("gives the same records whatever the chunk size", async () => {
    const whole = await all(iterateXmlRecords([xml], "oferta"));
    for (const size of [1, 7, 64, 500]) {
      expect(await all(iterateXmlRecords(chunks(xml, size), "oferta"))).toEqual(whole);
    }
  });

  it("does not match elements whose name only starts with the record tag", async () => {
    const recs = await all(
      iterateXmlRecords(
        ["<r><ofertaInfo>x</ofertaInfo><oferta id='1'><a>1</a></oferta></r>"],
        "oferta",
      ),
    );
    expect(recs).toEqual([{ "@id": "1", a: "1" }]);
  });

  it("ignores record tags inside comments and CDATA", async () => {
    const text =
      "<r><!-- <oferta id='x'>no</oferta> --><oferta id='1'><t><![CDATA[a </oferta> b]]></t></oferta></r>";
    for (const size of [1, 5, 1000]) {
      expect(await all(iterateXmlRecords(chunks(text, size), "oferta"))).toEqual([
        { "@id": "1", t: "a </oferta> b" },
      ]);
    }
  });

  it("rejects an invalid record element name", async () => {
    await expect(all(iterateXmlRecords(["<a/>"], "<bad>"))).rejects.toThrow(/record element/);
  });
});

describe("iterateCsvRecords", () => {
  const csv = fixture("tradedoubler-style.csv");

  it("parses quoted fields with delimiters and escaped quotes", async () => {
    const rows = await all(iterateCsvRecords([csv], { delimiter: ";" }));
    expect(rows).toHaveLength(4);
    expect(rows[0]!.name).toBe('Lot czarterowy Wrocław – Fuerteventura, "last minute"');
    expect(rows[1]!.name).toBe("Wczasy Antalya; 7 nocy");
    expect(rows[1]!.price).toBe("2.499,00");
    expect(rows[3]!.airline).toBe("");
  });

  it("detects the delimiter and handles CRLF, BOM, chunking and a missing final newline", async () => {
    const text = '﻿a,b,c\r\n1,"x\r\ny",3\r\n\r\n4,5,6';
    const expected = [
      { a: "1", b: "x\r\ny", c: "3" },
      { a: "4", b: "5", c: "6" },
    ];
    expect(await all(iterateCsvRecords([text]))).toEqual(expected);
    expect(await all(iterateCsvRecords(chunks(text, 1)))).toEqual(expected);
    expect(await all(iterateCsvRecords(chunks(csv, 5), {}))).toEqual(
      await all(iterateCsvRecords([csv], { delimiter: ";" })),
    );
  });

  it("supports given column names and headerless rows", async () => {
    expect(await all(iterateCsvRecords(["1|2\n"], { header: ["x", "y"] }))).toEqual([
      { x: "1", y: "2" },
    ]);
    expect(await all(iterateCsvRecords(["1\t2\n"], { header: false }))).toEqual([
      { 0: "1", 1: "2" },
    ]);
  });

  it("picks the most frequent delimiter outside quotes", () => {
    expect(detectCsvDelimiter('a;b;"c,d,e"')).toBe(";");
    expect(detectCsvDelimiter("a,b,c")).toBe(",");
    expect(detectCsvDelimiter("a\tb\tc")).toBe("\t");
    expect(detectCsvDelimiter("a|b|c")).toBe("|");
  });

  it("throws on an unterminated quote", async () => {
    await expect(all(iterateCsvRecords(['a,b\n"1,2\n']))).rejects.toThrow(/unterminated/);
  });
});

describe("iterateJsonRecords", () => {
  it("reads the array at a path, or the root array, or a single array property", async () => {
    const doc = JSON.stringify({ data: { offers: [{ id: 1 }, 2, { id: 3 }] } });
    expect(await all(iterateJsonRecords(chunks(doc, 4), "data.offers"))).toEqual([
      { id: 1 },
      { id: 3 },
    ]);
    expect(await all(iterateJsonRecords(['[{"id":1}]']))).toEqual([{ id: 1 }]);
    expect(await all(iterateJsonRecords(['{"items":[{"id":2}]}']))).toEqual([{ id: 2 }]);
    await expect(all(iterateJsonRecords(['{"a":1}'], "b"))).rejects.toThrow(/no array/);
  });
});

describe("responseTextChunks", () => {
  it("decodes a streamed body using the Content-Type charset (windows-1250)", async () => {
    // "Łódź" in windows-1250.
    const bytes = new Uint8Array([0xa3, 0xf3, 0x64, 0x9f]);
    const res = new Response(bytes, {
      headers: { "content-type": "text/csv; charset=windows-1250" },
    });
    expect((await all(responseTextChunks(res))).join("")).toBe("Łódź");
  });

  it("uses the configured encoding when the server sends none, and gunzips", async () => {
    const { gzipSync } = await import("node:zlib");
    const bytes = gzipSync(Buffer.from([0x50, 0x6f, 0x7a, 0x6e, 0x61, 0xf1])); // "Poznań" in ISO-8859-2
    const res = new Response(new Blob([bytes]).stream());
    expect(
      (await all(responseTextChunks(res, { encoding: "iso-8859-2", compression: "gzip" }))).join(
        "",
      ),
    ).toBe("Poznań");
  });

  it("keeps multi-byte UTF-8 characters split across chunks intact", async () => {
    const res = new Response(chunkedBody("Rębiechowo, Świdnik, Ławica", 1));
    expect((await all(responseTextChunks(res))).join("")).toBe("Rębiechowo, Świdnik, Ławica");
  });
});
