import { stemmer as porterStem } from "stemmer";
import { wildcardQueryToRegex } from "./shared/wildcardPattern.js";

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Literal substring match, but single-token queries must match as a whole word
 * so "it" does not match inside "item" (while stemming still handles variants).
 */
function literalMatches(lowerText, lowerQ) {
  if (!lowerQ || !lowerText.includes(lowerQ)) return false;
  if (/\s/.test(lowerQ)) return true;
  try {
    return new RegExp(`\\b${escapeRegex(lowerQ)}\\b`, "i").test(lowerText);
  } catch {
    return true;
  }
}

/**
 * Known acronym / shorthand → token sequence (all stems must appear in the doc
 * for that shorthand to count as satisfied).
 */
const ACRONYM_EXPANSIONS = {
  ai: ["artificial", "intelligence"],
  ml: ["machine", "learning"],
  dl: ["deep", "learning"],
  nlp: ["natural", "language", "processing"],
  cps: ["cyber", "physical", "systems"],
  iot: ["internet", "things"],
  hci: ["human", "computer", "interaction"],
  vr: ["virtual", "reality"],
  uav: ["unmanned", "aerial", "vehicle"],
  ev: ["electric", "vehicle"],
  mems: ["microelectromechanical", "systems"],
  rf: ["radio", "frequency"],
  dsp: ["digital", "signal", "processing"],
  fpga: ["field", "programmable", "gate", "array"],
  asic: ["application", "specific", "integrated", "circuit"],
  soc: ["system", "chip"],
  vlsi: ["very", "large", "scale", "integration"],
};

function tokenizeWordsStrict(lowerText) {
  return String(lowerText).toLowerCase().match(/\b[a-z0-9]+\b/g) || [];
}

/** Split on non-alphanumeric so hyphenated / slashed phrases still yield tokens. */
function tokenizeWordsLoose(lowerText) {
  return String(lowerText)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function allDocWords(text) {
  const s = String(text || "").toLowerCase();
  return [...new Set([...tokenizeWordsStrict(s), ...tokenizeWordsLoose(s)])];
}

/**
 * Expand shorthand query tokens (e.g. "ai" → artificial + intelligence).
 * Full words like "artificial" are left as-is.
 */
function expandQueryTokens(tokens) {
  const out = [];
  for (const t of tokens) {
    if (t.length < 2) continue;
    const exp = ACRONYM_EXPANSIONS[t];
    if (exp) out.push(...exp);
    else out.push(t);
  }
  return out;
}

function buildDocStemSet(text) {
  const stems = new Set();
  const words = allDocWords(text);
  for (const w of words) {
    stems.add(porterStem(w));
    const exp = ACRONYM_EXPANSIONS[w];
    if (exp) {
      for (const e of exp) stems.add(porterStem(e));
    }
  }
  return { stems, words };
}

/**
 * True if token t is matched by stem equality, acronym expansion on the doc side,
 * or (for longer tokens) prefix overlap with a document word.
 */
function tokenMatchesDocument(t, docStems, docWords) {
  const qt = porterStem(t);
  if (docStems.has(qt)) return true;

  if (t.length >= 3) {
    for (const dw of docWords) {
      if (dw.length >= t.length && dw.startsWith(t)) return true;
      if (t.length >= dw.length && dw.length >= 3 && t.startsWith(dw)) return true;
    }
  }

  if (qt.length >= 4) {
    for (const ds of docStems) {
      if (ds.length >= 4 && qt.length >= 4 && (ds.startsWith(qt) || qt.startsWith(ds)))
        return true;
    }
  }

  return false;
}

/**
 * Every query token (after acronym expansion) must match the document.
 */
function stemmedTokenMatch(text, query) {
  const q = String(query || "").trim().toLowerCase();
  const rawTokens = tokenizeWordsStrict(q).filter((t) => t.length >= 2);
  const tokens = expandQueryTokens(rawTokens);
  if (tokens.length === 0) return false;

  const { stems: docStems, words: docWords } = buildDocStemSet(text);
  return tokens.every((t) => tokenMatchesDocument(t, docStems, docWords));
}

/**
 * Match user query against a free-text corpus (research blurb, or title+abstract).
 * - Glob wildcards (*, ?): same rules as name search (regex).
 * - Otherwise: substring match first, then token + Porter stem + acronym expansion.
 */
export function researchCorpusMatchesQuery(text, query) {
  const raw = String(query || "").trim();
  if (!raw) return false;
  const lowerText = String(text || "").toLowerCase();
  const lowerQ = raw.toLowerCase();

  if (/[*?]/.test(raw)) {
    return wildcardQueryToRegex(raw).test(lowerText);
  }

  if (literalMatches(lowerText, lowerQ)) return true;

  return stemmedTokenMatch(text, raw);
}
