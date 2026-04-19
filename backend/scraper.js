import * as cheerio from "cheerio";
import fetch from "node-fetch";
import natural from "natural";

const BASE_URL = "https://engineering.purdue.edu";
const FACULTY_LIST_URL = `${BASE_URL}/ECE/People/Faculty`;

/**
 * Strips parenthetical role tags (e.g. "(area chair)") and normalizes whitespace
 * so displayed names are person names only.
 */
export function normalizeFacultyName(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.replace(/"/g, " ").replace(/^Dr\.\s*/i, "").trim();
  let prev;
  do {
    prev = s;
    s = s
      .replace(/\s*\([^)]*\)/g, " ")
      .replace(/\s*\uFF08[^\uFF09]*\uFF09/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } while (s !== prev);
  return s;
}

export async function scrapeFacultyList() {
  try {
    const response = await fetch(FACULTY_LIST_URL);
    const html = await response.text();
    const $ = cheerio.load(html);
    const facultyList = [];

    $('a[href*="/ECE/People/ptProfile"]').each((i, element) => {
      const href = $(element).attr("href");
      const name = normalizeFacultyName($(element).text());
      if (name && href && !facultyList.some((f) => f.profileUrl === href)) {
        facultyList.push({
          name,
          profileUrl: href.startsWith("http") ? href : `${BASE_URL}${href}`,
        });
      }
    });

    return facultyList;
  } catch (error) {
    console.error("Error scraping faculty list:", error);
    return [];
  }
}

async function scrapeFacultyProfile(profileUrl) {
  try {
    const response = await fetch(profileUrl);
    const html = await response.text();
    const $ = cheerio.load(html);

    let personalWebpage = "";

    $("strong, b").each((i, element) => {
      const text = $(element).text().trim();
      if (text.toLowerCase().includes("webpage")) {
        const nextElement = $(element).next("a");
        if (nextElement.length) {
          personalWebpage = nextElement.attr("href") || "";
        } else {
          const link = $(element).parent().find("a").first();
          if (link.length) personalWebpage = link.attr("href") || "";
        }
        return false;
      }
    });

    if (!personalWebpage) {
      $("p, div").each((i, element) => {
        const match = $(element)
          .text()
          .match(/Webpage:\s*(https?:\/\/[^\s]+)/i);
        if (match) {
          personalWebpage = match[1];
          return false;
        }
      });
    }

    if (!personalWebpage) {
      $("*:contains('Webpage:')").each((i, element) => {
        const link = $(element).find("a").first();
        if (link.length && link.attr("href")?.startsWith("http")) {
          personalWebpage = link.attr("href");
          return false;
        }
      });
    }

    let website = "";
    $("strong").each((i, element) => {
      const text = $(element).text().trim();
      if (text.toLowerCase().replace(/\s+/g, "").includes("webpage:")) {
        let nextSibling = $(element)[0].nextSibling;
        while (nextSibling) {
          if (
            nextSibling.nodeType === 1 &&
            nextSibling.tagName.toLowerCase() === "a"
          ) {
            website = $(nextSibling).attr("href") || "";
            break;
          }
          nextSibling = nextSibling.nextSibling;
        }
        if (website) return false;
      }
    });

    let researchAreas = "";
    const researchSection = $(
      'h3:contains("Research"), h2:contains("Research"), strong:contains("Research")',
    ).parent();
    if (researchSection.length) {
      researchAreas = researchSection
        .text()
        .replace(/Research.*?:/i, "")
        .trim();
    }

    if (researchAreas) {
      researchAreas = researchAreas
        .replace(
          /Research\s*Overview\s*Research Areas\s*Centers\s*Startups\s*Patents\s*Labs & Facilities\s*Faculty Bookshelf\s*Technical Reports\s*Research\s*/gi,
          "",
        )
        .replace(/^\s*Research\s+/i, "")
        .trim();
    }

    return { personalWebpage, website, researchAreas };
  } catch (error) {
    console.error(`Error scraping profile ${profileUrl}:`, error);
    return { personalWebpage: "", website: "", researchAreas: "" };
  }
}

export async function scrapeFacultyData() {
  console.log("Starting faculty data scraping...");
  const facultyList = await scrapeFacultyList();
  console.log(`Found ${facultyList.length} faculty members`);

  const facultyData = [];
  for (let i = 0; i < facultyList.length; i++) {
    const faculty = facultyList[i];
    console.log(`Scraping ${i + 1}/${facultyList.length}: ${faculty.name}`);
    const profileData = await scrapeFacultyProfile(faculty.profileUrl);
    facultyData.push({
      name: faculty.name,
      profileUrl: faculty.profileUrl,
      website: profileData.website,
      researchAreas: profileData.researchAreas,
    });
  }

  return facultyData;
}

export function searchByName(facultyData, query) {
  const regex = new RegExp(query.replace(/\*/g, ".*").replace(/\?/g, "."), "i");
  return facultyData.filter((faculty) =>
    regex.test(normalizeFacultyName(faculty.name)),
  );
}

export function searchByResearchArea(facultyData, query) {
  const stemmer = natural.PorterStemmer;
  const queryStem = stemmer.stem(query.toLowerCase());
  return facultyData.filter((faculty) => {
    const researchText = faculty.researchAreas.toLowerCase();
    if (researchText.includes(query.toLowerCase())) return true;
    return researchText
      .split(/\s+/)
      .some((word) => stemmer.stem(word) === queryStem);
  });
}
