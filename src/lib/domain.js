const KEY = "kr_domain_id";

export function readStoredDomain() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function writeStoredDomain(id) {
  if (!id) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

export function pickDomain(rows, preferred) {
  const ids = new Set((rows || []).map((d) => d.id));
  if (preferred && ids.has(preferred)) return preferred;
  const stored = readStoredDomain();
  if (stored && ids.has(stored)) return stored;
  return rows[0]?.id || "";
}
