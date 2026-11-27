// Esqueleto mostrado enquanto a página carrega — o menu continua a responder
export default function Loading() {
  return (
    <div className="skel-wrap">
      <div className="skel skel-top" />
      <div className="skel-grid">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skel skel-tile" />)}</div>
      <div className="skel skel-block" />
    </div>
  );
}
