import { Logo } from "@/components/Icon";

export const dynamic = "force-dynamic";

// Página final do link de ligação (aberta no navegador multilogin)
export default async function Ligado({ searchParams }: { searchParams: Promise<{ e?: string; nome?: string; ws?: string }> }) {
  const sp = await searchParams;
  const erro = sp.e;
  return (
    <div className="login">
      <div className="card form" style={{ textAlign: "center", gap: 14 }}>
        <div className="brand" style={{ justifyContent: "center", margin: 0 }}><Logo /><b>Utm<span>Cai</span></b></div>
        {erro ? (
          <>
            <h2 style={{ margin: 0 }}>Não deu para ligar</h2>
            <p className="note">{erro}</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, lineHeight: 1 }}>✅</div>
            <h2 style={{ margin: 0 }}>Facebook ligado{sp.nome ? ` — ${sp.nome}` : ""}</h2>
            <p className="note">Pode fechar esta janela. Volte ao UtmCai no seu navegador normal{sp.ws ? "" : ""} e escolha as contas de anúncio em Integrações → Anúncios.</p>
          </>
        )}
      </div>
    </div>
  );
}
