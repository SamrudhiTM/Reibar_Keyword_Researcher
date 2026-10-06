import { useState } from "react";

const INTENT_ORDER = ["informational", "commercial", "transactional", "navigational"];
const INTENT_LABEL = {
  informational: "Informational",
  commercial: "Commercial",
  transactional: "Transactional",
  navigational: "Navigational",
};

function monthLabel(row, index) {
  const month = row.month ?? row.Month;
  const year = row.year ?? row.Year;
  if (month && year) {
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleString("en", { month: "short", year: "2-digit" });
  }
  return row.date || `M${index + 1}`;
}

const SERIES_COLORS = {
  total: "#111827",
  desktop: "#3b82f6",
  mobile: "#f59e0b",
  tablet: "#10b981",
};

function VolumeBars({ history, fallback, devices }) {
  const hasDevices = devices && Object.keys(devices).length > 0;
  const rows = (history.length ? history : [{ search_volume: fallback || 0 }]).map((h, i) => ({
    label: monthLabel(h, i),
    total: Number(h.search_volume ?? h.volume ?? 0),
    desktop: hasDevices ? Number(devices[i]?.desktop ?? devices.desktop?.[i] ?? 0) : null,
    mobile: hasDevices ? Number(devices[i]?.mobile ?? devices.mobile?.[i] ?? 0) : null,
    tablet: hasDevices ? Number(devices[i]?.tablet ?? devices.tablet?.[i] ?? 0) : null,
  }));
  // If devices is a simple {desktop: n, mobile: n, tablet: n} object (not per-month),
  // spread the same values across all months so the grouped chart still renders.
  if (hasDevices && !Array.isArray(devices) && typeof devices === "object" && devices.desktop != null && !Array.isArray(devices.desktop)) {
    rows.forEach((r) => {
      r.desktop = Number(devices.desktop) || 0;
      r.mobile = Number(devices.mobile) || 0;
      r.tablet = Number(devices.tablet) || 0;
    });
  }
  // Filter out series that have no data at all
  const activeSeries = hasDevices
    ? ["desktop", "mobile", "tablet"].filter((k) => rows.some((r) => r[k] != null && r[k] > 0))
    : [];
  const seriesCount = 1 + activeSeries.length;

  const allValues = rows.flatMap((r) => [r.total, ...activeSeries.map((k) => r[k])].filter((v) => v != null));
  const max = Math.max(...allValues, 1);

  const w = 560;
  const h = 200;
  const padL = 50;
  const padB = 36;
  const padT = 16;
  const padR = 12;
  const innerW = w - padL - padR;
  const innerH = h - padB - padT;
  const groupGap = 4;
  const barGap = 2;
  const groupW = innerW / rows.length;
  const barW = Math.max(4, (groupW - groupGap * 2 - barGap * (seriesCount - 1)) / seriesCount);

  const series = [
    { key: "total", label: "Total", color: SERIES_COLORS.total },
    ...activeSeries.map((k) => ({
      key: k,
      label: k.charAt(0).toUpperCase() + k.slice(1),
      color: SERIES_COLORS[k],
    })),
  ];

  // Overlap bars: shift each subsequent series left by half a bar width
  // so bars overlap within each group rather than sitting side by side
  const overlapOffset = barW * 0.5;

  return (
    <div className="volume-chart-wrap">
      {hasDevices && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.key} className="legend-item">
              <span className="legend-swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Search volume bar graph">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} className="chart-grid" />
              <text x={padL - 6} y={y + 4} className="chart-axis" textAnchor="end">
                {Math.round(max * t).toLocaleString()}
              </text>
            </g>
          );
        })}
        {rows.map((row, i) => {
          const groupX = padL + i * groupW + groupGap;
          const totalBarW = seriesCount * (barW + barGap) - barGap;
          return (
            <g key={`${row.label}-${i}`}>
              {series.map((s, si) => {
                const val = row[s.key];
                if (val == null) return null;
                const bh = (val / max) * innerH;
                // Overlap: each series is offset left so bars overlap within the group
                const x = groupX + si * (barW + barGap) - si * overlapOffset;
                const y = padT + innerH - bh;
                return (
                  <g key={s.key}>
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={Math.max(2, bh)}
                      rx="2"
                      fill={s.color}
                      opacity={s.key === "total" ? 0.3 : 0.8}
                    />
                    <title>{`${row.label} — ${s.label}: ${val.toLocaleString()}`}</title>
                  </g>
                );
              })}
              <text
                x={groupX + totalBarW / 2}
                y={h - 10}
                className="chart-axis"
                textAnchor="middle"
              >
                {row.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function IntentDiamond({ mix }) {
  const values = INTENT_ORDER.map((key) => Number(mix?.[key] || 0));
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const r = 92;
  const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

  function point(pct, angle) {
    const dist = (Math.max(0, Math.min(100, pct)) / 100) * r;
    return [cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist];
  }

  function ring(pct) {
    return angles
      .map((a) => point(pct, a).join(","))
      .join(" ");
  }

  const data = angles.map((a, i) => point(values[i], a));
  const poly = data.map((p) => p.join(",")).join(" ");
  const labels = [
    [cx, 18],
    [size - 8, cy + 4],
    [cx, size - 8],
    [8, cy + 4],
  ];
  const anchors = ["middle", "end", "middle", "start"];

  return (
    <svg className="chart-svg diamond-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Prompt intent diamond">
      {[25, 50, 75, 100].map((pct) => (
        <polygon key={pct} points={ring(pct)} className="diamond-grid" />
      ))}
      {angles.map((a, i) => {
        const [x, y] = point(100, a);
        return <line key={INTENT_ORDER[i]} x1={cx} y1={cy} x2={x} y2={y} className="diamond-axis" />;
      })}
      <polygon points={poly} className="diamond-fill" />
      {data.map(([x, y], i) => (
        <circle key={INTENT_ORDER[i]} cx={x} cy={y} r="4" className="diamond-dot" />
      ))}
      {INTENT_ORDER.map((key, i) => (
        <text key={key} x={labels[i][0]} y={labels[i][1]} textAnchor={anchors[i]} className="diamond-label">
          {INTENT_LABEL[key]} {values[i]}%
        </text>
      ))}
    </svg>
  );
}

export default function Overview({ job, prompts, onGoToPrompts, onGoToSerp }) {
  const ov = job?.overview || {};
  const intent = job?.search_intent || {};
  const history = job?.volume_history || [];
  const preview = job?.prompts_preview?.length ? job.prompts_preview : (prompts || []).slice(0, 4);
  const intentBars = Object.entries(intent.bars || {});
  const promptMix = job?.prompts_intent || {};
  const [deviceView, setDeviceView] = useState("total");
  const devices = job?.volume_by_device || {};
  const deviceRows = Object.entries(devices).filter(([, v]) => v != null && v !== "");

  return (
    <div className="overview">
      <div className="section-head">
        <h2>Overview</h2>
        <span className="section-for">for {job?.keyword || "—"}</span>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-label">SEO Difficulty</div>
          <div className="stat-value">{ov.difficulty ?? "—"}</div>
          <span className="pill">{ov.difficulty_label || "—"}</span>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Search Intent</div>
          <div className="stat-value">{intent.primary || ov.intent || "—"}</div>
          <div className="stat-sub">
            Main {intent.primary_pct || ov.intent_main_pct || 0}% · Secondary{" "}
            {intent.secondary_pct || ov.intent_secondary_pct || 0}%
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Cost Per Click</div>
          <div className="stat-value">{ov.cpc != null ? `$${ov.cpc}` : "—"}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">SERP Features</div>
          <div className="stat-value">{ov.serp_features_count ?? "—"}</div>
          <button type="button" className="stat-link" onClick={onGoToSerp}>
            View Search Results
          </button>
        </div>
      </div>

      <div className="ov-row">
        <div className="card vol-card">
          <div className="vol-top">
            <div>
              <div className="vol-title">Search Volume</div>
              <div className="vol-value">
                {(ov.volume ?? 0).toLocaleString()}
                <span className="vol-note"> monthly searches</span>
              </div>
            </div>
            <div className="segmented seg-mini">
              <button type="button" className={deviceView === "total" ? "active" : ""} onClick={() => setDeviceView("total")}>
                Total
              </button>
              <button type="button" className={deviceView === "devices" ? "active" : ""} onClick={() => setDeviceView("devices")}>
                Devices
              </button>
            </div>
          </div>
          {deviceView === "total" ? (
            <VolumeBars history={history} fallback={ov.volume || 0} devices={devices} />
          ) : deviceRows.length ? (
            <VolumeBars
              history={deviceRows.map(([name, value]) => ({ date: name, search_volume: Number(value) || 0 }))}
              fallback={0}
            />
          ) : (
            <p className="muted">Device split is not stored for this query.</p>
          )}
        </div>
        <div className="card">
          <h3>AI Summary</h3>
          <p className="summary-body">{job?.summary || "Summary appears after generate finishes."}</p>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h3>AI Prompt Ideas</h3>
          <button type="button" className="stat-link" onClick={onGoToPrompts}>
            View all {job?.prompts_total || preview.length} prompts →
          </button>
        </div>
        <p className="muted">What people ask AI about this topic — hover a prompt to see the AI response.</p>
        {(preview || []).map((p) => (
          <div key={p.id || p.text} className="prompt-preview-row" title={p.response || ""}>
            <span>{p.text}</span>
            <span className="muted">{(p.brands || []).length} brands</span>
          </div>
        ))}
      </div>

      <div className="ov-row">
        <div className="card">
          <h3>Prompt intent</h3>
          <p className="muted">Four intents as a closed diamond — each line is one axis.</p>
          {INTENT_ORDER.every((key) => !promptMix[key]) ? (
            <p className="muted">No prompt-intent mix yet.</p>
          ) : (
            <IntentDiamond mix={promptMix} />
          )}
        </div>
        <div className="card">
          <h3>Search intent</h3>
          <p className="muted">{intent.headline || "Main vs secondary search intent for this keyword."}</p>
          {intentBars.map(([name, pct]) => (
            <div key={name} className="intent-row">
              <span>{name}</span>
              <div className="intent-track">
                <div className="intent-fill" style={{ width: `${pct}%` }} />
              </div>
              <span>{pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
