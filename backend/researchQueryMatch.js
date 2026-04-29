import natural from "natural";
import { wildcardQueryToRegex } from "./shared/wildcardPattern.js";

const stemmer = natural.PorterStemmer;

function tokenizeWords(lowerText) {
  return String(lowerText).toLowerCase().match(/\b[a-z0-9]+\b/g) || [];
}

/**
 * True if every alphabetic token in the query has the same Porter stem as some
 * word in the document text (e.g. "security" matches "secure").
 */
function stemmedTokenMatch(text, query) {
  const q = String(query || "").trim().toLowerCase();
  const tokens = tokenizeWords(q).filter((t) => t.length >= 2);
  if (tokens.length === 0) return false;
  const docStems = new Set(
    tokenizeWords(text || "").map((w) => stemmer.stem(w)),
  );
  return tokens.every((t) => docStems.has(stemmer.stem(t)));
}

/**
 * Match user query against a free-text corpus (research blurb, or title+abstract).
 * - Glob wildcards (*, ?): same rules as name search (regex).
 * - Otherwise: substring match first, then Porter stem overlap on tokens.
 */
export function researchCorpusMatchesQuery(text, query) {
  const raw = String(query || "").trim();
  if (!raw) return false;
  const lowerText = String(text || "").toLowerCase();
  const lowerQ = raw.toLowerCase();

  if (/[*?]/.test(raw)) {
    return wildcardQueryToRegex(raw).test(lowerText);
  }

  if (lowerText.includes(lowerQ)) return true;

  return stemmedTokenMatch(text, raw);
}
