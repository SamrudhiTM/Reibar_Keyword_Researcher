const BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const TOKEN = import.meta.env.VITE_API_TOKEN || "";

export async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.message || body?.detail || res.statusText || "Request failed";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body;
}

export function filterQuery(filters = {}) {
  const p = new URLSearchParams();
  (filters.intent || []).forEach((v) => p.append("intent", v));
  (filters.type || []).forEach((v) => p.append("type", v));
  if (filters.volume) p.set("volume", filters.volume);
  if (filters.difficulty) p.set("difficulty", filters.difficulty);
  if (filters.cpc) p.set("cpc", filters.cpc);
  if (filters.first_page && filters.first_page !== "any") p.set("first_page", filters.first_page);
  if (filters.page_exists) p.set("page_exists", "true");
  return p.toString();
}

export const listDomains = () => api("/domains");
export const listQueries = (domainId) =>
  api(`/keyword-research/queries?domain_id=${encodeURIComponent(domainId)}`);
export const createQuery = (payload) =>
  api("/keyword-research/queries", { method: "POST", body: JSON.stringify(payload) });
export const getQuery = (id) => api(`/keyword-research/queries/${id}`);
export const getKeywords = (id, { page = 1, pageSize = 100, filters } = {}) => {
  const extra = filterQuery(filters);
  return api(
    `/keyword-research/queries/${id}/keywords?page=${page}&page_size=${pageSize}${extra ? `&${extra}` : ""}`,
  );
};
export const getPrompts = (id) => api(`/keyword-research/queries/${id}/prompts`);
export const getSerp = (id) => api(`/keyword-research/queries/${id}/serp`);
export const setShortlist = (queryId, keywordIds, shortlisted) =>
  api(`/keyword-research/queries/${queryId}/keywords/shortlist`, {
    method: "PUT",
    body: JSON.stringify({
      keyword_ids: Array.isArray(keywordIds) ? keywordIds : [keywordIds],
      shortlisted,
    }),
  });
export const listShortlisted = (domainId, page = 1) =>
  api(
    `/keyword-research/keywords?domain_id=${encodeURIComponent(domainId)}&page=${page}&page_size=100`,
  );
export const listClusters = (domainId) =>
  api(`/keyword-research/clusters?domain_id=${encodeURIComponent(domainId)}`);
export const createCluster = (keywordId) =>
  api("/keyword-research/clusters", {
    method: "POST",
    body: JSON.stringify({ keyword_id: keywordId }),
  });
export const getCluster = (id, includeContent = false) =>
  api(`/keyword-research/clusters/${id}${includeContent ? "?include_content=true" : ""}`);
export const startContent = (id) =>
  api(`/keyword-research/clusters/${id}/content`, { method: "POST" });
export const getClusterContent = (id) => api(`/keyword-research/clusters/${id}/content`);
export const deleteQuery = (id) =>
  api(`/keyword-research/queries/${id}`, { method: "DELETE" });
export const deleteKeyword = (queryId, keywordId) =>
  api(`/keyword-research/queries/${queryId}/keywords/${keywordId}`, { method: "DELETE" });
export const patchKeyword = (queryId, keywordId, keyword) =>
  api(`/keyword-research/queries/${queryId}/keywords/${keywordId}`, {
    method: "PATCH",
    body: JSON.stringify({ keyword }),
  });
export const deleteCluster = (id) =>
  api(`/keyword-research/clusters/${id}`, { method: "DELETE" });
export const deleteClusterKeyword = (clusterId, keywordId) =>
  api(`/keyword-research/clusters/${clusterId}/keywords/${keywordId}`, { method: "DELETE" });
export const patchCluster = (id, payload) =>
  api(`/keyword-research/clusters/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
