import { useState } from "react";
import bannerImage from "../bannerImage.png";

/** Strip role tags in parentheses (e.g. "area chair") so cards show personal names only. */
function facultyDisplayName(raw) {
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

/** Name search must match the visible name only, not hidden role text like "(area chair)". */
function nameQueryMatchesDisplay(rawName, query) {
  const display = facultyDisplayName(rawName);
  const pattern = query.replace(/\*/g, ".*").replace(/\?/g, ".");
  try {
    return new RegExp(pattern, "i").test(display);
  } catch {
    return display.toLowerCase().includes(query.toLowerCase());
  }
}

export default function App() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("name");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setHasSearched(true);
    setLoading(true);
    setError(null);
    const API_BASE =
      "https://purdue-ece-faculty-1059389140575.us-central1.run.app";
    try {
      const extensiveEndpoint =
        searchType === "name"
          ? `${API_BASE}/api/faculty/search/extensive/name?query=${encodeURIComponent(
              query
            )}`
          : `${API_BASE}/api/faculty/search/extensive/research?query=${encodeURIComponent(
              query
            )}`;
      const basicEndpoint =
        searchType === "name"
          ? `${API_BASE}/api/faculty/search/name?query=${encodeURIComponent(
              query
            )}`
          : `${API_BASE}/api/faculty/search/research?query=${encodeURIComponent(
              query
            )}`;

      let res = await fetch(extensiveEndpoint);
      let data = await res.json();

      if (res.status === 503) {
        res = await fetch(basicEndpoint);
        data = await res.json();
        if (res.ok)
          setError("Scholar data still loading. Showing basic results.");
      }
      if (!res.ok) {
        setError(data.error || "Search failed");
        setResults([]);
        return;
      }
      let list = data.results || [];
      if (searchType === "name") {
        list = list.filter((f) => nameQueryMatchesDisplay(f.name, query.trim()));
      }
      setResults(list);
      if (data.scholarReady) setError(null);
    } catch (err) {
      setError("Could not reach the server. Please try again later.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="app-header">
        <img
          src={bannerImage}
          alt="Purdue University"
          className="banner-image"
        />
      </header>
      <main className="app-main">
        <button
          type="button"
          className="info-button"
          onClick={() => setShowInfo(true)}
          aria-label="About this site"
        >
          i
        </button>
        {showInfo && (
          <div
            className="info-overlay"
            onClick={() => setShowInfo(false)}
            aria-hidden="true"
          >
            <div
              className="info-box"
              role="dialog"
              aria-modal="false"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="info-box-header">
                <span className="info-box-title">About this tool!</span>
              </div>
              <p>
                This site allows you to explore Purdue ECE faculty by name or
                research area, including recent publications pulled from Google
                Scholar and OpenAlex. To get view more information about a
                faculty member, click the "See more" button.
              </p>
            </div>
          </div>
        )}
        <h1>Purdue ECE Faculty Directory</h1>
        <p className="subtitle">
          Search and explore faculty members by name or research area
        </p>
        <form onSubmit={handleSearch}>
          <div className="search-row">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                searchType === "name"
                  ? "Enter faculty name"
                  : "Enter research area"
              }
            />
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
            >
              <option value="name">Name</option>
              <option value="research">Research area</option>
            </select>
            <button type="submit" disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
          <hr className="separator" />
        </form>
        {error && <p className="message error">{error}</p>}
        {hasSearched && !error && results.length === 0 && !loading && (
          <p className="message">No faculty found.</p>
        )}
        {results.length > 0 && (
          <div className="results-container">
            <p className="results-count">
              {results.length} {results.length === 1 ? "result" : "results"}{" "}
              found
            </p>
            <ul className="results">
              {results.map((f) => (
                <li key={f.profileUrl}>
                  {f.website ? (
                    <a
                      href={f.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {facultyDisplayName(f.name)}
                    </a>
                  ) : (
                    <span className="professor-name-plain">
                      {facultyDisplayName(f.name)}
                    </span>
                  )}
                  <div className="research">
                    {f.researchAreas && (
                      <>
                        <strong className="research-areas-heading">
                          Research areas
                        </strong>
                        <div>{f.researchAreas}</div>
                      </>
                    )}
                    <div className="openalex">
                      <strong>Recent publications</strong>
                      {f.papers?.length > 0 ? (
                        <ul>
                          {f.papers.slice(0, 5).map((p, i) => (
                            <li key={i}>
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {p.title}
                              </a>
                              {p.year && ` (${p.year})`}
                              {p.citedBy > 0 && ` — ${p.citedBy} citations`}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="no-publications-msg">
                          No publication data available.
                        </div>
                      )}
                      {f.seeMoreUrl && (
                        <a
                          href={f.seeMoreUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="scholar-link-button"
                        >
                          See more
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </>
  );
}
