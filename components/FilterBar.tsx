"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const PERIODS: [string, string][] = [
  ["today", "Hoje"], ["yesterday", "Ontem"], ["7d", "Últimos 7 dias"], ["30d", "Últimos 30 dias"], ["90d", "Últimos 90 dias"],
  ["month", "Este mês"], ["lastmonth", "Mês passado"], ["custom", "Personalizado"]
];
type Opt = { value: string; label: string };
export type FilterDef = { key: string; label: string; options: Opt[] };

export default function FilterBar({ base, values, filters, keep = {}, more = [] }:
  { base: string; values: Record<string, string>; filters: FilterDef[]; keep?: Record<string, string>; more?: FilterDef[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showMore, setShowMore] = useState(more.some((f) => values[f.key]));
  const [cf, setCf] = useState(values.from || ""), [ct, setCt] = useState(values.to || "");
  const go = (patch: Record<string, string>) => {
    const q = new URLSearchParams();
    const all = { ...keep, ...values, ...patch };
    for (const [k, v] of Object.entries(all)) if (v) q.set(k, v);
    if (all.p !== "custom") { q.delete("from"); q.delete("to"); }
    start(() => router.push(`${base}?${q.toString()}`));
  };
  const Sel = (f: FilterDef) => (
    <label key={f.key} className="fb-item">{f.label}
      <select className="input" value={values[f.key] || ""} onChange={(e) => go({ [f.key]: e.target.value })}>
        <option value="">Qualquer</option>
        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  return (
    <div className={"filterbar" + (pending ? " loading" : "")}>
      <div className="fb-row">
        <label className="fb-item fb-wide">Período de visualização
          <select className="input" value={values.p || "today"} onChange={(e) => e.target.value === "custom" ? go({ p: "custom", from: cf || new Date().toISOString().slice(0, 10), to: ct || new Date().toISOString().slice(0, 10) }) : go({ p: e.target.value })}>
            {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {values.p === "custom" && (
          <div className="fb-item fb-dates">
            <span>De / até</span>
            <div className="inline">
              <input className="input" type="date" value={cf} onChange={(e) => setCf(e.target.value)} />
              <input className="input" type="date" value={ct} onChange={(e) => setCt(e.target.value)} />
              <button className="btn btn-sm" onClick={() => go({ p: "custom", from: cf, to: ct })}>OK</button>
            </div>
          </div>
        )}
        {filters.map(Sel)}
      </div>
      {more.length > 0 && (
        <div className="fb-more">
          <button type="button" className="linkbtn" onClick={() => setShowMore(!showMore)}>{showMore ? "Menos filtros ▴" : "Mais filtros ▾"}</button>
          {showMore && <div className="fb-row">{more.map(Sel)}</div>}
        </div>
      )}
    </div>
  );
}
