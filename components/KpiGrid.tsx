"use client";
import { useEffect, useState } from "react";

type Tile = { key: string; label: string; value: string; sub?: string; tone?: "pos" | "neg" | "warn" | ""; hero?: boolean };
const DEFAULT = ["revenue", "spend", "profit", "roas", "sales", "cpa", "roi", "pending", "net", "ticket", "conv", "tracked"];

export default function KpiGrid({ tiles }: { tiles: Tile[] }) {
  const [sel, setSel] = useState<string[]>(DEFAULT);
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    try { const s = localStorage.getItem("utmcai_tiles"); if (s) setSel(JSON.parse(s)); } catch {}
  }, []);
  const save = (next: string[]) => { setSel(next); try { localStorage.setItem("utmcai_tiles", JSON.stringify(next)); } catch {} };
  const shown = sel.map((k) => tiles.find((t) => t.key === k)).filter(Boolean) as Tile[];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setEdit(!edit)}>{edit ? "Concluir" : "Personalizar métricas"}</button>
      </div>
      {edit && (
        <div className="customize">
          {tiles.map((t) => (
            <button key={t.key} className={"chip" + (sel.includes(t.key) ? " on" : "")}
              onClick={() => save(sel.includes(t.key) ? sel.filter((x) => x !== t.key) : [...sel, t.key])}>{t.label}</button>
          ))}
          <button className="chip" onClick={() => save(DEFAULT)}>Repor padrão</button>
        </div>
      )}
      <div className="kpis">
        {shown.map((t) => (
          <div key={t.key} className={"card kpi" + (t.hero ? " hero" : "")}>
            <div className="l">{t.label}</div>
            <div className={"v " + (t.tone || "")}>{t.value}</div>
            {t.sub && <div className="s">{t.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
