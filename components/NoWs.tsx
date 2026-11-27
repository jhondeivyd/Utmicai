import Link from "next/link";
export default function NoWs() {
  return (
    <div className="card empty-state">
      <h2>Crie o seu primeiro dashboard</h2>
      <p className="mut">Cada dashboard é um negócio ou cliente, com o seu fuso horário, moeda, Meta Ads e checkouts.</p>
      <Link className="btn" href="/avancado?new=1">Novo Dashboard</Link>
    </div>
  );
}
