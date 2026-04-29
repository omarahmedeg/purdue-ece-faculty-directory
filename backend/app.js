import express from "express";
import cors from "cors";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  normalizeFacultyName,
  searchByName,
  searchByResearchArea,
  scrapeFacultyData,
} from "./scraper.js";
import {
  fetchAllScholarData,
  extensiveSearchByName,
  extensiveSearchByResearchArea,
} from "./scholar.js";
import { readCache, writeCache } from "./dataStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEE_MORE_OVERRIDES_PATH = path.join(__dirname, "see-more-overrides.json");
const SEE_MORE_PLACEHOLDER = "https://example.com/REPLACE_WITH_REAL_LINK";

function loadSeeMoreOverrides() {
  try {
    return JSON.parse(readFileSync(SEE_MORE_OVERRIDES_PATH, "utf8"));
  } catch {
    return {};
  }
}

function lookupSeeMoreUrl(rawName, seeMoreOverrides) {
  const candidates = [rawName, normalizeFacultyName(rawName)];
  for (const key of candidates) {
    const u = seeMoreOverrides[key]?.seeMoreUrl;
    if (u && u !== SEE_MORE_PLACEHOLDER) return u;
  }
  const target = normalizeFacultyName(rawName);
  for (const k of Object.keys(seeMoreOverrides)) {
    if (normalizeFacultyName(k) === target) {
      const u = seeMoreOverrides[k]?.seeMoreUrl;
      if (u && u !== SEE_MORE_PLACEHOLDER) return u;
    }
  }
  return null;
}

function applySeeMoreOverrides(results) {
  const seeMoreOverrides = loadSeeMoreOverrides();
  return results.map((r) => {
    const seeMoreUrl = lookupSeeMoreUrl(r.name, seeMoreOverrides);
    return { ...r, name: normalizeFacultyName(r.name), seeMoreUrl };
  });
}

function withNormalizedNames(results) {
  return results.map((r) => ({ ...r, name: normalizeFacultyName(r.name) }));
}

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res
    .status(200)
    .type("text")
    .send("Purdue ECE Faculty Directory API is running.");
});

// ── In-memory state (loaded from cache at startup) ──────────────────────────
let facultyData = [];
let scholarData = {};
let lastScraped = null;
let scholarReady = false;
let refreshInProgress = false;

function loadFromCache() {
  const cache = readCache();
  facultyData = cache.facultyData;
  scholarData = cache.scholarData;
  lastScraped = cache.lastScraped;
  scholarReady = Object.keys(scholarData).length > 0 && facultyData.length > 0;
  console.log(
    `Cache loaded: ${facultyData.length} faculty, scholarReady=${scholarReady}`,
  );
}

async function runScrapeAndCache() {
  console.log("Scraping faculty data...");
  facultyData = await scrapeFacultyData();
  lastScraped = new Date().toISOString();
  scholarReady = false;

  writeCache({ facultyData, scholarData, lastScraped });
  console.log(
    `Scraped ${facultyData.length} faculty members. Fetching scholar data in background...`,
  );

  fetchAllScholarData(facultyData)
    .then((data) => {
      scholarData = data;
      scholarReady = true;
      writeCache({ facultyData, scholarData, lastScraped });
      console.log("Scholar data ready and cache updated!");
    })
    .catch((err) => {
      console.error("Error fetching scholar data:", err);
    })
    .finally(() => {
      refreshInProgress = false;
    });
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/api/faculty/search/name", (req, res) => {
  const { query } = req.query;
  if (!query)
    return res.status(400).json({ error: "Query parameter is required" });
  const results = searchByName(facultyData, query);
  res.json({ results: withNormalizedNames(results), count: results.length });
});

app.get("/api/faculty/search/research", (req, res) => {
  const { query } = req.query;
  if (!query)
    return res.status(400).json({ error: "Query parameter is required" });
  const results = searchByResearchArea(facultyData, query);
  res.json({ results: withNormalizedNames(results), count: results.length });
});

app.get("/api/faculty/search/extensive/name", (req, res) => {
  const { query } = req.query;
  if (!query)
    return res.status(400).json({ error: "Query parameter is required" });
  if (!scholarReady)
    return res
      .status(503)
      .json({ error: "Scholar data is still loading.", scholarReady: false });
  const results = applySeeMoreOverrides(
    extensiveSearchByName(facultyData, scholarData, query),
  );
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
  const results = applySeeMoreOverrides(
    extensiveSearchByResearchArea(facultyData, scholarData, query),
  );
  res.json({ results, count: results.length, scholarReady: true });
});

app.get("/api/faculty/status", (req, res) => {
  res.json({
    facultyCount: facultyData.length,
    scholarReady,
    lastScraped,
    refreshInProgress,
  });
});

app.post("/api/faculty/refresh", (req, res) => {
  if (refreshInProgress) {
    return res
      .status(409)
      .json({
        message: "A refresh is already in progress.",
        refreshInProgress,
      });
  }
  refreshInProgress = true;

  runScrapeAndCache().catch((err) => {
    console.error("Refresh failed:", err);
    refreshInProgress = false;
  });

  res.json({
    message:
      "Refresh started. Faculty data will be available shortly; scholar data will follow. Poll /api/faculty/status for progress.",
    refreshInProgress: true,
  });
});

app.get("/api/faculty/refresh", (req, res) => {
  if (refreshInProgress) {
    return res
      .status(409)
      .json({
        message: "A refresh is already in progress.",
        refreshInProgress,
      });
  }
  refreshInProgress = true;

  runScrapeAndCache().catch((err) => {
    console.error("Refresh failed:", err);
    refreshInProgress = false;
  });

  res.json({
    message:
      "Refresh started. Faculty data will be available shortly; scholar data will follow. Poll /api/faculty/status for progress.",
    refreshInProgress: true,
  });
});

// Initialize cache on module load (works for local + serverless cold starts)
loadFromCache();

// NOTE: Do not auto-scrape on cold start in serverless environments (e.g. Vercel).
// Scraping is network-heavy and can time out / crash invocations. Use /api/faculty/refresh explicitly.

// Defensive: keep serverless invocations from crashing on unhandled errors.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;

