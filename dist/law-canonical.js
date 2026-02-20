"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferCanonicalLaw = inferCanonicalLaw;
const lawKeywords = ["Act", "Bill", "Directive", "Regulation", "Code", "Rule"];
const keywordPattern = new RegExp(`(?:${lawKeywords.join("|")})`, "i");
const allCapsTokens = new Set([
    "COPPA",
    "KOSA",
    "DSA",
    "GDPR",
    "DMA",
    "AADC",
    "DPDP",
    "PDPA",
    "LGPD",
    "UK",
    "EU",
    "US",
    "UAE",
    "FTC",
]);
const lowercaseJoiners = new Set(["and", "or", "of", "for", "to", "the", "in", "on", "by", "under"]);
const narrativePrefixPattern = new RegExp([
    "^potentially\\b",
    "^for\\s+kids\\s+under\\b",
    "^the\\s+law\\s+has\\b",
    "^this\\s+follows\\b",
    "^to\\s+a\\s+lawsuit\\s+by\\b",
    "^are\\s+new\\s+global\\b",
    "^what\\s+to\\s+expect\\s+from\\b",
].join("|"), "i");
const narrativeVerbPattern = /\b(has|have|had|is|are|was|were|introduced|enacted|issued|setting|explained|follows|following|alleging|claims?)\b/i;
function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}
function normalizeForKey(value) {
    return normalizeWhitespace(value)
        .toLowerCase()
        .replace(/["'’]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
function toLawTitleCase(value) {
    const words = normalizeWhitespace(value)
        .split(" ")
        .filter(Boolean);
    return words
        .map((word, index) => {
        const stripped = word.replace(/[^A-Za-z0-9]/g, "");
        if (!stripped)
            return word;
        const upper = stripped.toUpperCase();
        if (allCapsTokens.has(upper)) {
            return word.replace(stripped, upper);
        }
        const lower = stripped.toLowerCase();
        if (index > 0 && lowercaseJoiners.has(lower)) {
            return word.replace(stripped, lower);
        }
        return word.replace(stripped, `${stripped.charAt(0).toUpperCase()}${stripped.slice(1).toLowerCase()}`);
    })
        .join(" ");
}
function normalizeBillIdentifier(value) {
    return value
        .replace(/\./g, "")
        .replace(/\s+/g, "")
        .replace(/([A-Za-z]+)(\d+)/, "$1-$2")
        .toUpperCase();
}
function resolveLawType(name) {
    const keyword = lawKeywords.find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(name));
    return keyword ? keyword.toLowerCase() : "law";
}
function extractKnownLawAlias(text, jurisdictionCountry) {
    const normalized = normalizeWhitespace(text);
    const jurisdiction = jurisdictionCountry.toLowerCase();
    if (/\bchildren'?s\s+online\s+privacy\s+protection\s+act\b/i.test(normalized) || /\bCOPPA\b/i.test(normalized)) {
        return {
            lawName: "Children's Online Privacy Protection Act (COPPA)",
            lawType: "act",
            lawIdentifier: "COPPA",
        };
    }
    if (/\bkids\s+online\s+safety\s+act\b/i.test(normalized) || /\bKOSA\b/i.test(normalized)) {
        return {
            lawName: "Kids Online Safety Act (KOSA)",
            lawType: "act",
            lawIdentifier: "KOSA",
        };
    }
    if (/\bage-appropriate\s+design\s+code\s+act\b/i.test(normalized) || /\bAB[-\s]?2273\b/i.test(normalized)) {
        return {
            lawName: "California Age-Appropriate Design Code Act (AB-2273)",
            lawType: "act",
            lawIdentifier: "AB-2273",
        };
    }
    if (/\bsecuring\s+children\s+online\s+through\s+parental\s+empowerment\b/i.test(normalized) || /\bSCOPE\s+Act\b/i.test(normalized)) {
        return {
            lawName: "Securing Children Online Through Parental Empowerment Act (SCOPE Act)",
            lawType: "act",
            lawIdentifier: "SCOPE-ACT",
        };
    }
    const dsaMentioned = /\bdigital\s+services\s+act\b/i.test(normalized)
        || (/\bDSA\b/i.test(normalized) && /\b(EU|European|Commission|Brussels|Article\s*28|Regulation|Minors?)\b/i.test(normalized));
    if (dsaMentioned) {
        return {
            lawName: "Digital Services Act (DSA)",
            lawType: "regulation",
            lawIdentifier: "EU-DSA",
        };
    }
    const hasOnlineSafetyAct = /\bonline\s+safety\s+act\b/i.test(normalized);
    if (hasOnlineSafetyAct) {
        const ukContext = jurisdiction.includes("united kingdom") || /\b(UK|Ofcom|Britain|British)\b/i.test(normalized);
        if (ukContext) {
            return {
                lawName: "Online Safety Act 2023 (UK)",
                lawType: "act",
                lawIdentifier: "UK-OSA-2023",
            };
        }
        const auContext = jurisdiction.includes("australia") || /\b(Australia|Australian|eSafety)\b/i.test(normalized);
        if (auContext) {
            return {
                lawName: "Online Safety Act 2021 (Australia)",
                lawType: "act",
                lawIdentifier: "AU-OSA-2021",
            };
        }
        return {
            lawName: "Online Safety Act",
            lawType: "act",
            lawIdentifier: "ONLINE-SAFETY-ACT",
        };
    }
    if (/\bgeneral\s+data\s+protection\s+regulation\b/i.test(normalized) || /\bGDPR\b/i.test(normalized)) {
        return {
            lawName: "General Data Protection Regulation (GDPR)",
            lawType: "regulation",
            lawIdentifier: "GDPR",
        };
    }
    if (/\bdigital\s+personal\s+data\s+protection\s+act\b/i.test(normalized) || /\bDPDP\b/i.test(normalized)) {
        return {
            lawName: "Digital Personal Data Protection Act 2023 (India)",
            lawType: "act",
            lawIdentifier: "DPDP-ACT-2023",
        };
    }
    if (/\bpersonal\s+data\s+protection\s+act\b/i.test(normalized) || /\bPDPA\b/i.test(normalized)) {
        return {
            lawName: "Personal Data Protection Act (PDPA)",
            lawType: "act",
            lawIdentifier: "PDPA",
        };
    }
    return null;
}
function scoreCandidateLawName(name) {
    const words = name.split(/\s+/).filter(Boolean);
    let score = 0;
    if (keywordPattern.test(name))
        score += 10;
    if (/\b\d{4}\b/.test(name))
        score += 2;
    if (/\b(?:COPPA|KOSA|DSA|GDPR|DPDP|PDPA|AB-\d+)\b/.test(name))
        score += 3;
    if (narrativePrefixPattern.test(name) || narrativeVerbPattern.test(name))
        score -= 8;
    score -= Math.max(0, words.length - 9);
    return score;
}
function extractExplicitLawPhrase(text) {
    const normalized = normalizeWhitespace(text)
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'");
    const candidates = [];
    const matches = normalized.matchAll(/\b([A-Za-z][A-Za-z0-9'’&/.\-]*(?:\s+[A-Za-z0-9'’&/.\-]+){0,12}\s(?:Act|Bill|Directive|Regulation|Code|Rule)(?:\s+\d{4})?)\b/gi);
    for (const match of matches) {
        const raw = normalizeWhitespace(match[1]);
        const tokens = raw.split(" ").filter(Boolean);
        const keywordIndex = tokens.findIndex((token) => {
            const tokenWord = token.replace(/[^A-Za-z]/g, "");
            return lawKeywords.some((keyword) => new RegExp(`^${keyword}$`, "i").test(tokenWord));
        });
        if (keywordIndex <= 0)
            continue;
        let head = tokens.slice(0, keywordIndex);
        while (head.length > 0 && /^(the|a|an|this|that|these|those|potentially|for|to|under)$/i.test(head[0])) {
            head = head.slice(1);
        }
        if (head.length === 0 || head.length > 8)
            continue;
        if (narrativeVerbPattern.test(head.join(" ")))
            continue;
        const keywordToken = tokens[keywordIndex].replace(/[^A-Za-z]/g, "");
        const nextToken = (tokens[keywordIndex + 1] ?? "").replace(/[^0-9]/g, "");
        const yearToken = /^\d{4}$/.test(nextToken) ? [nextToken] : [];
        const canonicalName = toLawTitleCase([...head, keywordToken, ...yearToken].join(" "));
        const billMatch = /\b((?:SB|HB|AB|HR|SR|S\.B\.|H\.B\.|A\.B\.|H\.R\.|S\.R\.)[-\s]?\d{1,5})\b/i.exec(normalized);
        const parenIdentifier = /\(([A-Z][A-Z0-9\-.]{1,20})\)/.exec(normalized)?.[1];
        candidates.push({
            lawName: canonicalName,
            lawType: resolveLawType(canonicalName),
            lawIdentifier: parenIdentifier ?? (billMatch ? normalizeBillIdentifier(billMatch[1]) : canonicalName),
        });
    }
    if (candidates.length === 0) {
        const billOnlyMatch = /\b((?:SB|HB|AB|HR|SR|S\.B\.|H\.B\.|A\.B\.|H\.R\.|S\.R\.)[-\s]?\d{1,5})\b/i.exec(normalized);
        if (billOnlyMatch) {
            const identifier = normalizeBillIdentifier(billOnlyMatch[1]);
            return {
                lawName: `${identifier} Bill`,
                lawType: "bill",
                lawIdentifier: identifier,
            };
        }
        return null;
    }
    candidates.sort((a, b) => {
        const scoreDiff = scoreCandidateLawName(b.lawName) - scoreCandidateLawName(a.lawName);
        if (scoreDiff !== 0)
            return scoreDiff;
        return a.lawName.length - b.lawName.length;
    });
    return candidates[0] ?? null;
}
function fallbackLawName(input) {
    const title = normalizeWhitespace(input.title || "");
    if (/\bonline\s+safety\b/i.test(title)) {
        return {
            lawName: "Child Online Safety Law",
            lawType: "law",
            lawIdentifier: "child-online-safety-law",
        };
    }
    if (/\b(age\s+verification|age\s+assurance)\b/i.test(title)) {
        return {
            lawName: "Age Verification Law",
            lawType: "law",
            lawIdentifier: "age-verification-law",
        };
    }
    if (/\b(privacy|data\s+protection|children'?s\s+privacy)\b/i.test(title)) {
        return {
            lawName: "Child Data Privacy Law",
            lawType: "law",
            lawIdentifier: "child-data-privacy-law",
        };
    }
    const conciseTitle = toLawTitleCase(title
        .replace(/^[^A-Za-z0-9]+/, "")
        .replace(/[.!?].*$/, "")
        .split(" ")
        .slice(0, 7)
        .join(" "));
    return {
        lawName: conciseTitle || "Unspecified Law",
        lawType: "law",
        lawIdentifier: conciseTitle || "unspecified-law",
    };
}
function inferCanonicalLaw(input) {
    const textCandidates = [input.title, input.summary ?? "", input.content ?? ""]
        .map((value) => normalizeWhitespace(value || ""))
        .filter(Boolean);
    let parsed = null;
    for (const text of textCandidates) {
        parsed = extractKnownLawAlias(text, input.jurisdictionCountry);
        if (parsed)
            break;
        parsed = extractExplicitLawPhrase(text);
        if (parsed)
            break;
    }
    parsed = parsed ?? fallbackLawName(input);
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
//# sourceMappingURL=law-canonical.js.map