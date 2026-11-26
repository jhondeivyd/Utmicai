"use client";
export default function WsSwitcher({ list, current }: { list: { id: string; name: string }[]; current?: string }) {
  if (list.length < 2) return <span className="ws-name" style={{ fontWeight: 600, color: "#e7e9f0" }}>{list[0]?.name || "—"}</span>;
  return (
    <select className="ws-select" defaultValue={current}
      onChange={(e) => { document.cookie = `ws=${e.target.value};path=/;max-age=31536000;SameSite=Lax`; location.reload(); }}>
      {list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
  );
}
