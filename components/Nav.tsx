"use client";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
export default function Nav({ canEdit, isAdmin }: { canEdit: boolean; isAdmin: boolean }) {
  const p = usePathname();
  const items = [
    ["/dashboard", "Resumo", "dashboard"], ["/campanhas", "Meta", "campaigns"], ["/vendas", "Pedidos", "sales"],
    ...(canEdit ? [["/regras", "Regras", "rules"]] : [])
  ];
  const bottom = [...(canEdit ? [["/config", "Configurações", "config"]] : []), ...(isAdmin ? [["/admin", "Admin", "admin"]] : [])];
  const L = ([href, label, icon]: string[]) => (
    <a key={href} href={href} className={p?.startsWith(href) ? "on" : ""}><Icon name={icon} />{label}</a>
  );
  return <nav className="nav">{items.map(L)}{bottom.length > 0 && <div className="sep" />}{bottom.map(L)}</nav>;
}
