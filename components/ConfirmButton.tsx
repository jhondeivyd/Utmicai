"use client";
// Botão de envio que pede confirmação antes (para ações no Meta)
export default function ConfirmButton({ msg, className, title, children }: { msg: string; className?: string; title?: string; children: React.ReactNode }) {
  return (
    <button className={className} title={title} onClick={(e) => { if (!window.confirm(msg)) e.preventDefault(); }}>{children}</button>
  );
}
