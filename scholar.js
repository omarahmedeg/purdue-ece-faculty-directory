import natural from "natural";

const OA_BASE = "https://api.openalex.org";
const PURDUE_ID = "I219193219";
const MAILTO = "mailto=scholar-tool@purdue.edu";

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
      `&select=display_name,publication_year,primary_location,doi,cited_by_count,id&${MAILTO}`;

    try {
      const res = await fetch(url);
      if (!res.ok) break;

      const data = await res.json();
      const works = data.results || [];

      for (const work of works) {
        const title = work.display_name || "";
        if (!title || isJunkTitle(title)) continue;

        const venue = work.primary_location?.source?.display_name || "";
        allPapers.push({
          title,
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

async function fetchProfessorPapers(professorName, startYear) {
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
  const regex = new RegExp(query.replace(/\*/g, ".*").replace(/\?/g, "."), "i");
  return facultyData
    .filter((f) => regex.test(f.name))
    .map((f) => ({ ...f, papers: scholarData[f.name] || [] }));
}

export function extensiveSearchByResearchArea(facultyData, scholarData, query) {
  const stemmer = natural.PorterStemmer;
  const queryStem = stemmer.stem(query.toLowerCase());
  const queryLower = query.toLowerCase();
  const results = [];

  for (const faculty of facultyData) {
    const papers = scholarData[faculty.name] || [];
    const researchText = (faculty.researchAreas || "").toLowerCase();

    const matchedInResearch =
      researchText.includes(queryLower) ||
      researchText.split(/\s+/).some((w) => stemmer.stem(w) === queryStem);

    const matchedInPapers = papers.some((paper) => {
      const text = paper.title.toLowerCase();
      return (
        text.includes(queryLower) ||
        text.split(/\s+/).some((w) => stemmer.stem(w) === queryStem)
      );
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
