import express from "express";
import cors from "cors";
import {
  searchByName,
  searchByResearchArea,
  scrapeFacultyData,
} from "./scraper.js";
import {
  fetchAllScholarData,
  extensiveSearchByName,
  extensiveSearchByResearchArea,
} from "./scholar.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let facultyData = [];
let scholarData = {};
let lastScraped = null;
let scholarReady = false;

async function initializeData() {
  console.log("Initializing faculty data...");
  try {
    facultyData = await scrapeFacultyData();
    lastScraped = new Date();
    console.log(`Successfully scraped ${facultyData.length} faculty members`);

    console.log("Starting scholar data fetch in background...");
    fetchAllScholarData(facultyData)
      .then((data) => {
        scholarData = data;
        scholarReady = true;
        console.log("Scholar data ready!");
      })
      .catch((error) => {
        console.error("Error fetching scholar data:", error);
      });
  } catch (error) {
    console.error("Error initializing data:", error);
  }
}

app.get("/api/faculty/search/name", (req, res) => {
  const { query } = req.query;
  if (!query)
    return res.status(400).json({ error: "Query parameter is required" });
  const results = searchByName(facultyData, query);
  res.json({ results, count: results.length });
});

app.get("/api/faculty/search/research", (req, res) => {
  const { query } = req.query;
  if (!query)
    return res.status(400).json({ error: "Query parameter is required" });
  const results = searchByResearchArea(facultyData, query);
  res.json({ results, count: results.length });
});

app.get("/api/faculty/search/extensive/name", (req, res) => {
  const { query } = req.query;
  if (!query)
    return res.status(400).json({ error: "Query parameter is required" });
  if (!scholarReady)
    return res
      .status(503)
      .json({ error: "Scholar data is still loading.", scholarReady: false });
  const results = extensiveSearchByName(facultyData, scholarData, query);
  res.json({ results, count: results.length, scholarReady: true });
});

app.get("/api/faculty/search/extensive/research", (req, res) => {
  const { query } = req.query;
  if (!query)
    return res.status(400).json({ error: "Query parameter is required" });
  if (!scholarReady)
    return res
      .status(503)
      .json({ error: "Scholar data is still loading.", scholarReady: false });
  const results = extensiveSearchByResearchArea(
    facultyData,
    scholarData,
    query,
  );
  res.json({ results, count: results.length, scholarReady: true });
});

app.get("/api/faculty/refresh", async (req, res) => {
  try {
    facultyData = await scrapeFacultyData();
    lastScraped = new Date();
    scholarReady = false;
    fetchAllScholarData(facultyData)
      .then((data) => {
        scholarData = data;
        scholarReady = true;
        console.log("Scholar data refreshed!");
      })
      .catch((error) => {
        console.error("Error refreshing scholar data:", error);
      });
    res.json({
      message: "Data refreshed. Scholar data refreshing in background.",
      count: facultyData.length,
      lastScraped,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to refresh data" });
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeData();
});
