"use client";
// Exporta uma tabela para CSV (abre no Excel)
export default function CsvButton({ name, rows }: { name: string; rows: (string | number)[][] }) {
  const go = () => {
    const csv = "﻿" + rows.map((r) => r.map((c) => {
      const v = typeof c === "number" ? String(c).replace(".", ",") : String(c ?? "");
      return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name; a.click();
  };
  return <button type="button" className="btn btn-ghost btn-sm" onClick={go}>Exportar CSV</button>;
}
