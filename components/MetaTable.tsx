"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BudgetCell from "./BudgetCell";
import ConfirmButton from "./ConfirmButton";
import Icon from "./Icon";

type Kind = "money" | "int" | "x" | "pct" | "special";
export const COLS: { key: string; label: string; kind: Kind; tip?: string }[] = [
  { key: "budget", label: "Orçamento", kind: "special" },
  { key: "lastupd", label: "Últ. atualização", kind: "special", tip: "Métricas no momento da última alteração (manual ou por regra)" },
  { key: "sales", label: "Vendas", kind: "int" },
  { key: "cpa", label: "CPA", kind: "money", tip: "Gasto ÷ vendas" },
  { key: "spend", label: "Gastos", kind: "money" },
  { key: "revenue", label: "Faturamento", kind: "money" },
  { key: "profit", label: "Lucro", kind: "money" },
  { key: "roas", label: "ROAS", kind: "x" },
  { key: "margin", label: "Margem", kind: "pct" },
  { key: "roi", label: "ROI", kind: "pct" },
  { key: "ic", label: "IC", kind: "int", tip: "Checkouts iniciados (Meta)" },
  { key: "cost_ic", label: "CPI", kind: "money", tip: "Custo por checkout iniciado" },
  { key: "cpc", label: "CPC", kind: "money" },
  { key: "ctr", label: "CTR", kind: "pct" },
  { key: "cpm", label: "CPM", kind: "money" },
  { key: "impressions", label: "Impressões", kind: "int" },
  { key: "link_clicks", label: "Cliques", kind: "int" },
  { key: "lpv", label: "Vis. página", kind: "int" },
  { key: "conv", label: "Conversão", kind: "pct" },
  { key: "ticket", label: "Ticket médio", kind: "money" },
  { key: "pending", label: "Pendentes", kind: "int" },
  { key: "refunds", label: "Reembolsos", kind: "int" },
  { key: "bid", label: "Bid cap", kind: "special" }
];
const DEFAULT = ["budget", "lastupd", "sales", "cpa", "spend", "revenue", "profit", "roas", "margin", "roi", "ic", "cost_ic", "cpc", "ctr", "cpm", "impressions", "link_clicks", "bid"];

function fmt(v: number, kind: Kind, cur: string) {
  if (v === null || v === undefined || !isFinite(v)) v = 0;
  if (kind === "money") { try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: cur }).format(v); } catch { return v.toFixed(2); } }
  if (kind === "int") return new Intl.NumberFormat("pt-BR").format(Math.round(v));
  if (kind === "x") return v.toFixed(2);
  return (v * 100).toFixed(2).replace(".", ",") + "%";
}

export type TRow = Record<string, any>;

export default function MetaTable(props: {
  level: "account" | "campaign" | "adset" | "ad"; rows: TRow[]; total: TRow; currency: string; can: boolean; wsId: string; ret: string; tz: string;
  childHref: Record<string, string>; lastUpd: Record<string, any>;
  toggleStatus: (fd: FormData) => void; changeBudget: (fd: FormData) => void; duplicateEntity: (fd: FormData) => void;
}) {
  const { level, rows, total, currency: cur, can, wsId, ret, lastUpd } = props;
  const [cols, setCols] = useState<string[]>(DEFAULT);
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<{ k: string; d: 1 | -1 }>({ k: "spend", d: -1 });
  useEffect(() => { try { const s = localStorage.getItem("utmcai_cols_v1"); if (s) setCols(JSON.parse(s)); } catch {} }, []);
  const save = (c: string[]) => { setCols(c); try { localStorage.setItem("utmcai_cols_v1", JSON.stringify(c)); } catch {} };
  const shown = cols.map((k) => COLS.find((c) => c.key === k)!).filter(Boolean)
    .filter((c) => !(c.key === "budget" && (level === "ad" || level === "account")) && !(c.key === "bid" && level !== "adset") && !(c.key === "lastupd" && level === "account"));

  const sorted = useMemo(() => {
    const k = sort.k;
    return [...rows].sort((a, b) => {
      if (k === "name") return sort.d * String(a.name).localeCompare(String(b.name));
      const av = k === "cpa" && !a.sales ? Infinity : a[k] ?? 0, bv = k === "cpa" && !b.sales ? Infinity : b[k] ?? 0;
      return sort.d * (av > bv ? 1 : av < bv ? -1 : 0);
    });
  }, [rows, sort]);

  const cell = (r: TRow, c: (typeof COLS)[number], isTotal = false) => {
    if (c.key === "budget") {
      if (isTotal) return fmt(r.daily_budget || 0, "money", cur);
      const disp = r.daily_budget ? fmt(r.daily_budget, "money", cur) : r.lifetime_budget ? fmt(r.lifetime_budget, "money", cur) : "—";
      return (
        <div>
          <BudgetCell action={props.changeBudget} editable={can && !!r.id && !!r.daily_budget} value={r.daily_budget ?? null} display={disp}
            hidden={{ ws: wsId, id: r.id || "", name: r.name, ret, old: String(r.daily_budget ?? ""), snap: JSON.stringify({ spend: r.spend, profit: r.profit, sales: r.sales, roi: r.roi }) }} />
          <div className="note">{r.daily_budget ? "Diário" : r.lifetime_budget ? "Vitalício" : level === "adset" ? "na campanha (CBO)" : level === "campaign" ? "nos conjuntos (ABO)" : ""}</div>
        </div>
      );
    }
    if (c.key === "lastupd") {
      const u = r.id ? lastUpd[r.id] : null;
      if (isTotal || !u) return <span className="mut">N/A</span>;
      const s = u.snapshot || {};
      return (
        <div className="lastupd" title={u.detail || ""}>
          <b>{u.action}</b>{s.spend !== undefined && <> · Gasto {fmt(s.spend, "money", cur)} | Lucro {fmt(s.profit, "money", cur)} | Vendas {s.sales} | ROI {Number(s.roi || 0).toFixed(2)}</>}
          <div>{new Date(u.created_at).toLocaleString("pt-BR", { timeZone: props.tz, dateStyle: "short", timeStyle: "short" })}{u.by ? ` · ${u.by}` : ""}</div>
        </div>
      );
    }
    if (c.key === "bid") return r.bid_amount ? fmt(r.bid_amount, "money", cur) : <span className="mut">N/A</span>;
    const v = r[c.key];
    if ((c.key === "cpa" || c.key === "ticket") && !r.sales) return <span className="mut">N/A</span>;
    if ((c.key === "roas" || c.key === "roi") && !r.spend) return <span className="mut">0,00</span>;
    if (c.key === "margin" && !r.revenue) return <span className="mut">N/A</span>;
    if (c.key === "cost_ic" && !r.ic) return <span className="mut">N/A</span>;
    const toneK = ["profit", "roi", "margin"].includes(c.key) ? (v > 0 ? "pos" : v < 0 ? "neg" : "") : c.key === "roas" ? (v >= 1 ? "pos" : "neg") : "";
    return <span className={toneK}>{fmt(v, c.kind, cur)}</span>;
  };

  const exportCsv = () => {
    const head = ["Status", "Nome", ...shown.filter((c) => c.key !== "lastupd").map((c) => c.label)];
    const lines = [head, ...sorted.map((r) => [r.status || "", r.name, ...shown.filter((c) => c.key !== "lastupd").map((c) =>
      c.key === "budget" ? (r.daily_budget ?? r.lifetime_budget ?? "") : c.key === "bid" ? (r.bid_amount ?? "") :
      c.kind === "pct" ? ((r[c.key] || 0) * 100).toFixed(2) : Number(r[c.key] || 0).toFixed(c.kind === "int" ? 0 : 2))])];
    const csv = lines.map((l) => l.map((x: any) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `utmcai-${level}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const H = (r: TRow) => (<><input type="hidden" name="ws" value={wsId} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="name" value={r.name} />
    <input type="hidden" name="ret" value={ret} /><input type="hidden" name="snap" value={JSON.stringify({ spend: r.spend, profit: r.profit, sales: r.sales, roi: r.roi })} /></>);
  const th = (k: string, label: string, n = true, tip?: string) => (
    <th key={k} className={n ? "n" : ""} style={{ cursor: "pointer" }} title={tip} onClick={() => setSort({ k, d: sort.k === k ? (-sort.d as 1 | -1) : -1 })}>
      {label}{tip ? " ⓘ" : ""}{sort.k === k ? (sort.d < 0 ? " ↓" : " ↑") : ""}
    </th>
  );
  const LV: Record<string, string> = { account: "Conta", campaign: "Campanha", adset: "Conjunto", ad: "Anúncio" };

  return (
    <div>
      <div className="inline" style={{ marginBottom: 10 }}>
        <div className="colpicker">
          <button className="icon-btn" title="Escolher e ordenar colunas" onClick={() => setOpen(!open)}><Icon name="config" size={15} /></button>
          {open && (
            <div className="menu">
              <div className="note" style={{ marginBottom: 6 }}>Colunas visíveis (use as setas para ordenar)</div>
              {[...cols, ...COLS.map((c) => c.key).filter((k) => !cols.includes(k))].map((k) => {
                const c = COLS.find((x) => x.key === k)!; const on = cols.includes(k); const i = cols.indexOf(k);
                return (
                  <div className="it" key={k}>
                    <input type="checkbox" checked={on} onChange={() => save(on ? cols.filter((x) => x !== k) : [...cols, k])} />{c.label}
                    {on && <span className="mv">
                      <button disabled={i === 0} onClick={() => { const n = [...cols]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; save(n); }}>↑</button>
                      <button disabled={i === cols.length - 1} onClick={() => { const n = [...cols]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; save(n); }}>↓</button>
                    </span>}
                  </div>
                );
              })}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => save(DEFAULT)}>Repor padrão</button>
            </div>
          )}
        </div>
        <button className="icon-btn" title="Exportar CSV" onClick={exportCsv}>↑</button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                {level !== "account" && <th style={{ width: 54 }}>Status</th>}
                {th("name", LV[level], false)}
                {shown.map((c) => (c.kind === "special" && c.key !== "budget" ? <th key={c.key} title={c.tip}>{c.label}{c.tip ? " ⓘ" : ""}</th> : th(c.key === "budget" ? "daily_budget" : c.key, c.label, c.key !== "budget", c.tip)))}
                {can && level !== "account" && <th></th>}
              </tr>
            </thead>
            <tbody>
              {!sorted.length && <tr><td colSpan={shown.length + 3} className="empty">Nada para mostrar no período.</td></tr>}
              {sorted.map((r) => (
                <tr key={r.key}>
                  {level !== "account" && <td>{can && r.id && (r.status === "ACTIVE" || r.status === "PAUSED") ? (
                    <form action={props.toggleStatus}>{H(r)}<input type="hidden" name="to" value={r.status === "ACTIVE" ? "PAUSED" : "ACTIVE"} />
                      <ConfirmButton className={"switch" + (r.status === "ACTIVE" ? " on" : "")} title={r.status === "ACTIVE" ? "Pausar" : "Ativar"}
                        msg={`${r.status === "ACTIVE" ? "Pausar" : "Ativar"} "${r.name}" no Meta?`}>{""}</ConfirmButton>
                    </form>) : <span className={"badge b-" + (r.status || "PAUSED")}>{r.status === "ACTIVE" ? "Ativa" : r.status ? r.status.toLowerCase() : "—"}</span>}</td>}
                  <td className="name">
                    {r.id && props.childHref[r.id] ? <Link href={props.childHref[r.id]} style={{ fontWeight: 600 }}>{r.name}</Link> : <span style={{ fontWeight: 600 }}>{r.name}</span>}
                    <div className="note">{r.effective_status && r.effective_status !== r.status ? r.effective_status.replace(/_/g, " ").toLowerCase() : r.id ? "" : "vendas sem ID"}</div>
                  </td>
                  {shown.map((c) => <td key={c.key} className={c.kind === "special" ? "" : "n"}>{cell(r, c)}</td>)}
                  {can && level !== "account" && <td>{r.id && (
                    <form action={props.duplicateEntity}>{H(r)}<input type="hidden" name="level" value={level} />
                      <ConfirmButton className="icon-btn" title="Duplicar (a cópia fica pausada)" msg={`Duplicar "${r.name}" no Meta? A cópia é criada pausada.`}><Icon name="copy" size={15} /></ConfirmButton>
                    </form>)}</td>}
                </tr>
              ))}
              {sorted.length > 0 && (
                <tr className="total">
                  {level !== "account" && <td>N/A</td>}
                  <td>{sorted.length} {LV[level].toLowerCase()}{sorted.length > 1 ? (level === "account" ? "s" : "s") : ""}</td>
                  {shown.map((c) => <td key={c.key} className={c.kind === "special" ? "" : "n"}>{cell(total, c, true)}</td>)}
                  {can && level !== "account" && <td></td>}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
