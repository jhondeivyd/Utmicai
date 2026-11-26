"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

export const WS_PAGES: [string, string, string, boolean][] = [
  // caminho, nome, ícone, só para quem configura
  ["/dashboard", "Resumo", "dashboard", false],
  ["/campanhas", "Meta", "meta", false],
  ["/utms", "UTMs", "utm", true],
  ["/integracoes", "Integrações", "plug", true],
  ["/regras", "Regras", "rules", true],
  ["/taxas", "Taxas", "percent", true],
  ["/despesas", "Despesas", "money", true],
  ["/relatorios", "Relatórios", "report", false],
  ["/vendas", "Pedidos", "sales", false],
  ["/eventos", "Eventos", "events", true],
  ["/notificacoes", "Notificações", "bell", true]
];

type W = { id: string; name: string; role: string };
export default function Nav({ list, current, isAdmin }: { list: W[]; current?: string; isAdmin: boolean }) {
  const p = usePathname() || "";
  const [open, setOpen] = useState(true);
  const [exp, setExp] = useState<string | null>(current || null);
  const onWsPage = WS_PAGES.some(([h]) => p.startsWith(h));
  return (
    <nav className="nav">
      <button className={"nav-group" + (open ? " open" : "")} onClick={() => setOpen(!open)}>
        <Icon name="layers" /> Dashboards <span className="caret"><Icon name="chevron" size={14} /></span>
      </button>
      {open && list.map((w) => {
        const isCur = w.id === current, isExp = exp === w.id;
        const canEdit = isAdmin || w.role === "owner";
        return (
          <div key={w.id} className="ws-block">
            <button className={"ws-row" + (isCur ? " cur" : "") + (isExp ? " open" : "")} onClick={() => setExp(isExp ? null : w.id)} title={w.name}>
              <Icon name="box" size={16} /><span className="ws-n">{w.name}</span><span className="caret"><Icon name="chevron" size={13} /></span>
            </button>
            {isExp && (
              <div className="ws-sub">
                {WS_PAGES.filter(([, , , edit]) => !edit || canEdit).map(([href, label, icon]) => (
                  <a key={href} href={isCur ? href : `/api/ws?id=${w.id}&to=${encodeURIComponent(href)}`}
                    className={isCur && onWsPage && p.startsWith(href) ? "on" : ""}><Icon name={icon} size={16} />{label}</a>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {open && !list.length && <div className="note" style={{ padding: "4px 12px" }}>Nenhum dashboard ainda.</div>}
      <div className="sep" />
      <a href="/minha-conta" className={p.startsWith("/minha-conta") ? "on" : ""}><Icon name="user" />Minha conta</a>
      <a href="/avancado" className={p.startsWith("/avancado") ? "on" : ""}><Icon name="gear" />Avançado</a>
    </nav>
  );
}
