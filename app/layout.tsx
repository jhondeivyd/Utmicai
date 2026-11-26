import "./globals.css";
export const metadata = { title: "UtmCai", description: "Rastreamento de vendas por UTM" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="pt-BR"><body>{children}</body></html>);
}
