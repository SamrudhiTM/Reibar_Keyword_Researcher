export const emptyFilters = () => ({
  intent: [],
  type: [],
  volume: "",
  difficulty: "",
  cpc: "",
  first_page: "any",
  page_exists: false,
});

export function applyLocalFilters(rows, f) {
  return (rows || []).filter((k) => {
    if (f.intent.length && !f.intent.includes((k.intent || "").toLowerCase())) return false;
    if (f.type.length && !f.type.includes((k.type || "").toLowerCase())) return false;
    const vol = Number(k.volume || 0);
    if (f.volume === "0-500" && !(vol >= 0 && vol < 500)) return false;
    if (f.volume === "500-1000" && !(vol >= 500 && vol < 1000)) return false;
    if (f.volume === "1000-2000" && !(vol >= 1000 && vol < 2000)) return false;
    if (f.volume === "2000-5000" && !(vol >= 2000 && vol < 5000)) return false;
    if (f.volume === "5000-10000" && !(vol >= 5000 && vol < 10000)) return false;
    if (f.volume === "10000+" && vol < 10000) return false;
    const d = Number(k.difficulty || 0);
    if (f.difficulty === "easy" && !(d >= 0 && d <= 32)) return false;
    if (f.difficulty === "medium" && !(d >= 33 && d <= 66)) return false;
    if (f.difficulty === "hard" && d < 67) return false;
    const cpc = Number(k.cpc || 0);
    if (f.cpc === "0-1" && cpc >= 1) return false;
    if (f.cpc === "1-5" && !(cpc >= 1 && cpc < 5)) return false;
    if (f.cpc === "5-10" && !(cpc >= 5 && cpc < 10)) return false;
    if (f.cpc === "10+" && cpc < 10) return false;
    if (f.page_exists && !k.page_exists) return false;
    return true;
  });
}
