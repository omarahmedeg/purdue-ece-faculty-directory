import express from "express";
import cors from "cors";
import {
  searchByName,
  searchByResearchArea,
  scrapeFacultyData,
} from "./scraper.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let facultyData = [];
let lastScraped = null;

// Scrape data on server start
async function initializeData() {
  console.log("Initializing faculty data...");
  try {
    facultyData = await scrapeFacultyData();
    lastScraped = new Date();
    console.log(`Successfully scraped ${facultyData.length} faculty members`);
  } catch (error) {
    console.error("Error initializing data:", error);
  }
}

app.get("/api/faculty/search/name", (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Query parameter is required" });
  }

  const results = searchByName(facultyData, query);
  res.json({ results, count: results.length });
});

app.get("/api/faculty/search/research", (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Query parameter is required" });
  }

  const results = searchByResearchArea(facultyData, query);
  res.json({ results, count: results.length });
});

app.get("/api/faculty/refresh", async (req, res) => {
  try {
    facultyData = await scrapeFacultyData();
    lastScraped = new Date();
    res.json({
      message: "Data refreshed successfully",
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
