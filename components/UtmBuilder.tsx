"use client";
import { useState } from "react";

// Gera um link com UTMs para tráfego orgânico (bio, stories, e-mail...)
export default function UtmBuilder() {
  const [v, setV] = useState({ url: "", utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" });
  const [out, setOut] = useState("");
  const [copied, setCopied] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const gen = () => {
    if (!v.url || !v.utm_source) { setOut("Preencha o link e o utm_source"); return; }
    try {
      const u = new URL(/^https?:\/\//.test(v.url) ? v.url : "https://" + v.url);
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) if ((v as any)[k]) u.searchParams.set(k, (v as any)[k].trim());
      setOut(u.toString());
    } catch { setOut("Link inválido"); }
  };
  const F = (k: string, label: string, ph: string) => <label>{label}<input className="input" value={(v as any)[k]} onChange={set(k)} placeholder={ph} /></label>;
  return (
    <div className="form">
      {F("url", "Link da URL", "https://seusite.com")}
      <div className="row2">{F("utm_source", "utm_source (Origem) *", "bio")}{F("utm_medium", "utm_medium (Meio)", "instagram")}</div>
      <div className="row2">{F("utm_campaign", "utm_campaign (Campanha)", "perfil")}{F("utm_content", "utm_content (Conteúdo)", "link-bio")}</div>
      {F("utm_term", "utm_term (Termo)", "promo")}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn" onClick={gen}>Gerar URL</button>
        <input className="input" readOnly value={out} placeholder="A URL gerada aparecerá aqui" />
        <button type="button" className="btn btn-ghost" disabled={!out.startsWith("http")}
          onClick={() => { navigator.clipboard.writeText(out); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copiado" : "Copiar"}</button>
      </div>
    </div>
  );
}
