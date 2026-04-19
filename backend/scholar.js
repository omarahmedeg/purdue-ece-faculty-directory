import { normalizeFacultyName } from "./scraper.js";
import { wildcardQueryToRegex } from "../shared/wildcardPattern.js";

const OA_BASE = "https://api.openalex.org";
const PURDUE_ID = "I219193219";
const MAILTO = "mailto=scholar-tool@purdue.edu";

/**
 * Manual Google Scholar user-ID overrides for professors whose names are not
 * matched correctly by the OpenAlex heuristic.
 * Key   = exact faculty name as it appears in facultyData[i].name
 * Value = Google Scholar user= query parameter
 */
export const SCHOLAR_ID_OVERRIDES = {
  "Stanislaw H. Zak": "AFuo5foAAAAJ",
  "Arnold Chung-Ye Chen": "e3JrBMIAAAAJ",
  "Can Wu": "y9K8qzkAAAAJ",
  "Doosan Back": "pIXPFcUAAAAJ",
  "Ali Shakouri": "9nsAf-sAAAAJ",
  "Younghyun Kim": "ac0WJaEAAAAJ",
  "Lu Su": "38RuCN4AAAAJ",
  "Vikram Jain": "uYVMSsEAAAAJ",
  "Chaoyue Liu": "sRjoMX0AAAAJ",
  "Byunghoo Jung": "vL-XiVAAAAAJ",
  "Junjie Qin": "k2y63QMAAAAJ",
  "Michael Manfra": "kM2BBwkAAAAJ",
  "Gesualdo Scutari": "CKsVJugAAAAJ",
};

const JUNK_TITLE_PATTERNS = [
  /^ieee computer society/i,
  /^ieee comp\.? soc/i,
  /^committees?$/i,
  /^editorial(?: board)?$/i,
  /^editor['']?s? note/i,
  /^erratum/i,
  /^corrigendum/i,
  /^correction to/i,
  /^table of contents/i,
  /^front matter/i,
  /^back matter/i,
  /^title page/i,
  /^index$/i,
  /^preface$/i,
  /^foreword$/i,
  /^acknowledgment/i,
  /^guest editor/i,
  /^message from/i,
  /^letter from/i,
  /^in memoriam/i,
  /^ieee computer society information/i,
  /^ieee .{0,30} information$/i,
];

function isJunkTitle(title) {
  if (!title || title.length < 5) return true;
  return JUNK_TITLE_PATTERNS.some((p) => p.test(title.trim()));
}

/**
 * OpenAlex stores abstracts as an inverted index (word -> positions).
 * Reconstructs plain text for search and display.
 */
function abstractFromInvertedIndex(inv) {
  if (!inv || typeof inv !== "object") return "";
  let max = -1;
  for (const positions of Object.values(inv)) {
    const list = Array.isArray(positions) ? positions : [positions];
    for (const p of list) {
      const n = Number(p);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  if (max < 0) return "";
  const words = new Array(max + 1);
  for (const [word, positions] of Object.entries(inv)) {
    const list = Array.isArray(positions) ? positions : [positions];
    for (const pos of list) {
      const i = Number(pos);
      if (Number.isFinite(i) && i >= 0) words[i] = word;
    }
  }
  return words.filter(Boolean).join(" ");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanName(raw) {
  return raw
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/"/g, " ")
    .replace(/^Dr\.\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_ALIASES = {
  "james davis": "james c. davis",
};

async function findOpenAlexAuthorId(professorName) {
  const raw = cleanName(professorName);
  const name = NAME_ALIASES[raw.toLowerCase()] ?? raw;
  const nameParts = name.split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts[nameParts.length - 1];
  const firstLast = nameParts.length > 1 ? `${firstName} ${lastName}` : name;

  const searchVariants = [name];
  if (firstLast !== name) searchVariants.push(firstLast);

  for (const searchTerm of searchVariants) {
    const searchName = encodeURIComponent(searchTerm);
    const urls = [
      `${OA_BASE}/authors?search=${searchName}&filter=last_known_institutions.id:${PURDUE_ID}&per_page=10&${MAILTO}`,
      `${OA_BASE}/authors?search=${searchName}&filter=affiliations.institution.id:${PURDUE_ID}&per_page=10&${MAILTO}`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;

        const data = await res.json();
        if (!data.results?.length) continue;

        const nameLower = name.toLowerCase();
        const firstLower = firstName.toLowerCase();
        const lastLower = lastName.toLowerCase();
        let best = null;
        let bestScore = -1;

        for (const author of data.results) {
          const displayName = (author.display_name || "").toLowerCase();
          const resultParts = displayName.split(/\s+/);
          const resultFirst = resultParts[0];
          const resultLast = resultParts[resultParts.length - 1];
          let score = 0;

          if (displayName === nameLower) score += 100;
          if (lastLower === resultLast) score += 60;
          else continue;

          if (firstLower === resultFirst) score += 40;
          else if (firstLower[0] === resultFirst[0]) score += 15;

          const targetMiddle = nameParts
            .slice(1, -1)
            .map((p) => p.toLowerCase().replace(/\./g, ""));
          const resultMiddle = resultParts
            .slice(1, -1)
            .map((p) => p.toLowerCase().replace(/\./g, ""));
          for (const tm of targetMiddle) {
            for (const rm of resultMiddle) {
              if (tm === rm) score += 15;
              else if (tm[0] === rm[0]) score += 5;
            }
          }

          score += Math.min((author.works_count || 0) / 10, 20);

          if (score > bestScore) {
            bestScore = score;
            best = author;
          }
        }

        if (best && bestScore >= 60) {
          const shortId = best.id.replace("https://openalex.org/", "");
          console.log(
            `  Found: "${best.display_name}" (${shortId}, score:${Math.round(bestScore)}, works:${best.works_count})`,
          );
          return shortId;
        }
      } catch (err) {
        console.warn(`  OpenAlex search error: ${err.message}`);
      }
    }
  }

  return null;
}

async function fetchAuthorPapers(authorId, startYear) {
  const allPapers = [];
  let cursor = "*";
  const PER_PAGE = 200;

  while (cursor) {
    const url =
      `${OA_BASE}/works?filter=author.id:${authorId},publication_year:>${startYear - 1}` +
      `&sort=publication_year:desc&per_page=${PER_PAGE}&cursor=${cursor}` +
      `&select=display_name,publication_year,primary_location,doi,cited_by_count,id,abstract_inverted_index&${MAILTO}`;

    try {
      const res = await fetch(url);
      if (!res.ok) break;

      const data = await res.json();
      const works = data.results || [];

      for (const work of works) {
        const title = work.display_name || "";
        if (!title || isJunkTitle(title)) continue;

        const venue = work.primary_location?.source?.display_name || "";
        const abstract = abstractFromInvertedIndex(
          work.abstract_inverted_index,
        );
        allPapers.push({
          title,
          abstract,
          url:
            work.doi ||
            `https://openalex.org/${work.id?.replace("https://openalex.org/", "")}`,
          meta: venue || String(work.publication_year),
          year: work.publication_year,
          citedBy: work.cited_by_count || 0,
        });
      }

      cursor = data.meta?.next_cursor || null;
      if (works.length < PER_PAGE) break;
      await delay(100);
    } catch (err) {
      console.warn(`  Papers fetch error: ${err.message}`);
      break;
    }
  }

  const seen = new Map();
  for (const paper of allPapers) {
    const key = paper.title.toLowerCase().trim().replace(/\s+/g, " ");
    const existing = seen.get(key);
    if (!existing || (paper.citedBy || 0) > (existing.citedBy || 0)) {
      seen.set(key, paper);
    }
  }

  return [...seen.values()].sort((a, b) => (b.year || 0) - (a.year || 0));
}

/**
 * Fetch recent papers from a Google Scholar profile page.
 * Parses the public citations list sorted by date.
 * @param {string} scholarId  - The `user=` value from the Scholar URL
 * @param {number} startYear  - Only include papers >= this year
 * @returns {Promise<Array>}
 */
export async function fetchScholarPapers(scholarId, startYear) {
  const allPapers = [];
  let start = 0;
  const pageSize = 100;

  while (true) {
    const url =
      `https://scholar.google.com/citations?user=${scholarId}&hl=en` +
      `&view_op=list_works&sortby=pubdate&cstart=${start}&pagesize=${pageSize}`;

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; PurdueECEDirectoryBot/1.0; +https://engineering.purdue.edu)",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!res.ok) {
        console.warn(`  Scholar fetch HTTP ${res.status} for ${scholarId}`);
        break;
      }

      const html = await res.text();
      const cheerio = await import("cheerio");
      const $ = cheerio.load(html);

      const rows = $("tr.gsc_a_tr");
      if (rows.length === 0) break;

      let foundOld = false;
      rows.each((_, row) => {
        const titleEl = $(row).find("a.gsc_a_at");
        const title = titleEl.text().trim();
        if (!title || isJunkTitle(title)) return;

        const yearText = $(row).find(".gsc_a_y span").text().trim();
        const year = yearText ? parseInt(yearText, 10) : null;

        if (year && year < startYear) {
          foundOld = true;
          return false; // break .each — list is sorted newest-first
        }

        const href = titleEl.attr("href") || "";
        const paperUrl = href
          ? `https://scholar.google.com${href}`
          : `https://scholar.google.com/citations?user=${scholarId}`;

        const venue =
          $(row).find(".gs_gray").last().text().trim() ||
          $(row).find(".gsc_a_j .gs_gray").text().trim();

        const citedByText = $(row).find(".gsc_a_c a").text().trim();
        const citedBy = citedByText ? parseInt(citedByText, 10) || 0 : 0;

        allPapers.push({
          title,
          abstract: "",
          url: paperUrl,
          meta: venue || (year ? String(year) : ""),
          year: year || null,
          citedBy,
        });
      });

      // If the page had fewer rows than pageSize, or we hit old papers, stop
      if (rows.length < pageSize || foundOld) break;
      start += pageSize;
      await delay(500); // be polite to Google
    } catch (err) {
      console.warn(`  Scholar scrape error for ${scholarId}: ${err.message}`);
      break;
    }
  }

  // Deduplicate by title
  const seen = new Map();
  for (const paper of allPapers) {
    const key = paper.title.toLowerCase().trim().replace(/\s+/g, " ");
    const existing = seen.get(key);
    if (!existing || (paper.citedBy || 0) > (existing.citedBy || 0)) {
      seen.set(key, paper);
    }
  }

  return [...seen.values()].sort((a, b) => (b.year || 0) - (a.year || 0));
}

async function fetchProfessorPapers(professorName, startYear) {
  // Check for a manual Google Scholar ID override first
  const scholarId = SCHOLAR_ID_OVERRIDES[professorName];
  if (scholarId) {
    console.log(
      `  Using Google Scholar override (${scholarId}) for "${professorName}"`,
    );
    const papers = await fetchScholarPapers(scholarId, startYear);
    if (papers.length > 0) return papers;
    console.log(
      `  Scholar override returned 0 papers, falling back to OpenAlex...`,
    );
  }

  try {
    const authorId = await findOpenAlexAuthorId(professorName);
    if (!authorId) {
      console.log(`  No OpenAlex profile found for "${professorName}"`);
      return [];
    }
    return await fetchAuthorPapers(authorId, startYear);
  } catch (error) {
    console.error(
      `  Error fetching papers for "${professorName}":`,
      error.message,
    );
    return [];
  }
}

export async function fetchAllScholarData(facultyData) {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;
  const scholarData = {};
  let fetched = 0;
  let skipped = 0;

  for (let i = 0; i < facultyData.length; i++) {
    const name = facultyData[i].name;
    console.log(`[Scholar] ${i + 1}/${facultyData.length}: ${name}`);

    const papers = await fetchProfessorPapers(name, startYear);
    scholarData[name] = papers;

    if (papers.length > 0) fetched++;
    else skipped++;

    console.log(`  => ${papers.length} papers`);

    if (i < facultyData.length - 1) await delay(100);
  }

  console.log(
    `\nScholar fetch complete! ${fetched} with papers, ${skipped} without.`,
  );
  return scholarData;
}

export function extensiveSearchByName(facultyData, scholarData, query) {
  const regex = wildcardQueryToRegex(query.trim());
  return facultyData
    .filter((f) => regex.test(normalizeFacultyName(f.name)))
    .map((f) => ({ ...f, papers: scholarData[f.name] || [] }));
}

export function extensiveSearchByResearchArea(facultyData, scholarData, query) {
  const regex = wildcardQueryToRegex(query.trim());
  const results = [];

  for (const faculty of facultyData) {
    const papers = scholarData[faculty.name] || [];
    const researchText = (faculty.researchAreas || "").toLowerCase();

    const matchedInResearch = regex.test(researchText);

    const matchedInPapers = papers.some((paper) => {
      const title = (paper.title || "").toLowerCase();
      const abs = (paper.abstract || "").toLowerCase();
      return regex.test(title) || regex.test(abs);
    });

    if (matchedInResearch || matchedInPapers) {
      results.push({
        ...faculty,
        papers,
        matchSource: matchedInResearch
          ? matchedInPapers
            ? "both"
            : "research_areas"
          : "papers",
      });
    }
  }

  return results;
}
