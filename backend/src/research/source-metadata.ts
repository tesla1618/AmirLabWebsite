export interface SourceAuthor {
  name: string;
  orcid?: string;
}

export interface SourceMetadata {
  title?: string;
  doi?: string;
  authors: SourceAuthor[];
}

export function normalizePersonName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(prof(?:essor)?|dr|mr|mrs|ms)\.?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function personNameTokenKey(value: string): string {
  return normalizePersonName(value).split(' ').filter(Boolean).sort().join(' ');
}

export function personNameMatchConfidence(
  sourceName: string,
  personName: string,
): number | undefined {
  return personNameMatchEvidence(sourceName, personName)?.confidence;
}

export function personNameMatchEvidence(
  sourceName: string,
  personName: string,
):
  | {
      confidence: number;
      reason:
        'Exact normalized name' | 'Initials + surname' | 'Fuzzy full name';
    }
  | undefined {
  const sourceKey = personNameTokenKey(sourceName);
  if (
    sourceKey &&
    sourceKey.split(' ').length >= 2 &&
    sourceKey === personNameTokenKey(personName)
  ) {
    return { confidence: 1, reason: 'Exact normalized name' };
  }

  const source = orderedPersonNameTokens(sourceName);
  const person = orderedPersonNameTokens(personName);
  if (source.length < 2 || person.length < 2) return undefined;

  const sourceFamily = source.at(-1);
  const personFamily = person.at(-1);
  if (!sourceFamily || sourceFamily !== personFamily) return undefined;

  const sourceGiven = source.slice(0, -1);
  const personGiven = person.slice(0, -1);
  const match = orderedGivenNameEvidence(sourceGiven, personGiven);
  if (!match) return undefined;

  if (match.fullMatches >= 1 && match.missed === 0) {
    return { confidence: 0.86, reason: 'Fuzzy full name' };
  }
  if (match.initialMatches >= 2 && match.missed === 0) {
    return { confidence: 0.82, reason: 'Initials + surname' };
  }
  return undefined;
}

export function normalizeOrcid(value: string): string | undefined {
  const match = value
    .toUpperCase()
    .match(/(?:ORCID\.ORG\/)?(\d{4}-\d{4}-\d{4}-[\dX]{4})/);
  return match?.[1];
}

function orderedPersonNameTokens(value: string): string[] {
  const normalized = normalizePersonName(reorderCommaName(value));
  return normalized.split(' ').filter(Boolean);
}

function reorderCommaName(value: string): string {
  const [family, given] = value.split(',').map((part) => part.trim());
  return family && given ? `${given} ${family}` : value;
}

function orderedGivenNameEvidence(
  sourceGiven: string[],
  personGiven: string[],
): { fullMatches: number; initialMatches: number; missed: number } | undefined {
  let personIndex = 0;
  let fullMatches = 0;
  let initialMatches = 0;
  let missed = 0;

  for (const sourceToken of sourceGiven) {
    const matchedIndex = personGiven.findIndex((personToken, index) => {
      if (index < personIndex) return false;
      return sourceToken.length === 1
        ? personToken.startsWith(sourceToken)
        : personToken === sourceToken;
    });
    if (matchedIndex === -1) {
      missed += 1;
      continue;
    }
    personIndex = matchedIndex + 1;
    if (sourceToken.length === 1) {
      initialMatches += 1;
    } else {
      fullMatches += 1;
    }
  }

  return fullMatches || initialMatches
    ? { fullMatches, initialMatches, missed }
    : undefined;
}

export function parseHtmlMetadata(html: string): SourceMetadata {
  const meta = parseMetaTags(html);
  const citationAuthors = values(meta, 'citation_author');
  const dcAuthors = [
    ...values(meta, 'dc.creator'),
    ...values(meta, 'dc.contributor'),
  ];
  const orcids = values(meta, 'citation_author_orcid');
  const jsonLd = parseJsonLd(html);
  const names = citationAuthors.length
    ? citationAuthors
    : dcAuthors.length
      ? dcAuthors
      : jsonLd.authors.map(({ name }) => name);
  const authors =
    citationAuthors.length || dcAuthors.length
      ? uniqueAuthors(
          names.map((name, index) => {
            const matches = jsonLd.authors.filter(
              (author) =>
                normalizePersonName(author.name) === normalizePersonName(name),
            );
            return {
              name,
              orcid:
                normalizeOrcid(orcids[index] ?? '') ??
                (matches.length === 1 ? matches[0].orcid : undefined),
            };
          }),
        )
      : jsonLd.authors;

  return {
    authors,
    doi:
      cleanDoi(first(meta, 'citation_doi') ?? first(meta, 'dc.identifier')) ??
      jsonLd.doi,
    title:
      first(meta, 'citation_title') ??
      first(meta, 'dc.title') ??
      first(meta, 'og:title') ??
      jsonLd.title,
  };
}

export function parseJsonMetadata(value: unknown): SourceMetadata {
  const root =
    isRecord(value) && isRecord(value.message) ? value.message : value;
  const objects = Array.isArray(root) ? root : [root];
  const metadata: SourceMetadata = { authors: [] };
  for (const candidate of objects) {
    if (!isRecord(candidate)) continue;
    metadata.title ??=
      stringValue(candidate.name) ??
      stringValue(candidate.title) ??
      (Array.isArray(candidate.title)
        ? stringValue(candidate.title[0])
        : undefined);
    metadata.doi ??= cleanDoi(
      stringValue(candidate.doi) ??
        stringValue(candidate.DOI) ??
        stringValue(candidate.identifier),
    );
    metadata.authors.push(
      ...authorsFromValue(candidate.author ?? candidate.creator),
    );
  }
  metadata.authors = uniqueAuthors(metadata.authors);
  return metadata;
}

export function parsePdfMetadata(info: unknown): SourceMetadata {
  if (!isRecord(info)) return { authors: [] };
  const author = stringValue(info.Author) ?? stringValue(info.author);
  return {
    authors: author
      ? uniqueAuthors(
          author
            .split(/\s*[;|]\s*/)
            .filter(Boolean)
            .map((name) => ({ name })),
        )
      : [],
    doi: cleanDoi(stringValue(info.Subject) ?? stringValue(info.subject)),
    title: stringValue(info.Title) ?? stringValue(info.title),
  };
}

function parseMetaTags(html: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    )) {
      attributes.set(
        match[1].toLowerCase(),
        decodeHtml(match[2] ?? match[3] ?? match[4]),
      );
    }
    const key = (
      attributes.get('name') ?? attributes.get('property')
    )?.toLowerCase();
    const content = attributes.get('content')?.trim();
    if (!key || !content) continue;
    result.set(key, [...(result.get(key) ?? []), content]);
  }
  return result;
}

function parseJsonLd(html: string): SourceMetadata {
  const combined: SourceMetadata = { authors: [] };
  const pattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1])) as unknown;
      const metadata = parseJsonMetadata(parsed);
      combined.title ??= metadata.title;
      combined.doi ??= metadata.doi;
      combined.authors.push(...metadata.authors);
    } catch {
      // Invalid third-party JSON-LD is ignored; citation meta can still be used.
    }
  }
  combined.authors = uniqueAuthors(combined.authors);
  return combined;
}

function authorsFromValue(value: unknown): SourceAuthor[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.flatMap((entry) => {
    if (typeof entry === 'string') return [{ name: entry }];
    if (!isRecord(entry)) return [];
    const name =
      stringValue(entry.name) ??
      stringValue(entry.literal) ??
      [
        stringValue(entry.givenName) ?? stringValue(entry.given),
        stringValue(entry.familyName) ?? stringValue(entry.family),
      ]
        .filter(Boolean)
        .join(' ');
    if (!name.trim()) return [];
    const identifiers = [entry.identifier, entry.sameAs, entry.url]
      .flatMap(stringValues)
      .map(stringValue)
      .filter((item): item is string => Boolean(item));
    return [{ name, orcid: identifiers.map(normalizeOrcid).find(Boolean) }];
  });
}

function uniqueAuthors(authors: SourceAuthor[]): SourceAuthor[] {
  const unique = new Map<string, SourceAuthor>();
  for (const author of authors) {
    const name = author.name.replace(/\s+/g, ' ').trim();
    const nameKey = personNameTokenKey(name);
    if (!nameKey) continue;
    const orcid = normalizeOrcid(author.orcid ?? '');
    // A shared name is not a shared identity. Keep unidentified occurrences
    // separate too; matching must resolve them rather than silently merge them.
    const key = orcid
      ? `${nameKey}:${orcid}`
      : `${nameKey}:unknown:${unique.size}`;
    const existing = unique.get(key);
    unique.set(key, {
      name: existing?.name ?? name,
      orcid,
    });
  }
  return [...unique.values()];
}

function cleanDoi(value?: string): string | undefined {
  return value
    ?.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0]
    .replace(/[.,;)]$/, '');
}

function first(
  valuesByKey: Map<string, string[]>,
  key: string,
): string | undefined {
  return valuesByKey.get(key)?.[0];
}

function values(valuesByKey: Map<string, string[]>, key: string): string[] {
  return valuesByKey.get(key) ?? [];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, number: string) =>
      String.fromCodePoint(Number(number)),
    );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringValues(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && !Array.isArray(value) && typeof value === 'object';
}
