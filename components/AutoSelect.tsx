"use client";
// <select> que envia o formulário assim que muda
export default function AutoSelect({ name, defaultValue, options }: { name: string; defaultValue: string; options: [string, string][] }) {
  return (
    <select className="input" name={name} defaultValue={defaultValue} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
