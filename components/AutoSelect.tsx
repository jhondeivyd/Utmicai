"use client";
import { useTransition } from "react";
// <select> que aplica o filtro assim que muda, sem recarregar a página toda
export default function AutoSelect({ name, defaultValue, options }: { name: string; defaultValue: string; options: [string, string][] }) {
  const [pending, start] = useTransition();
  return (
    <select className="input" name={name} defaultValue={defaultValue} disabled={pending}
      onChange={(e) => { const f = e.currentTarget.form; start(() => f?.requestSubmit()); }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
