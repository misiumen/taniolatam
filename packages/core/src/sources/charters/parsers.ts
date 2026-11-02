import { XMLParser } from "fast-xml-parser";
import { getPath, type FeedRecord } from "./mapping.ts";
import type { CharterCsvOptions } from "./types.ts";

/**
 * Feed parsers. Each takes the body as an (async) iterable of text chunks and yields one record
 * at a time, so a large feed is mapped and stored row by row instead of being parsed into one
 * huge tree (JSON is the exception: it needs the whole document).
 */

export class CharterParseError extends Error {
  override name = "CharterParseError";
}

export type TextChunks = AsyncIterable<string> | Iterable<string>;

/** Largest single XML record / CSV row accepted (guards against a missing closing tag). */
export const MAX_RECORD_CHARS = 1_000_000;

// ---------------------------------------------------------------------------------------------
// XML

// Created on first use: no work at import time for bundles that never parse XML.
let xmlParserInstance: XMLParser | undefined;
const xmlParser = () =>
  (xmlParserInstance ??= new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    // Keep every value a string: the mapping decides what is a number or a date.
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
  }));

/** Sections whose content is not markup: a record tag inside them is text. */
const SPECIAL_SECTIONS: readonly (readonly [string, string])[] = [
  ["<!--", "-->"],
  ["<![CDATA[", "]]>"],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Records of an XML feed: every `<tag …>…</tag>` (or `<tag …/>`) element, parsed with
 * fast-xml-parser into `{ child: "text", "@attr": "value", … }` (a repeated child becomes an array,
 * an element with attributes keeps its text in `#text`). `recordPath` is the element name or a
 * dot path whose last segment is used ("oferty.oferta" → `<oferta>`).
 *
 * Elements are cut from the stream before parsing, so memory stays at one record. Limitation: the
 * record element must not contain an element of the same name.
 */
export async function* iterateXmlRecords(
  chunks: TextChunks,
  recordPath: string,
): AsyncGenerator<FeedRecord> {
  const tag = recordPath.split(".").filter(Boolean).pop()?.trim();
  if (!tag || !/^[\p{L}_][\p{L}\p{N}_.:-]*$/u.test(tag)) {
    throw new CharterParseError(`XML: invalid record element ${JSON.stringify(recordPath)}`);
  }
  const open = new RegExp(`<${escapeRe(tag)}(?=[\\s/>])`, "g");
  const close = new RegExp(`</${escapeRe(tag)}\\s*>`, "g");
  let buf = "";

  /**
   * Index just past a comment / CDATA section starting at `i`, -1 when it is not complete yet,
   * undefined when `i` starts neither.
   */
  const skipSpecial = (i: number): number | undefined => {
    for (const [begin, end] of SPECIAL_SECTIONS) {
      if (buf.startsWith(begin, i)) {
        const e = buf.indexOf(end, i + begin.length);
        return e < 0 ? -1 : e + end.length;
      }
    }
    return undefined;
  };

  /** First `re` match at or after `from` outside comments and CDATA; -1 = need more data. */
  const find = (re: RegExp, from: number): { index: number; end: number } | -1 | undefined => {
    let i = from;
    for (;;) {
      re.lastIndex = i;
      const m = re.exec(buf);
      const special = buf.indexOf("<!", i);
      if (special >= 0 && (!m || special < m.index)) {
        const after = skipSpecial(special);
        if (after === -1) return -1;
        i = after ?? special + 2;
        continue;
      }
      return m ? { index: m.index, end: m.index + m[0].length } : undefined;
    }
  };

  for await (const chunk of chunks) {
    buf += chunk;
    for (;;) {
      const m = find(open, 0);
      if (m === -1) break; // an unfinished comment / CDATA: wait for more text
      if (!m) {
        // Keep a tail that may hold the start of the next opening tag or comment.
        buf = buf.slice(Math.max(0, buf.length - tag.length - 9));
        break;
      }
      const start = m.index;
      const headEnd = buf.indexOf(">", m.end);
      let end: number | undefined;
      if (headEnd >= 0 && buf[headEnd - 1] === "/") {
        end = headEnd + 1;
      } else if (headEnd >= 0) {
        const c = find(close, headEnd + 1);
        if (c !== -1 && c) end = c.end;
      }
      if (end === undefined) {
        buf = buf.slice(start);
        if (buf.length > MAX_RECORD_CHARS) {
          throw new CharterParseError(`XML: <${tag}> without a closing tag or too large`);
        }
        break;
      }
      const xml = buf.slice(start, end);
      buf = buf.slice(end);
      let parsed: unknown;
      try {
        parsed = xmlParser().parse(xml);
      } catch (err) {
        throw new CharterParseError(`XML: ${(err as Error).message}`);
      }
      const rec = (parsed as Record<string, unknown>)[tag];
      yield rec !== null && typeof rec === "object" && !Array.isArray(rec)
        ? (rec as FeedRecord)
        : rec === undefined || rec === ""
          ? {}
          : { "#text": String(rec) };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// CSV

const CSV_DELIMITERS = [";", ",", "\t", "|"] as const;

/** The delimiter occurring most often outside quotes in `line` (ties: `;` first). */
export function detectCsvDelimiter(line: string): string {
  const counts = new Map<string, number>(CSV_DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  let best: string = ";";
  for (const d of CSV_DELIMITERS) if (counts.get(d)! > counts.get(best)!) best = d;
  return best;
}

/**
 * Rows of a CSV feed (RFC 4180: quoted fields with "" escapes and embedded newlines, CRLF or LF,
 * UTF-8 BOM dropped). With a header (default) each row is `{ column: value }`; with
 * `header: [names]` those names are used and the first row is data; with `header: false` the
 * keys are "0", "1", …. Blank lines are skipped.
 */
export async function* iterateCsvRecords(
  chunks: TextChunks,
  opts: CharterCsvOptions = {},
): AsyncGenerator<FeedRecord> {
  let delimiter = opts.delimiter;
  let columns: string[] | undefined = Array.isArray(opts.header) ? opts.header : undefined;
  const useHeader = opts.header === undefined || opts.header === true;

  let field = "";
  let row: string[] = [];
  let quoted = false;
  let pendingQuote = false; // saw `"` inside a quoted field: escape or end of quotes
  let started = false; // BOM / delimiter detection done
  let pending = ""; // text held back until the delimiter is known
  let rowChars = 0;
  const out: FeedRecord[] = [];

  const endRow = () => {
    row.push(field);
    field = "";
    rowChars = 0;
    if (row.length === 1 && row[0] === "") {
      row = [];
      return;
    }
    if (useHeader && !columns) {
      columns = row.map((c) => c.trim());
    } else {
      const names = columns ?? row.map((_, i) => String(i));
      const rec: FeedRecord = {};
      names.forEach((n, i) => {
        if (n !== "") rec[n] = row[i] ?? "";
      });
      out.push(rec);
    }
    row = [];
  };

  const feed = (text: string) => {
    const d = delimiter!;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (++rowChars > MAX_RECORD_CHARS) throw new CharterParseError("CSV: row too large");
      if (quoted) {
        if (pendingQuote) {
          pendingQuote = false;
          if (ch === '"') {
            field += '"';
            continue;
          }
          quoted = false; // the quote closed the field; fall through to handle `ch`
        } else if (ch === '"') {
          pendingQuote = true;
          continue;
        } else {
          field += ch;
          continue;
        }
      }
      if (ch === '"' && field === "") quoted = true;
      else if (ch === d) {
        row.push(field);
        field = "";
      } else if (ch === "\n") endRow();
      else if (ch === "\r") continue;
      else field += ch;
    }
  };

  for await (const chunk of chunks) {
    let text = chunk;
    if (!started) {
      pending += text;
      const nl = pending.indexOf("\n");
      if (nl < 0 && pending.length < 64_000) continue;
      if (pending.charCodeAt(0) === 0xfeff) pending = pending.slice(1);
      delimiter ??= detectCsvDelimiter(nl < 0 ? pending : pending.slice(0, nl));
      started = true;
      text = pending;
      pending = "";
    }
    feed(text);
    yield* out.splice(0);
  }
  if (!started) {
    if (pending.charCodeAt(0) === 0xfeff) pending = pending.slice(1);
    delimiter ??= detectCsvDelimiter(pending.split("\n")[0] ?? "");
    feed(pending);
  }
  if (pendingQuote) quoted = false;
  if (quoted) throw new CharterParseError("CSV: unterminated quoted field");
  if (field !== "" || row.length) endRow();
  yield* out.splice(0);
}

// ---------------------------------------------------------------------------------------------
// JSON

/**
 * Records of a JSON feed: the array at `recordsPath` (dot path; empty = the root, which may also
 * be an object whose single array property is used). Non-object items are skipped.
 */
export async function* iterateJsonRecords(
  chunks: TextChunks,
  recordsPath?: string,
): AsyncGenerator<FeedRecord> {
  let text = "";
  for await (const c of chunks) text += c;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new CharterParseError(`JSON: ${(err as Error).message}`);
  }
  let list = recordsPath ? getPath(json, recordsPath) : json;
  if (!recordsPath && list !== null && typeof list === "object" && !Array.isArray(list)) {
    const arrays = Object.values(list).filter(Array.isArray);
    if (arrays.length === 1) list = arrays[0];
  }
  if (!Array.isArray(list)) {
    throw new CharterParseError(`JSON: no array at ${JSON.stringify(recordsPath ?? "")}`);
  }
  for (const item of list) {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) yield item as FeedRecord;
  }
}

// ---------------------------------------------------------------------------------------------
// Response body → text chunks

export interface BodyOptions {
  /** TextDecoder label used when the response has no charset. Default "utf-8". */
  encoding?: string;
  /** The body is a gzip file (decompressed here). */
  compression?: "gzip";
}

/** `charset=` of a Content-Type header, if any. */
export function charsetOf(contentType: string | null | undefined): string | undefined {
  const m = contentType ? /charset\s*=\s*"?([^";\s]+)/i.exec(contentType) : null;
  return m ? m[1] : undefined;
}

/**
 * Decoded text chunks of a fetch Response, streamed. The Content-Type charset wins over
 * `opts.encoding`; an unsupported label falls back to the other one, then UTF-8.
 */
export async function* responseTextChunks(
  res: Response,
  opts: BodyOptions = {},
): AsyncGenerator<string> {
  const labels = [charsetOf(res.headers.get("content-type")), opts.encoding, "utf-8"];
  let decoder: InstanceType<typeof TextDecoder> | undefined;
  for (const label of labels) {
    if (!label) continue;
    try {
      decoder = new TextDecoder(label);
      break;
    } catch {
      // unsupported label: try the next one
    }
  }
  decoder ??= new TextDecoder();
  let body = res.body;
  if (!body) {
    yield decoder.decode(new Uint8Array(await res.arrayBuffer()));
    return;
  }
  if (opts.compression === "gzip") {
    body = body.pipeThrough(new DecompressionStream("gzip"));
  }
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}
