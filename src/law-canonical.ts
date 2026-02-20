export type CanonicalLawInput = {
  title: string;
  summary?: string | null;
  content?: string | null;
  jurisdictionCountry: string;
  jurisdictionState?: string | null;
};

export type CanonicalLaw = {
  lawName: string;
  lawType: string;
  lawIdentifier: string;
  lawKey: string;
};

const lawKeywords = ["Act", "Bill", "Directive", "Regulation", "Code", "Rule"] as const;

const knownLawAcronyms = [
  "COPPA",
  "KOSA",
  "DSA",
  "GDPR",
  "DMA",
  "AADC",
  "CSAM",
  "DPDP",
  "LGPD",
  "PDPA",
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForKey(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractLawPhrase(text: string): { lawName: string; lawType: string; lawIdentifier: string } | null {
  const normalized = normalizeWhitespace(text);

  for (const acronym of knownLawAcronyms) {
    const regex = new RegExp(`\\b${acronym}\\b`, "i");
    if (regex.test(normalized)) {
      const companion = new RegExp(
        `([A-Z][A-Za-z0-9'’(),\\- ]{2,120}(?:${lawKeywords.join("|")}))`,
      ).exec(normalized);
      const name = companion?.[1] ? normalizeWhitespace(companion[1]) : acronym;
      return {
        lawName: name,
        lawType: companion?.[1]
          ? lawKeywords.find((keyword) => new RegExp(`${keyword}$`, "i").test(companion[1])) ?? "law"
          : "law",
        lawIdentifier: acronym,
      };
    }
  }

  const billNumberMatch = /\b((?:SB|HB|AB|HR|S\.B\.|H\.B\.)[-\s]?\d{1,5})\b/i.exec(normalized);
  if (billNumberMatch) {
    const identifier = billNumberMatch[1].replace(/\./g, "").replace(/\s+/g, "-").toUpperCase();
    const prefix =
      /([A-Z][A-Za-z0-9'’(),\- ]{2,80}\b(?:Act|Bill|Directive|Regulation|Code|Rule)\b)/i.exec(normalized)?.[1]
      ?? `${identifier} Bill`;
    return {
      lawName: normalizeWhitespace(prefix),
      lawType: /bill/i.test(prefix) ? "bill" : "law",
      lawIdentifier: identifier,
    };
  }

  const namedLawMatch = /\b([A-Z][A-Za-z0-9'’(),\- ]{3,140}?\s(?:Act|Bill|Directive|Regulation|Code|Rule))(?:\b|\s|$)/.exec(normalized);
  if (namedLawMatch) {
    const lawName = normalizeWhitespace(namedLawMatch[1]);
    const lawType = lawKeywords.find((keyword) => new RegExp(`${keyword}$`, "i").test(lawName)) ?? "law";
    const parenIdentifier = /\(([A-Z0-9\-]{2,15})\)/.exec(normalized)?.[1];

    return {
      lawName,
      lawType: lawType.toLowerCase(),
      lawIdentifier: parenIdentifier ?? lawName,
    };
  }

  return null;
}

function fallbackLawName(input: CanonicalLawInput): { lawName: string; lawType: string; lawIdentifier: string } {
  const combined = normalizeWhitespace(`${input.title} ${input.summary ?? ""} ${input.content ?? ""}`);

  const legalPhrase = /\b([A-Za-z][A-Za-z0-9'’\- ]{4,80}(?:privacy|children|youth|minor|online safety|digital safety|data protection|consent|age verification))/i.exec(
    combined,
  )?.[1];

  if (legalPhrase) {
    const lawName = normalizeWhitespace(legalPhrase)
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
    return {
      lawName: `${lawName} Framework`,
      lawType: "framework",
      lawIdentifier: lawName,
    };
  }

  const titleWords = normalizeWhitespace(input.title)
    .split(" ")
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");

  return {
    lawName: titleWords || "Unspecified Regulation",
    lawType: "law",
    lawIdentifier: titleWords || "unspecified-regulation",
  };
}

export function inferCanonicalLaw(input: CanonicalLawInput): CanonicalLaw {
  const parsed =
    extractLawPhrase(`${input.title} ${input.summary ?? ""} ${input.content ?? ""}`)
    ?? fallbackLawName(input);

  const jurisdictionKey = [input.jurisdictionCountry, input.jurisdictionState ?? ""]
    .map((value) => normalizeForKey(value))
    .filter(Boolean)
    .join(":");

  const subjectKey = normalizeForKey(parsed.lawIdentifier || parsed.lawName || "unspecified-law");

  return {
    lawName: parsed.lawName,
    lawType: parsed.lawType,
    lawIdentifier: parsed.lawIdentifier,
    lawKey: `${jurisdictionKey || "global"}:${subjectKey || "unspecified-law"}`,
  };
}
