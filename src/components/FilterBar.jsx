const INTENTS = ["informational", "commercial", "transactional", "navigational"];
const TYPES = ["autocomplete", "questions", "related", "prepositions", "comparisons", "competitors"];

function toggle(list, value) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export default function FilterBar({ value, onChange, queryOptions }) {
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="filter-bar">
      {queryOptions && (
        <select
          value={value.queryId || "all"}
          onChange={(e) => set({ queryId: e.target.value })}
        >
          <option value="all">All queries</option>
          {queryOptions.map((q) => (
            <option key={q.id} value={q.id}>
              {q.keyword}
            </option>
          ))}
        </select>
      )}
      <select
        value={value.intent[0] || ""}
        onChange={(e) => set({ intent: e.target.value ? [e.target.value] : [] })}
      >
        <option value="">Intent</option>
        {INTENTS.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
      <select
        value={value.type[0] || ""}
        onChange={(e) => set({ type: e.target.value ? [e.target.value] : [] })}
      >
        <option value="">Type</option>
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select value={value.volume} onChange={(e) => set({ volume: e.target.value })}>
        <option value="">Volume</option>
        <option value="0-500">0–500</option>
        <option value="500-1000">500–1000</option>
        <option value="1000-2000">1000–2000</option>
        <option value="2000-5000">2000–5000</option>
        <option value="5000-10000">5000–10000</option>
        <option value="10000+">10000+</option>
      </select>
      <select value={value.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
        <option value="">SEO Difficulty</option>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>
      <select value={value.cpc} onChange={(e) => set({ cpc: e.target.value })}>
        <option value="">Cost Per Click</option>
        <option value="0-1">$0–1</option>
        <option value="1-5">$1–5</option>
        <option value="5-10">$5–10</option>
        <option value="10+">$10+</option>
      </select>
      <label className="chk">
        <input
          type="checkbox"
          checked={value.page_exists}
          onChange={(e) => set({ page_exists: e.target.checked })}
        />
        Page exists
      </label>
      <button type="button" className="btn btn-ghost" onClick={() => onChange({ ...value, ...{
        intent: [], type: [], volume: "", difficulty: "", cpc: "", page_exists: false, queryId: "all",
      } })}>
        Reset
      </button>
    </div>
  );
}

export { toggle };
