"use client";
import { useState } from "react";
export default function CopyBox({ value, label }: { value: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="copybox">
      {label && <div className="copybox-label">{label}</div>}
      <div className="copybox-row">
        <code>{value}</code>
        <button type="button" className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }}>
          {ok ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
