import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import FilterBar from "../components/FilterBar.jsx";
import { pickDomain, writeStoredDomain } from "../lib/domain.js";
import { applyLocalFilters, emptyFilters } from "../lib/filters.js";
import {
  createCluster,
  deleteCluster,
  deleteClusterKeyword,
  deleteQuery,
  getCluster,
  getClusterContent,
  listClusters,
  listDomains,
  listQueries,
  listShortlisted,
  patchCluster,
  patchKeyword,
  startContent,
} from "../api";

function domainLabel(d) {
  return d.display_name || d.domain_url || d.id;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollCluster(id) {
  for (let i = 0; i < 40; i += 1) {
    const res = await getCluster(id, false);
    const row = res.data;
    if (row.status === "ready" || row.status === "failed") return row;
    await sleep(2000);
  }
  return (await getCluster(id, false)).data;
}

async function pollContent(id) {
  for (let i = 0; i < 60; i += 1) {
    const res = await getClusterContent(id);
    const row = res.data;
    if (row.content_status === "ready" || row.content_status === "failed") return row;
    await sleep(2500);
  }
  return (await getClusterContent(id)).data;
}

const INTENTS = ["informational", "commercial", "transactional", "navigational"];

export default function Library() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [domains, setDomains] = useState([]);
  const [domainId, setDomainId] = useState(params.get("domain_id") || "");
  const [tab, setTab] = useState("shortlisted");
  const [queries, setQueries] = useState(null);
  const [shortlisted, setShortlisted] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [selectedQueryId, setSelectedQueryId] = useState("");
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [cluster, setCluster] = useState(null);
  const [content, setContent] = useState(null);
  const [showBrief, setShowBrief] = useState(false);
  const [briefTab, setBriefTab] = useState("brief");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [building, setBuilding] = useState(false);
  const [contentBusy, setContentBusy] = useState(false);
  const [filters, setFilters] = useState({ ...emptyFilters(), queryId: "all" });
  const [error, setError] = useState("");

  useEffect(() => {
    listDomains()
      .then((res) => {
        const rows = Array.isArray(res?.data) ? res.data : [];
        setDomains(rows);
        const nextId = pickDomain(rows, domainId || params.get("domain_id"));
        if (nextId && nextId !== domainId) setDomainId(nextId);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function refreshLists(id) {
    const [q, s, c] = await Promise.all([
      listQueries(id),
      listShortlisted(id),
      listClusters(id),
    ]);
    setQueries(q.data);
    setShortlisted(s?.data?.items || []);
    const cl = c?.data?.items || [];
    setClusters(cl);
    setSelectedQueryId((cur) => cur || q.data?.items?.[0]?.id || "");
    setSelectedClusterId((cur) => cur || cl[0]?.id || "");
  }

  useEffect(() => {
    if (!domainId) return;
    writeStoredDomain(domainId);
    const next = new URLSearchParams(params);
    next.set("domain_id", domainId);
    setParams(next, { replace: true });
    setSelectedQueryId("");
    setSelectedClusterId("");
    setCluster(null);
    refreshLists(domainId).catch((e) => setError(e.message));
  }, [domainId]);

  useEffect(() => {
    if (tab !== "clusters") return;
    if (!selectedClusterId) {
      if (clusters[0]?.id) setSelectedClusterId(clusters[0].id);
      return;
    }
    setShowBrief(false);
    setContent(null);
    setEditing(false);
    setCluster(null);
    getCluster(selectedClusterId, false)
      .then((r) => setCluster(r.data))
      .catch((e) => setError(e.message));
  }, [tab, selectedClusterId]);

  const domain = domains.find((d) => d.id === domainId);
  const queryItems = queries?.items || [];
  const qCount = queryItems.length;
  const cCount = clusters.length;

  const shownShortlist = useMemo(() => {
    let rows = shortlisted;
    if (filters.queryId && filters.queryId !== "all") {
      rows = rows.filter((k) => k.query_id === filters.queryId);
    }
    return applyLocalFilters(rows, filters);
  }, [shortlisted, filters]);

  async function onBuild(keywordId) {
    setBuilding(true);
    setError("");
    try {
      const started = await createCluster(keywordId);
      const id = started?.data?.id;
      setTab("clusters");
      setSelectedClusterId(id);
      setCluster(null);
      setShowBrief(false);
      setContent(null);
      const row = await pollCluster(id);
      setCluster(row);
      await refreshLists(domainId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBuilding(false);
    }
  }

  async function onGenerateContent() {
    if (!selectedClusterId) return;
    setContentBusy(true);
    setError("");
    setShowBrief(false);
    try {
      await startContent(selectedClusterId);
      const row = await pollContent(selectedClusterId);
      setContent(row);
      const cl = await getCluster(selectedClusterId, false);
      setCluster(cl.data);
      if (row.content_status === "ready") {
        setBriefTab("brief");
        setShowBrief(true);
      } else {
        setError(row.content_error || "Content generation failed");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setContentBusy(false);
    }
  }

  async function onDeleteQuery(id) {
    if (!id || !window.confirm("Delete this generate job and its keyword ideas?")) return;
    setError("");
    try {
      await deleteQuery(id);
      if (selectedQueryId === id) setSelectedQueryId("");
      await refreshLists(domainId);
    } catch (e) {
      setError(e.message);
    }
  }

  async function onDeleteCluster() {
    if (!selectedClusterId || !window.confirm("Delete this cluster?")) return;
    setError("");
    try {
      await deleteCluster(selectedClusterId);
      setCluster(null);
      setContent(null);
      setShowBrief(false);
      setSelectedClusterId("");
      await refreshLists(domainId);
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit() {
    setDraft({
      name: cluster.name || "",
      intent: INTENTS.includes(cluster.intent) ? cluster.intent : "informational",
      title: cluster.title || "",
      h1: cluster.h1 || "",
      keywords: (cluster.keywords || []).map((k) => ({ id: k.id, keyword: k.keyword })),
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(null);
  }

  function setDraftKeyword(id, keyword) {
    setDraft((cur) => ({
      ...cur,
      keywords: cur.keywords.map((row) => (row.id === id ? { ...row, keyword } : row)),
    }));
  }

  async function saveEdit() {
    if (!selectedClusterId || !draft) return;
    setError("");
    const payload = {};
    const name = draft.name.trim();
    const title = draft.title.trim().slice(0, 70);
    const h1 = draft.h1.trim().slice(0, 70);
    if (name && name !== (cluster.name || "")) payload.name = name;
    if (INTENTS.includes(draft.intent) && draft.intent !== (cluster.intent || "")) {
      payload.intent = draft.intent;
    }
    if (title !== (cluster.title || "")) payload.title = title;
    if (h1 !== (cluster.h1 || "")) payload.h1 = h1;
    const changedKw = (draft.keywords || []).filter((row) => {
      const orig = (cluster.keywords || []).find((k) => k.id === row.id);
      return orig && row.keyword.trim() && row.keyword.trim() !== orig.keyword;
    }).map((row) => ({ id: row.id, keyword: row.keyword.trim() }));
    if (changedKw.length) payload.keywords = changedKw;
    if (!Object.keys(payload).length) {
      cancelEdit();
      return;
    }
    try {
      const res = await patchCluster(selectedClusterId, payload);
      setCluster(res.data);
      setClusters((rows) =>
        rows.map((row) =>
          row.id === selectedClusterId
            ? { ...row, name: res.data?.name || row.name, keywords_count: res.data?.keywords_count || row.keywords_count }
            : row,
        ),
      );
      cancelEdit();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onRemoveClusterKeyword(keywordId) {
    if (!window.confirm("Remove this keyword from the cluster only?")) return;
    setError("");
    try {
                    const res = await deleteClusterKeyword(selectedClusterId, keywordId);
      setCluster(res.data);
      setDraft((cur) =>
        cur
          ? { ...cur, keywords: cur.keywords.filter((row) => row.id !== keywordId) }
          : cur,
      );
    } catch (e) {
      setError(e.message);
    }
  }

  async function onEditShortlistKeyword(row) {
    const next = window.prompt("Edit keyword phrase", row.keyword);
    if (next == null) return;
    const phrase = next.trim();
    if (!phrase || phrase === row.keyword) return;
    setError("");
    try {
      await patchKeyword(row.query_id, row.id, phrase);
      await refreshLists(domainId);
    } catch (e) {
      setError(e.message);
    }
  }

  const brief = content?.content || "";
  const aiPrompt = content?.ai_prompt || "";
  const members = cluster?.keywords || [];
  const secondaries = members
    .filter((k) => k.id !== cluster?.primary_keyword_id)
    .map((k) => k.keyword)
    .filter(Boolean);

  return (
    <>
      <h1>Keyword Library</h1>
      <p className="lede">
        Your saved queries, shortlists and clusters
        {domain ? ` for ${domainLabel(domain)}.` : "."}
      </p>

      <div className="domain-row">
        <select className="domain-select" value={domainId} onChange={(e) => setDomainId(e.target.value)}>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {domainLabel(d)}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="err">{error}</div>}

      <p className="lib-summary">
        {qCount} {qCount === 1 ? "query" : "queries"} · {queries?.keywords_count || 0} keywords ·{" "}
        {cCount} {cCount === 1 ? "cluster" : "clusters"}
        {domain ? ` for ${domainLabel(domain)}` : ""}
      </p>

      <div className="segmented">
        <button type="button" className={tab === "shortlisted" ? "active" : ""} onClick={() => setTab("shortlisted")}>
          ★ Shortlisted <span className="count-pill">{shortlisted.length}</span>
        </button>
        <button type="button" className={tab === "clusters" ? "active" : ""} onClick={() => setTab("clusters")}>
          Clusters <span className="count-pill">{cCount}</span>
        </button>
        <button type="button" className={tab === "queries" ? "active" : ""} onClick={() => setTab("queries")}>
          Queries <span className="count-pill">{qCount}</span>
        </button>
      </div>

      {(building || contentBusy) && (
        <div className="card loading-panel">
          <div className="spinner" aria-hidden="true" />
          <h2>{building ? "Building cluster" : "Generating content briefing"}</h2>
          <p className="muted">
            {building
              ? "Fetching SERP, questions and scores. The cluster opens when everything is ready."
              : "Writing the brief and AI prompt. The overlay opens when generation is finished."}
          </p>
        </div>
      )}

      {tab === "shortlisted" && (
        <>
          <FilterBar value={filters} onChange={setFilters} queryOptions={queryItems} />
          <div className="card">
            {shownShortlist.length === 0 ? (
              <div className="empty">
                <h2>Nothing shortlisted yet</h2>
                <p>Star ideas on Keyword Research. They appear here with filters and Build cluster.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Keyword</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Volume</th>
                    <th>CPC</th>
                    <th>Difficulty</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shownShortlist.map((k) => (
                    <tr key={k.id}>
                      <td>
                        {k.keyword} {k.page_exists ? "●" : ""}
                      </td>
                      <td><span className="pill">{k.type}</span></td>
                      <td>{k.source}</td>
                      <td>{Number(k.volume || 0).toLocaleString()}</td>
                      <td>${k.cpc}</td>
                      <td>{k.difficulty}</td>
                      <td className="row-actions">
                        <button className="btn btn-ghost" disabled={building} onClick={() => onBuild(k.id)}>
                          Build cluster
                        </button>
                        <button className="btn btn-ghost" onClick={() => onEditShortlistKeyword(k)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "queries" && (
        <div className="lib-layout">
          <aside className="lib-nav card">
            <div className="lib-nav-section">Queries</div>
            {queryItems.map((q) => (
              <button
                key={q.id}
                type="button"
                className={selectedQueryId === q.id ? "lib-nav-item active" : "lib-nav-item"}
                onClick={() => setSelectedQueryId(q.id)}
              >
                {q.keyword}
                <span className="muted">{q.status}</span>
              </button>
            ))}
          </aside>
          <div className="card">
            <h3>{queryItems.find((q) => q.id === selectedQueryId)?.keyword}</h3>
            <div className="row-actions">
              <button
                className="btn btn-dark"
                disabled={!selectedQueryId}
                onClick={() => navigate(`/research?domain_id=${domainId}&query_id=${selectedQueryId}`)}
              >
                Open saved results
              </button>
              <button
                className="btn btn-ghost"
                disabled={!selectedQueryId}
                onClick={() => onDeleteQuery(selectedQueryId)}
              >
                Delete query
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "clusters" && (
        <div className="lib-layout wide">
          <aside className="lib-nav card">
            <div className="lib-nav-section">Clusters</div>
            {clusters.map((c) => (
              <button
                key={c.id}
                type="button"
                className={selectedClusterId === c.id ? "lib-nav-item active" : "lib-nav-item"}
                onClick={() => {
                  setSelectedClusterId(c.id);
                  setContent(null);
                  setShowBrief(false);
                }}
              >
                {c.name || c.id}
                <span className="muted">{c.keywords_count} keywords</span>
              </button>
            ))}
          </aside>
          <div>
            {!cluster && !building && !selectedClusterId ? (
              <div className="card empty">
                <h2>No cluster selected</h2>
                <p>Build one from Shortlisted.</p>
              </div>
            ) : !cluster || building ? (
              <div className="card loading-panel">
                <div className="spinner" aria-hidden="true" />
                <h2>Loading cluster</h2>
              </div>
            ) : (
              <>
                <div className="cluster-head card">
                  <div>
                    {editing && draft ? (
                      <input
                        className="inline-edit title-edit"
                        type="text"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                    ) : (
                      <h2>{cluster.name}</h2>
                    )}
                    <p className="muted">
                      Cluster · {cluster.keywords_count} keywords · {cluster.status}
                    </p>
                  </div>
                  <div className="row-actions">
                    {editing ? (
                      <>
                        <button className="btn btn-dark" type="button" onClick={saveEdit}>Save</button>
                        <button className="btn btn-ghost" type="button" onClick={cancelEdit}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-ghost" type="button" onClick={startEdit} disabled={cluster.status === "running"}>
                        Edit cluster
                      </button>
                    )}
                    <button className="btn btn-ghost" type="button" onClick={onDeleteCluster}>
                      Delete cluster
                    </button>
                    <button className="btn btn-dark" disabled={contentBusy || cluster.status === "running" || editing} onClick={onGenerateContent}>
                      {contentBusy ? "Generating brief…" : "Generate Content Briefing"}
                    </button>
                  </div>
                </div>

                <div className="card">
                  <h3>AI Overview</h3>
                  <p className="muted">{cluster.verdict || "Should you build this page?"}</p>
                  <div className="score-grid">
                    <Score label="Overall" value={cluster.overall} />
                    <Score label="Traffic potential" value={cluster.traffic_potential} />
                    <Score label="Ranking difficulty" value={cluster.ranking_difficulty} />
                    <Score label="Content fit" value={cluster.content_fit} />
                  </div>
                  <p>{cluster.summary}</p>
                </div>

                <div className="card">
                  <h3>Cluster keywords</h3>
                  <p className="muted">{(cluster.keywords || []).length} phrases in this cluster</p>
                  {(cluster.keywords || []).length === 0 ? (
                    <p className="muted">No member keywords stored on this cluster.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Keyword</th>
                          <th>Role</th>
                          <th>Intent</th>
                          <th>Volume</th>
                          <th>CPC</th>
                          <th>Difficulty</th>
                          {editing ? <th></th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {(cluster.keywords || []).map((k) => {
                          const draftRow = draft?.keywords?.find((row) => row.id === k.id);
                          return (
                          <tr key={k.id}>
                            <td>
                              {editing && draftRow ? (
                                <input
                                  className="inline-edit"
                                  type="text"
                                  value={draftRow.keyword}
                                  onChange={(e) => setDraftKeyword(k.id, e.target.value)}
                                />
                              ) : (
                                <>
                                  {k.keyword}
                                  {k.id === cluster.primary_keyword_id ? " ★" : ""}
                                </>
                              )}
                            </td>
                            <td>
                              <span className="pill">
                                {k.id === cluster.primary_keyword_id ? "primary" : "secondary"}
                              </span>
                            </td>
                            <td>{k.intent || "—"}</td>
                            <td>{Number(k.volume || 0).toLocaleString()}</td>
                            <td>{k.cpc != null ? `$${k.cpc}` : "—"}</td>
                            <td>{k.difficulty ?? "—"}</td>
                            <td>
                              {editing && k.id !== cluster.primary_keyword_id && (
                                <button type="button" className="btn btn-ghost" onClick={() => onRemoveClusterKeyword(k.id)}>
                                  Remove
                                </button>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="ov-row">
                  <div className="card">
                    <h3>Primary keyword</h3>
                    <p>{editing && draft ? draft.name : cluster.name}</p>
                    {editing && draft ? (
                      <select
                        value={draft.intent}
                        onChange={(e) => setDraft({ ...draft, intent: e.target.value })}
                      >
                        {INTENTS.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="pill">{cluster.intent}</span>
                    )}
                  </div>
                  <div className="card">
                    <h3>Suggested title</h3>
                    {editing && draft ? (
                      <input
                        className="inline-edit"
                        type="text"
                        maxLength={70}
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      />
                    ) : (
                      <p>{cluster.title || "—"}</p>
                    )}
                    <h3>Suggested H1</h3>
                    {editing && draft ? (
                      <input
                        className="inline-edit"
                        type="text"
                        maxLength={70}
                        value={draft.h1}
                        onChange={(e) => setDraft({ ...draft, h1: e.target.value })}
                      />
                    ) : (
                      <p>{cluster.h1 || "—"}</p>
                    )}
                  </div>
                </div>

                <div className="ov-row">
                  <div className="card">
                    <h3>Questions to answer</h3>
                    <ol>
                      {(cluster.questions || []).map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="card">
                    <h3>SERP competitors</h3>
                    {(cluster.serp || []).map((s) => (
                      <div key={s.url} className="muted">
                        {s.rank}. {s.domain || s.url}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showBrief && content && (
        <div className="modal-backdrop" onClick={() => setShowBrief(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Content Briefing</h2>
                <p className="muted">for “{cluster?.name}”{domain ? ` · ${domainLabel(domain)}` : ""}</p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setShowBrief(false)}>Close</button>
            </div>
            <div className="modal-tabs">
              <button type="button" className={briefTab === "brief" ? "active" : ""} onClick={() => setBriefTab("brief")}>
                Content Briefing
              </button>
              <button type="button" className={briefTab === "prompt" ? "active" : ""} onClick={() => setBriefTab("prompt")}>
                AI Prompt
              </button>
            </div>
            {briefTab === "brief" ? (
              <div className="modal-body">
                <section className="brief-block">
                  <h3>A. Strategy</h3>
                  <dl className="brief-dl">
                    <div><dt>Content type</dt><dd>Landing page</dd></div>
                    <div><dt>Page type</dt><dd>Landing page</dd></div>
                    <div><dt>Primary keyword</dt><dd>{cluster?.name}</dd></div>
                    <div><dt>Secondary keywords</dt><dd>{secondaries.join(", ") || "—"}</dd></div>
                    <div><dt>Search intent</dt><dd>{cluster?.intent || "—"} search</dd></div>
                    <div><dt>Geographical target</dt><dd>United States</dd></div>
                  </dl>
                </section>
                <section className="brief-block">
                  <h3>B. Keyword &amp; SEO data</h3>
                  <dl className="brief-dl">
                    <div><dt>Primary keyword</dt><dd>{cluster?.name}</dd></div>
                    <div><dt>Search volume</dt><dd>{Number(cluster?.combined_volume || 0).toLocaleString()}</dd></div>
                    <div><dt>Keyword difficulty</dt><dd>{cluster?.ranking_difficulty ?? "—"}</dd></div>
                  </dl>
                </section>
                {brief && (
                  <section className="brief-block">
                    <h3>Full brief</h3>
                    <pre className="brief">{brief}</pre>
                  </section>
                )}
              </div>
            ) : (
              <div className="modal-body">
                <pre className="brief">{aiPrompt || "No AI prompt stored."}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Score({ label, value }) {
  return (
    <div className="score">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
      <div className="score-bar">
        <div style={{ width: `${Math.min(100, Number(value) || 0)}%` }} />
      </div>
    </div>
  );
}
