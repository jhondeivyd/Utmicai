// Gráficos em SVG puro (sem bibliotecas)
import { fmt } from "@/lib/metrics";

export function DailyChart({ data, currency }: { data: { day: string; revenue: number; spend: number; sales: number }[]; currency: string }) {
  const W = 760, H = 230, pl = 56, pr = 12, pt = 12, pb = 26;
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.spend))) * 1.1;
  const x = (i: number) => pl + (data.length <= 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (data.length - 1));
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  const line = (k: "revenue" | "spend") => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join("");
  const area = `${line("revenue")}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
  const every = Math.max(1, Math.ceil(data.length / 8));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Faturamento e gasto por dia">
      <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7c5cff" stopOpacity=".35" /><stop offset="1" stopColor="#7c5cff" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t, i) => <g key={i}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="#1d2230" /><text x={pl - 6} y={y(t) + 3} textAnchor="end">{fmt(t, "money", currency).replace(/,\d\d$/, "")}</text></g>)}
      <path d={area} fill="url(#ga)" />
      <path d={line("revenue")} fill="none" stroke="#7c5cff" strokeWidth="2.2" />
      <path d={line("spend")} fill="none" stroke="#ff6b81" strokeWidth="2" strokeDasharray="5 4" />
      {data.map((d, i) => (
        <g key={d.day}>
          <circle cx={x(i)} cy={y(d.revenue)} r="3" fill="#7c5cff"><title>{`${d.day.slice(8)}/${d.day.slice(5, 7)} · Faturamento ${fmt(d.revenue, "money", currency)} · Gasto ${fmt(d.spend, "money", currency)} · ${d.sales} vendas`}</title></circle>
          {i % every === 0 && <text x={x(i)} y={H - 8} textAnchor="middle">{`${d.day.slice(8)}/${d.day.slice(5, 7)}`}</text>}
        </g>
      ))}
    </svg>
  );
}

export function HourChart({ data }: { data: { hour: number; sales: number; revenue: number }[] }) {
  const W = 760, H = 170, pl = 28, pr = 8, pt = 10, pb = 22;
  const max = Math.max(1, ...data.map((d) => d.sales));
  const bw = (W - pl - pr) / 24;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vendas por hora">
      {data.map((d) => {
        const h = ((H - pt - pb) * d.sales) / max;
        return (
          <g key={d.hour}>
            <rect x={pl + d.hour * bw + 2} y={H - pb - h} width={bw - 4} height={Math.max(h, 1)} rx="3" fill={d.sales ? "url(#gb)" : "#1d2230"}><title>{`${d.hour}h · ${d.sales} vendas`}</title></rect>
            {d.hour % 3 === 0 && <text x={pl + d.hour * bw + bw / 2} y={H - 6} textAnchor="middle">{d.hour}h</text>}
          </g>
        );
      })}
      <defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#7c5cff" /></linearGradient></defs>
      <text x={pl - 4} y={pt + 8} textAnchor="end">{max}</text>
    </svg>
  );
}

export function HBars({ rows, currency }: { rows: { label: string; sales: number; revenue: number }[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  if (!rows.length) return <div className="empty">Sem vendas no período.</div>;
  return (
    <div className="hbar">
      {rows.slice(0, 8).map((r) => (
        <div className="r" key={r.label}>
          <span title={r.label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
          <span className="t"><i style={{ width: `${(100 * r.revenue) / max}%` }} /></span>
          <span className="n" style={{ textAlign: "right" }}>{r.sales} · {fmt(r.revenue, "money", currency).replace(/,\d\d$/, "")}</span>
        </div>
      ))}
    </div>
  );
}

export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, steps[0]?.value || 1);
  return (
    <div className="funnel">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].value : 0;
        const rate = i && prev ? `${((100 * s.value) / prev).toFixed(1).replace(".", ",")}%` : "";
        return (
          <div className="r" key={s.label}>
            <span>{s.label}</span>
            <span className="t"><i style={{ width: `${Math.max(4, (100 * s.value) / max)}%` }}>{fmt(s.value, "int")}</i></span>
            <span className="mut" style={{ textAlign: "right" }}>{rate}</span>
          </div>
        );
      })}
    </div>
  );
}
