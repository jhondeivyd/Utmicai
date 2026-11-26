"use client";
import { useState } from "react";
export default function BudgetCell({ action, hidden, value, display, editable }:
  { action: (fd: FormData) => void; hidden: Record<string, string>; value: number | null; display: string; editable: boolean }) {
  const [edit, setEdit] = useState(false);
  if (!editable || value == null) return <span className="mut">{display}</span>;
  if (!edit) return <button className="btn btn-ghost btn-sm" onClick={() => setEdit(true)} title="Alterar orçamento diário">{display}</button>;
  return (
    <form action={action} className="inline" onSubmit={(e) => {
      const v = (e.currentTarget.elements.namedItem("value") as HTMLInputElement).value;
      if (!window.confirm(`Alterar o orçamento diário para ${v} no Meta?`)) e.preventDefault();
    }}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input className="input budget-input" name="value" defaultValue={value} inputMode="decimal" autoFocus />
      <button className="btn btn-sm">OK</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(false)}>×</button>
    </form>
  );
}
