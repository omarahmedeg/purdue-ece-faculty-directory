import { useState } from "react";
import bannerImage from "../bannerImage.png";

export default function App() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("name");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setHasSearched(true);
    setLoading(true);
    setError(null);
    try {
      const extensiveEndpoint =
        searchType === "name"
          ? `/api/faculty/search/extensive/name?query=${encodeURIComponent(
              query
            )}`
          : `/api/faculty/search/extensive/research?query=${encodeURIComponent(
              query
            )}`;
      const basicEndpoint =
        searchType === "name"
          ? `/api/faculty/search/name?query=${encodeURIComponent(query)}`
          : `/api/faculty/search/research?query=${encodeURIComponent(query)}`;

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
      setResults(data.results || []);
      if (data.scholarReady) setError(null);
    } catch (err) {
      setError(
        "Could not reach the server. Is the backend running on port 3001?"
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="app-header">
        <img src={bannerImage} alt="Purdue University" className="banner-image" />
      </header>
      <main className="app-main">
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
              {results.length} {results.length === 1 ? "result" : "results"} found
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
                    {f.name}
                  </a>
                ) : (
                  <span className="professor-name-plain">{f.name}</span>
                )}
                <div className="research">
                  {f.researchAreas && (
                    <>
                      <strong className="research-areas-heading">Research areas</strong>
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
                      <div className="no-publications-msg">No publication data available.</div>
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
