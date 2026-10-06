import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import FilterBar from "../components/FilterBar.jsx";
import Overview from "../components/Overview.jsx";
import { pickDomain, writeStoredDomain } from "../lib/domain.js";
import { applyLocalFilters, emptyFilters } from "../lib/filters.js";
import {
  createQuery,
  deleteKeyword,
  deleteQuery,
  getKeywords,
  getPrompts,
  getQuery,
  getSerp,
  listDomains,
  listQueries,
  patchKeyword,
  setShortlist,
} from "../api";

const cache = new Map();

function domainLabel(d) {
  return d.display_name || d.domain_url || d.id;
}

async function loadKeywords(id) {
  const kw = await getKeywords(id, { page: 1, pageSize: 100 });
  return {
    keywords: kw?.data?.items || [],
    pagination: kw?.data?.pagination || null,
  };
}

async function loadExtras(id) {
  const [pr, sr] = await Promise.all([getPrompts(id), getSerp(id)]);
  return {
    prompts: pr?.data?.items || [],
    serp: sr?.data?.items || [],
  };
}

export default function Research() {
  const [params, setParams] = useSearchParams();
  const [domains, setDomains] = useState([]);
  const [domainId, setDomainId] = useState(params.get("domain_id") || "");
  const [seed, setSeed] = useState("");
  const [queries, setQueries] = useState([]);
  const [queryId, setQueryId] = useState(params.get("query_id") || "");
  const [tab, setTab] = useState("ideas");
  const [job, setJob] = useState(null);
  const [keywords, setKeywords] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [serp, setSerp] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [filters, setFilters] = useState(emptyFilters());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shortlistBaseline, setShortlistBaseline] = useState(() => new Map());
  const [shortlistSaving, setShortlistSaving] = useState(false);
  const pollRef = useRef(null);
  const shortlistDirtyRef = useRef(false);

  function applyKeywordsFromServer(rows) {
    const list = Array.isArray(rows) ? rows : [];
    setKeywords(list);
    setShortlistBaseline(new Map(list.map((k) => [k.id, !!k.shortlisted])));
  }

  function mergeKeywordsPreservingDraft(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!shortlistDirtyRef.current) {
      applyKeywordsFromServer(list);
      return;
    }
    setKeywords((prev) => {
      const localStar = new Map(prev.map((k) => [k.id, !!k.shortlisted]));
      return list.map((k) =>
        localStar.has(k.id) ? { ...k, shortlisted: localStar.get(k.id) } : k,
      );
    });
  }

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

  useEffect(() => {
    if (!domainId) return;
    writeStoredDomain(domainId);
    const next = new URLSearchParams(params);
    next.set("domain_id", domainId);
    setParams(next, { replace: true });
    listQueries(domainId)
      .then((res) => setQueries(res?.data?.items || []))
      .catch((e) => setError(e.message));
  }, [domainId]);

  function applyPack(pack, { preserveShortlistDraft = false } = {}) {
    setJob(pack.job);
    if (preserveShortlistDraft) mergeKeywordsPreservingDraft(pack.keywords);
    else applyKeywordsFromServer(pack.keywords);
    setPrompts(pack.prompts);
    setSerp(pack.serp);
    setPagination(pack.pagination || null);
  }

  useEffect(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    if (!queryId) return;

    const hit = cache.get(queryId);
    if (hit?.job?.status === "ready" && hit.keywords?.length) {
      applyPack(hit);
      setLoading(false);
      return;
    }

    let stop = false;
    const run = async () => {
      try {
        const cached = cache.get(queryId);
        if (!cached?.keywords?.length) setLoading(true);
        const [q, kwPack] = await Promise.all([
          cached?.job?.status === "ready"
            ? Promise.resolve({ data: cached.job })
            : getQuery(queryId),
          loadKeywords(queryId),
        ]);
        if (stop) return;
        const jobRow = q.data;
        setJob(jobRow);
        mergeKeywordsPreservingDraft(kwPack.keywords);
        setPagination(kwPack.pagination);
        if (kwPack.keywords.length) setLoading(false);

        if (jobRow.status === "failed") {
          setError(jobRow.error_message || "Generate failed");
          setLoading(false);
          return;
        }

        if (jobRow.status === "ready") {
          const extras = cached?.prompts
            ? { prompts: cached.prompts, serp: cached.serp || [] }
            : await loadExtras(queryId);
          if (stop) return;
          const pack = {
            job: jobRow,
            keywords: kwPack.keywords,
            pagination: kwPack.pagination,
            ...extras,
          };
          cache.set(queryId, pack);
          applyPack(pack, { preserveShortlistDraft: true });
          setLoading(false);
          return;
        }

        pollRef.current = setTimeout(run, 1000);
      } catch (e) {
        if (!stop) setError(e.message);
        setLoading(false);
      }
    };
    run();
    return () => {
      stop = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [queryId]);

  const canGenerate = seed.trim().length > 0 && domainId && !busy;

  async function onGenerate() {
    setBusy(true);
    setError("");
    setJob(null);
    applyKeywordsFromServer([]);
    setPrompts([]);
    setSerp([]);
    setPagination(null);
    setLoading(true);
    try {
      const res = await createQuery({ keyword: seed.trim(), domain_id: domainId });
      const id = res?.data?.id;
      cache.delete(id);
      setQueryId(id);
      const next = new URLSearchParams(params);
      next.set("query_id", id);
      setParams(next, { replace: true });
    } catch (e) {
      setError(e.message);
      setLoading(false);
    } finally {
      setBusy(false);
    }
  }

  function selectQuery(id) {
    setQueryId(id);
    const next = new URLSearchParams(params);
    if (id) next.set("query_id", id);
    else next.delete("query_id");
    setParams(next, { replace: true });
  }

  async function refreshQueryList() {
    if (!domainId) return;
    const res = await listQueries(domainId);
    setQueries(res?.data?.items || []);
  }

  async function onDeleteQuery() {
    if (!queryId || !window.confirm("Delete this generate job and its keyword ideas?")) return;
    setError("");
    try {
      cache.delete(queryId);
      await deleteQuery(queryId);
      setQueryId("");
      setJob(null);
      applyKeywordsFromServer([]);
      setPrompts([]);
      setSerp([]);
      const next = new URLSearchParams(params);
      next.delete("query_id");
      setParams(next, { replace: true });
      await refreshQueryList();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onEditKeyword(row) {
    const next = window.prompt("Edit keyword phrase", row.keyword);
    if (next == null) return;
    const phrase = next.trim();
    if (!phrase || phrase === row.keyword) return;
    setError("");
    try {
      const res = await patchKeyword(queryId, row.id, phrase);
      const updated = res?.data || { ...row, keyword: phrase };
      const list = keywords.map((k) => (k.id === row.id ? { ...k, ...updated } : k));
      setKeywords(list);
      const pack = cache.get(queryId);
      if (pack) cache.set(queryId, { ...pack, keywords: list });
    } catch (e) {
      setError(e.message);
    }
  }

  async function onDeleteKeyword(row) {
    if (!window.confirm(`Remove “${row.keyword}” from this query?`)) return;
    setError("");
    try {
      await deleteKeyword(queryId, row.id);
      const list = keywords.filter((k) => k.id !== row.id);
      applyKeywordsFromServer(list);
      const pack = cache.get(queryId);
      if (pack) cache.set(queryId, { ...pack, keywords: list });
    } catch (e) {
      setError(e.message);
    }
  }

  function toggleStar(keywordId) {
    setKeywords((rows) =>
      rows.map((r) => (r.id === keywordId ? { ...r, shortlisted: !r.shortlisted } : r)),
    );
  }

  async function onSaveShortlist() {
    if (!queryId || shortlistSaving) return;
    const toStar = [];
    const toUnstar = [];
    for (const k of keywords) {
      const saved = !!shortlistBaseline.get(k.id);
      const cur = !!k.shortlisted;
      if (cur && !saved) toStar.push(k.id);
      if (!cur && saved) toUnstar.push(k.id);
    }
    if (!toStar.length && !toUnstar.length) return;

    setShortlistSaving(true);
    setError("");
    try {
      const responses = [];
      if (toStar.length) responses.push(await setShortlist(queryId, toStar, true));
      if (toUnstar.length) responses.push(await setShortlist(queryId, toUnstar, false));

      const byId = new Map();
      for (const res of responses) {
        for (const row of res?.data?.items || []) byId.set(row.id, row);
      }
      const next = keywords.map((r) => {
        const updated = byId.get(r.id);
        return updated ? { ...r, ...updated } : r;
      });
      applyKeywordsFromServer(next);
      const pack = cache.get(queryId);
      if (pack) cache.set(queryId, { ...pack, keywords: next });
    } catch (e) {
      setError(e.message);
    } finally {
      setShortlistSaving(false);
    }
  }

  const selectedQueryLabel = useMemo(() => {
    const q = queries.find((x) => x.id === queryId);
    return q?.keyword || job?.keyword || "";
  }, [queries, queryId, job]);

  const filteredKeywords = useMemo(
    () => applyLocalFilters(keywords, filters),
    [keywords, filters],
  );
  const shortlisted = keywords.filter((k) => k.shortlisted);
  const shortlistDirty = useMemo(() => {
    for (const k of keywords) {
      if (!!k.shortlisted !== !!shortlistBaseline.get(k.id)) return true;
    }
    return false;
  }, [keywords, shortlistBaseline]);
  shortlistDirtyRef.current = shortlistDirty;

  return (
    <>
      <h1>Keyword Research</h1>
      <p className="lede">
        Research keyword ideas for your domain — overview, prompts and SERP analysis.
      </p>

      <div className="domain-row">
        <select
          className="domain-select"
          value={domainId}
          onChange={(e) => {
            setDomainId(e.target.value);
            writeStoredDomain(e.target.value);
            setQueryId("");
            setJob(null);
            applyKeywordsFromServer([]);
            setPrompts([]);
            setSerp([]);
            const next = new URLSearchParams(params);
            next.set("domain_id", e.target.value);
            next.delete("query_id");
            setParams(next, { replace: true });
          }}
        >
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {domainLabel(d)}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <label className="field">Search query</label>
        <div className="search-wrap">
          <span className="ico">⌕</span>
          <input
            type="text"
            placeholder="Enter a seed topic or question, e.g. sell my house fast"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canGenerate && onGenerate()}
          />
        </div>
        <button className="btn btn-dark" disabled={!canGenerate} onClick={onGenerate}>
          ✦ Generate Keywords
        </button>
        {error && <div className="err">{error}</div>}
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "ideas" ? "active" : ""}`} onClick={() => setTab("ideas")}>
          Keyword Ideas
        </button>
        <button className={`tab ${tab === "prompts" ? "active" : ""}`} onClick={() => setTab("prompts")}>
          AI Prompts
        </button>
        <button className={`tab ${tab === "serp" ? "active" : ""}`} onClick={() => setTab("serp")}>
          SERP Analysis
        </button>
        <span className="spacer" />
        <select value={queryId} onChange={(e) => selectQuery(e.target.value)}>
          <option value="">No query selected</option>
          {queries.map((q) => (
            <option key={q.id} value={q.id}>
              {q.keyword} {q.status === "ready" ? "" : `(${q.status})`}
            </option>
          ))}
        </select>
        {queryId && (
          <button type="button" className="btn btn-ghost" onClick={onDeleteQuery}>
            Delete query
          </button>
        )}
      </div>

      {!queryId && (
        <div className="card empty">
          <div className="empty-ico">⌕</div>
          <h2>No query selected</h2>
          <p>Generate keywords above or pick a previous query from the selector. Saved queries only load stored results.</p>
        </div>
      )}

      {queryId && loading && keywords.length === 0 && (
        <div className="card loading-panel">
          <div className="spinner" aria-hidden="true" />
          <h2>Generating keyword research</h2>
          <p className="muted">Waiting for the first keyword ideas…</p>
        </div>
      )}

      {queryId && job?.status === "running" && keywords.length > 0 && (
        <div className="progress">Ideas are in. Still finishing prompts and SERP in the background…</div>
      )}

      {queryId && keywords.length > 0 && tab === "ideas" && (
        <>
          <Overview
            job={job}
            prompts={prompts}
            onGoToPrompts={() => setTab("prompts")}
            onGoToSerp={() => setTab("serp")}
          />
          <h3>Keyword Ideas {selectedQueryLabel ? `for ${selectedQueryLabel}` : ""}</h3>
          <FilterBar value={filters} onChange={setFilters} />
          <div className="ideas-layout">
            <div className="card">
              <p className="muted">
                Showing {filteredKeywords.length} of {pagination?.total_items ?? keywords.length} stored ideas
                {pagination?.total_items > keywords.length ? " (first 100 on this page)" : ""}
              </p>
              <table>
                <thead>
                  <tr>
                    <th></th>
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
                  {filteredKeywords.map((k) => (
                    <tr key={k.id}>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => toggleStar(k.id)}
                          aria-label={k.shortlisted ? "Unstar keyword" : "Star keyword"}
                        >
                          {k.shortlisted ? "★" : "☆"}
                        </button>
                      </td>
                      <td>{k.keyword}</td>
                      <td><span className="pill">{k.type}</span></td>
                      <td>{k.source}</td>
                      <td>{k.volume}</td>
                      <td>{k.cpc}</td>
                      <td>{k.difficulty}</td>
                      <td className="row-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => onEditKeyword(k)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => onDeleteKeyword(k)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <aside className="card shortlist-rail">
              <h3>Shortlist</h3>
              <p className="muted">
                {shortlisted.length} starred on this query
                {shortlistDirty ? " · unsaved" : ""}
              </p>
              <button
                type="button"
                className="btn btn-dark"
                disabled={!shortlistDirty || shortlistSaving}
                onClick={onSaveShortlist}
              >
                {shortlistSaving ? "Saving…" : "Save shortlist"}
              </button>
              {shortlisted.map((k) => (
                <div key={k.id} className="list-row" style={{ cursor: "default" }}>
                  <strong>{k.keyword}</strong>
                  <span className="muted">{k.volume}</span>
                </div>
              ))}
            </aside>
          </div>
        </>
      )}

      {queryId && tab === "prompts" && keywords.length > 0 && (
        <div className="card">
          <h2>AI Prompt Ideas</h2>
          <p className="muted">Questions AI assistants get asked about this topic.</p>
          {prompts.length === 0 && (
            <p className="muted">Prompts still generating…</p>
          )}
          {prompts.map((p) => (
            <details key={p.id} className="prompt-item">
              <summary>
                <span>{p.text}</span>
                <span className="pill">{p.intent}</span>
                <span className="muted">{(p.brands || []).length} brands</span>
              </summary>
              <div className="prompt-body">
                {p.response || "No stored response."}
                <div className="brand-row">
                  {(p.brands || []).map((b) => (
                    <span key={b} className="pill">{b}</span>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      {queryId && tab === "serp" && keywords.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>URL</th>
                <th>Kind</th>
              </tr>
            </thead>
            <tbody>
              {serp.map((s) => (
                <tr key={s.id || s.url}>
                  <td>{s.rank}</td>
                  <td>{s.title}</td>
                  <td>{s.url}</td>
                  <td>{s.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
