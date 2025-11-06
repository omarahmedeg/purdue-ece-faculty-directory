import * as cheerio from "cheerio";
import fetch from "node-fetch";
import natural from "natural";

const BASE_URL = "https://engineering.purdue.edu";
const FACULTY_LIST_URL = `${BASE_URL}/ECE/People/Faculty`;

// Scrape the main faculty list page
async function scrapeFacultyList() {
  try {
    const response = await fetch(FACULTY_LIST_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    const facultyList = [];

    // Find all faculty member links
    $('a[href*="/ECE/People/ptProfile"]').each((i, element) => {
      const href = $(element).attr("href");
      const name = $(element).text().trim();

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

// Scrape individual faculty profile page
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
          const parent = $(element).parent();
          const link = parent.find("a").first();
          if (link.length) {
            personalWebpage = link.attr("href") || "";
          }
        }
        return false;
      }
    });

    if (!personalWebpage) {
      $("p, div").each((i, element) => {
        const text = $(element).text();
        const match = text.match(/Webpage:\s*(https?:\/\/[^\s]+)/i);
        if (match) {
          personalWebpage = match[1];
          return false;
        }
      });
    }

    if (!personalWebpage) {
      const contactSection = $("*:contains('Webpage:')");
      contactSection.each((i, element) => {
        const link = $(element).find("a").first();
        if (link.length && link.attr("href")) {
          const href = link.attr("href");
          if (href.startsWith("http")) {
            personalWebpage = href;
            return false;
          }
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
      'h3:contains("Research"), h2:contains("Research"), strong:contains("Research")'
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
          ""
        )
        .replace(/^\s*Research\s+/i, "")
        .trim();
    }

    return {
      personalWebpage,
      website,
      researchAreas,
    };
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

    //await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return facultyData;
}

// Search by name with wildcard support
export function searchByName(facultyData, query) {
  // Convert wildcard pattern to regex
  const pattern = query.replace(/\*/g, ".*").replace(/\?/g, ".").toLowerCase();

  const regex = new RegExp(pattern, "i");

  return facultyData.filter((faculty) => regex.test(faculty.name));
}

// Search by research area with stemming support
export function searchByResearchArea(facultyData, query) {
  const stemmer = natural.PorterStemmer;
  const queryStem = stemmer.stem(query.toLowerCase());

  return facultyData.filter((faculty) => {
    const researchText = faculty.researchAreas.toLowerCase();

    // Direct match
    if (researchText.includes(query.toLowerCase())) {
      return true;
    }

    // Stemmed match (stretch goal)
    const words = researchText.split(/\s+/);
    return words.some((word) => {
      const wordStem = stemmer.stem(word);
      return wordStem === queryStem;
    });
  });
}
