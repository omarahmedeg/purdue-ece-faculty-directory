# Purdue ECE Faculty Search

A full-stack app for searching for faculty in the [Elmore Family School of Electrical and Computer Engineering](https://engineering.purdue.edu/ECE/People/Faculty) at Purdue University. The backend scrapes faculty data and enriches it with publication info from OpenAlex. The frontend includes a search UI that provides informoation about faculty research areas websites, and recent publications.

## Project structure

- **`backend/`** — Node.js (Express) API that scrapes Purdue ECE faculty pages and fetches OpenAlex publication data.
- **`frontend/`** — React (Vite) app for searching by name or research area and viewing results.

## Frontend

- Search by **name** or **research area**
- Results show name (linked to personal website when available), research areas, and recent publications
- Proxies `/api` to the backend (see `frontend/vite.config.js`)

## Backend

- **Scrapes** [Purdue ECE Faculty](https://engineering.purdue.edu/ECE/People/Faculty): name, profile URL, personal website, research areas.
- **Enriches** results with recent publications from [OpenAlex](https://openalex.org/) (in background after startup).
- **Endpoints:**
  - `GET /api/faculty/search/name?query=...` — Basic search by name.
  - `GET /api/faculty/search/research?query=...` — Basic search by research area.
  - `GET /api/faculty/search/extensive/name?query=...` — Name search with publications (returns 503 until scholar data is ready).
  - `GET /api/faculty/search/extensive/research?query=...` — Research-area search with publications.
  - `GET /api/faculty/refresh` — Rescrape faculty data and refresh in-memory cache.

## Tech stack

- **Backend:** Node.js, Express, Cheerio (scraping), node-fetch, natural (stemming), OpenAlex API
- **Frontend:** React, Vite
