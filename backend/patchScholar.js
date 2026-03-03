/**
 * patchScholar.js
 *
 * Re-fetches scholar/paper data ONLY for the professors listed in
 * SCHOLAR_ID_OVERRIDES (using their Google Scholar IDs) and patches the
 * existing cache.json in-place.
 *
 * Run with:  node patchScholar.js
 */

import { readCache, writeCache } from "./dataStore.js";
import { fetchScholarPapers, SCHOLAR_ID_OVERRIDES } from "./scholar.js";

const currentYear = new Date().getFullYear();
const START_YEAR = currentYear - 5;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("Loading cache...");
  const { facultyData, scholarData, lastScraped } = readCache();

  if (!facultyData.length) {
    console.error("Cache is empty – run the full scrape first.");
    process.exit(1);
  }

  const targets = Object.keys(SCHOLAR_ID_OVERRIDES);
  console.log(`Patching ${targets.length} professors using Google Scholar IDs...\n`);

  let patched = 0;

  for (const name of targets) {
    const scholarId = SCHOLAR_ID_OVERRIDES[name];
    console.log(`[${patched + 1}/${targets.length}] ${name}  (Scholar ID: ${scholarId})`);

    // Verify the professor is actually in facultyData
    const inFaculty = facultyData.some((f) => f.name === name);
    if (!inFaculty) {
      console.warn(`  ⚠  "${name}" not found in facultyData – skipping`);
      continue;
    }

    const papers = await fetchScholarPapers(scholarId, START_YEAR);
    scholarData[name] = papers;
    console.log(`  ✓  ${papers.length} papers fetched`);
    patched++;

    // Polite delay between requests
    await delay(1500);
  }

  console.log(`\nWriting updated cache (${patched} professors patched)...`);
  writeCache({ facultyData, scholarData, lastScraped });
  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
