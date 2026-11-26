// Listas para escolher (em vez de escrever)
export const TIMEZONES: [string, string][] = [
  ["America/Sao_Paulo", "GMT-3 | Brasília"],
  ["America/Manaus", "GMT-4 | Manaus"],
  ["America/Rio_Branco", "GMT-5 | Acre"],
  ["America/Noronha", "GMT-2 | Fernando de Noronha"],
  ["Europe/Lisbon", "GMT+0 | Lisboa / Portugal"],
  ["Atlantic/Azores", "GMT-1 | Açores"],
  ["Europe/London", "GMT+0 | Londres"],
  ["Europe/Madrid", "GMT+1 | Europa Central (Madrid)"],
  ["Europe/Paris", "GMT+1 | Europa Central (Paris)"],
  ["Europe/Rome", "GMT+1 | Europa Central (Roma)"],
  ["Europe/Berlin", "GMT+1 | Europa Central (Berlim)"],
  ["Europe/Athens", "GMT+2 | Europa de Leste"],
  ["America/New_York", "GMT-5 | Nova Iorque"],
  ["America/Chicago", "GMT-6 | Chicago"],
  ["America/Denver", "GMT-7 | Denver"],
  ["America/Los_Angeles", "GMT-8 | Los Angeles"],
  ["America/Mexico_City", "GMT-6 | Cidade do México"],
  ["America/Bogota", "GMT-5 | Bogotá"],
  ["America/Lima", "GMT-5 | Lima"],
  ["America/Santiago", "GMT-4 | Santiago"],
  ["America/Argentina/Buenos_Aires", "GMT-3 | Buenos Aires"],
  ["Africa/Luanda", "GMT+1 | Luanda"],
  ["Africa/Maputo", "GMT+2 | Maputo"],
  ["Asia/Dubai", "GMT+4 | Dubai"],
  ["UTC", "GMT+0 | UTC"]
];
export const CURRENCIES: [string, string][] = [
  ["EUR", "Euro (€)"], ["BRL", "Real (R$)"], ["USD", "Dólar (US$)"], ["GBP", "Libra (£)"], ["CHF", "Franco suíço (CHF)"],
  ["MXN", "Peso mexicano (MX$)"], ["ARS", "Peso argentino (AR$)"], ["COP", "Peso colombiano (COL$)"], ["CLP", "Peso chileno (CLP)"],
  ["AOA", "Kwanza (Kz)"], ["MZN", "Metical (MT)"], ["CAD", "Dólar canadiano (CA$)"], ["AUD", "Dólar australiano (A$)"]
];
export const VIEW_TYPES: [string, string][] = [["normal", "Faturamento Normal"], ["total", "Faturamento Total"]];
export const tzLabel = (tz: string) => TIMEZONES.find(([v]) => v === tz)?.[1] || tz;
export const curLabel = (c: string) => CURRENCIES.find(([v]) => v === c)?.[1] || c;
export const viewLabel = (v: string) => VIEW_TYPES.find(([k]) => k === v)?.[1] || "Faturamento Normal";
