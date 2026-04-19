# Purdue ECE Faculty Search

A full-stack app for searching for faculty in the [Elmore Family School of Electrical and Computer Engineering](https://engineering.purdue.edu/ECE/People/Faculty) at Purdue University. The backend scrapes faculty data and enriches it with publication info (OpenAlex + Google Scholar). The frontend includes a search UI that provides information about faculty research areas, websites, recent publications, and “see more” links to external publication profiles.

## Project structure

- **`backend/`** — Node.js (Express) API that scrapes Purdue ECE faculty pages and fetches publication data.
- **`frontend/`** — React (Vite) app for searching by name or research area and viewing results.
- **`shared/`** — Wildcard query helper used by both backend and frontend.

## Running locally

From the repo root:

1. **Install dependencies**
   - Backend: `cd backend && npm install`
   - Frontend: `cd frontend && npm install`
2. **Start the backend**
   - `cd backend`
   - `npm start` (or `node server.js` if you prefer)
   - The server listens on `http://localhost:8080`.
3. **Start the frontend**
   - `cd frontend`
   - `npm run dev`
   - Default Vite port is **3000** (see `frontend/vite.config.js`). In development, API calls target **`http://localhost:8080`** unless you set **`VITE_API_BASE`**.

## Frontend

- Search by **name** or **research area**.
- **Wildcards:** The search box supports glob-style patterns (same rules as the API via `shared/wildcardPattern.js`):
  - **`*`** matches any run of characters (including none). Example: `tele*` matches “telephone”, “telemetry”, etc.
  - **`?`** matches exactly one character. Example: `wom?n` matches “woman” and “women”.
  - Other characters are literal; regex metacharacters in the query are escaped so they are not treated as regex syntax.
- **Research-area mode (extensive search):** The UI asks the backend to match against the **listed research-areas text** on each profile **and** each paper’s **title** and **abstract** (when abstracts are available from OpenAlex). Only the **first five** papers are listed per person; the search still considers **all** cached papers for that faculty when deciding if they are a hit.
- Results show name (linked to personal website when available), research areas, recent publications (with optional abstract snippets when present), and (when available) a **“See more”** button to an external publication profile. Matching text can be highlighted; if the match is only outside the visible blurb or first five papers, **“See more”** may be emphasized.

## Backend

- **Scrapes** [Purdue ECE Faculty](https://engineering.purdue.edu/ECE/People/Faculty): name, profile URL, personal website, research areas.
- **Enriches** results with recent publications from [OpenAlex](https://openalex.org/) and, where configured, [Google Scholar](https://scholar.google.com/). OpenAlex works can include reconstructed **abstracts** for search; Scholar-only rows usually have titles only.
- **Wildcards** (`*`, `?`) are supported on name and research endpoints via `shared/wildcardPattern.js`.
- **Endpoints:**
  - `GET /api/faculty/search/name?query=...` — Basic search by name.
  - `GET /api/faculty/search/research?query=...` — Basic search by research area (**profile `researchAreas` text only**).
  - `GET /api/faculty/search/extensive/name?query=...` — Name search with publications (returns 503 until scholar data is ready).
  - `GET /api/faculty/search/extensive/research?query=...` — Research-area search over **listed research areas**, **paper titles**, and **paper abstracts** (extensive mode; returns 503 until scholar data is ready).
  - `GET /api/faculty/status` — Returns cache / scrape status, including whether scholar data is ready.
  - `GET /api/faculty/refresh` — Rescrape faculty data and refresh the cache (background scholar fetch).
  - `POST /api/faculty/refresh` — Same as above, but using POST.

## Tech stack

- **Backend:** Node.js, Express, Cheerio (scraping), node-fetch, OpenAlex API, Google Scholar HTML parsing
- **Frontend:** React, Vite
