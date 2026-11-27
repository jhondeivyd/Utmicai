import Link from "next/link";
const P = [["today", "Hoje"], ["yesterday", "Ontem"], ["7d", "7 dias"], ["30d", "30 dias"], ["month", "Este mês"]];
export default function RangeBar({ base, p, from, to, extra = {} }: { base: string; p: string; from: string; to: string; extra?: Record<string, string> }) {
  const qs = (o: Record<string, string>) => "?" + new URLSearchParams({ ...extra, ...o }).toString();
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <div className="tabs">{P.map(([k, l]) => <Link key={k} className={"tab" + (p === k ? " on" : "")} href={base + qs({ p: k })}>{l}</Link>)}</div>
      <form method="get" action={base} style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="p" value="custom" />
        <input className="input" type="date" name="from" defaultValue={from} style={{ width: 150 }} />
        <input className="input" type="date" name="to" defaultValue={to} style={{ width: 150 }} />
        <button className="btn btn-ghost btn-sm">OK</button>
      </form>
    </div>
  );
}
