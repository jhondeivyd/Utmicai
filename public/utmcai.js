/*!
 * UtmCai tracker — captura UTMs, regista o clique e repassa tudo até o checkout.
 * Instalação (no <head> de todas as páginas do funil):
 *   <script src="https://SEU-APP/utmcai.js" data-ws="SUA_CHAVE_PUBLICA" async></script>
 * Opcional: data-domains="pay.checkout.com,kashpay.com.br" (limita para onde as UTMs vão)
 * Debug: abra a página com ?utm_debug=1
 */
(function () {
  "use strict";
  if (window.UtmCai) return;

  var me = document.currentScript || document.querySelector('script[src*="utmcai.js"]');
  var WS = me && me.getAttribute("data-ws");
  var ENDPOINT = me ? new URL(me.src).origin + "/api/collect" : "";
  var DOMAINS = ((me && me.getAttribute("data-domains")) || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  var KEY = "_utmcai", DAYS = 30;
  var PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "fbclid"];
  var SKIP_HOSTS = /(^|\.)(facebook|instagram|whatsapp|wa|youtube|google|tiktok|twitter|x|t|linkedin)\.(com|me|co)$/;
  var DEBUG = /[?&]utm_debug=1/.test(location.search);
  function log() { if (DEBUG && window.console) console.log.apply(console, ["[UtmCai]"].concat([].slice.call(arguments))); }
  if (!WS) { console.warn("[UtmCai] falta data-ws no script"); }

  /* ---------- cookies / storage ---------- */
  function rootDomain() {
    var h = location.hostname, p = h.split(".");
    if (/^[\d.]+$/.test(h) || p.length < 2) return "";
    var n = (p.length > 2 && p[p.length - 2].length <= 3) ? 3 : 2;
    return "." + p.slice(-n).join(".");
  }
  function setCookie(n, v, days) {
    var d = new Date(Date.now() + days * 864e5), dom = rootDomain();
    document.cookie = n + "=" + encodeURIComponent(v) + ";expires=" + d.toUTCString() + ";path=/" +
      (dom ? ";domain=" + dom : "") + ";SameSite=Lax" + (location.protocol === "https:" ? ";Secure" : "");
  }
  function getCookie(n) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (!raw) raw = getCookie(KEY);
    try { var o = JSON.parse(raw); if (o && o.exp > Date.now() && o.cid) return o; } catch (e) {}
    return null;
  }
  function save(o) {
    o.exp = Date.now() + DAYS * 864e5;
    var s = JSON.stringify(o);
    try { localStorage.setItem(KEY, s); } catch (e) {}
    setCookie(KEY, s, DAYS);
  }
  function newCid() {
    var c = "abcdefghijklmnopqrstuvwxyz0123456789", s = "uc", a = new Uint8Array(18);
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < 18; i++) s += c[a[i] % 36];
    return s;
  }

  /* ---------- captura ---------- */
  var q = new URLSearchParams(location.search), fromUrl = {}, hasPaid = false;
  PARAMS.forEach(function (k) {
    var v = q.get(k);
    if (v && !/^\{\{.*\}\}$/.test(v)) { fromUrl[k] = v; if (k === "utm_source" || k === "fbclid") hasPaid = true; }
  });
  // cid vindo de outra página do funil (domínio diferente)
  var cidFromUrl = q.get("utmcai_cid");
  var state = load();

  if (hasPaid) {
    // novo clique pago → novo cid (último clique)
    var keep = (!fromUrl.utm_source && state) ? state.u : {};
    state = { cid: (cidFromUrl && /^uc[a-z0-9]{18}$/.test(cidFromUrl)) ? cidFromUrl : newCid(), u: Object.assign({}, keep, fromUrl), sent: false };
  } else if (cidFromUrl && /^uc[a-z0-9]{18}$/.test(cidFromUrl) && (!state || state.cid !== cidFromUrl)) {
    state = { cid: cidFromUrl, u: {}, sent: true };
  } else if (!state) {
    state = { cid: newCid(), u: {}, sent: false }; // visita orgânica/direta
  }
  save(state);

  if (fromUrl.fbclid && (!getCookie("_fbc") || getCookie("_fbc").split(".").pop() !== fromUrl.fbclid)) {
    setCookie("_fbc", "fb.1." + Date.now() + "." + fromUrl.fbclid, 90);
  }

  /* ---------- envia o clique ---------- */
  function send(extraOnly) {
    if (!WS || !ENDPOINT) return;
    var body = { k: WS, cid: state.cid, fbp: getCookie("_fbp"), fbc: getCookie("_fbc") };
    if (!extraOnly) {
      Object.assign(body, state.u);
      body.url = location.href.slice(0, 1000);
      body.ref = document.referrer.slice(0, 1000);
    }
    var s = JSON.stringify(body);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([s], { type: "text/plain" }))) return;
    } catch (e) {}
    try { fetch(ENDPOINT, { method: "POST", body: s, keepalive: true, headers: { "Content-Type": "text/plain" } }); } catch (e) {}
  }
  if (!state.sent) { send(false); state.sent = true; save(state); log("clique registado", state); }
  // o _fbp do Pixel costuma aparecer um pouco depois → completa
  setTimeout(function () { if (getCookie("_fbp")) send(true); }, 2500);

  /* ---------- repasse ---------- */
  function outParams() {
    var p = {};
    Object.keys(state.u).forEach(function (k) { if (state.u[k]) p[k] = state.u[k]; });
    p.utmcai_cid = state.cid;
    p.src = state.cid;
    p.sck = state.cid;
    return p;
  }
  function isTarget(u) {
    if (!/^https?:$/.test(u.protocol)) return false;
    var h = u.hostname;
    if (h === location.hostname) return true;
    if (DOMAINS.length) return DOMAINS.some(function (d) { return h === d || h.slice(-(d.length + 1)) === "." + d; });
    return !SKIP_HOSTS.test(h);
  }
  function decorate(url) {
    try {
      var u = new URL(url, location.href);
      if (!isTarget(u)) return url;
      var p = outParams();
      Object.keys(p).forEach(function (k) { u.searchParams.set(k, p[k]); });
      if (/(^|\.)stripe\.com$/.test(u.hostname)) u.searchParams.set("client_reference_id", state.cid);
      return u.toString();
    } catch (e) { return url; }
  }
  function decorateAll() {
    document.querySelectorAll("a[href]").forEach(function (a) {
      var h = a.getAttribute("href");
      if (!h || h.charAt(0) === "#" || /^(mailto|tel|javascript|sms):/i.test(h)) return;
      var n = decorate(a.href); if (n !== a.href) a.href = n;
    });
    document.querySelectorAll("form").forEach(function (f) {
      try { if (!isTarget(new URL(f.action || location.href, location.href))) return; } catch (e) { return; }
      var p = outParams();
      Object.keys(p).forEach(function (k) {
        var i = f.querySelector('input[name="' + k + '"]');
        if (!i) { i = document.createElement("input"); i.type = "hidden"; i.name = k; f.appendChild(i); }
        i.value = p[k];
      });
    });
  }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[href]");
    if (a) { var n = decorate(a.href); if (n !== a.href) a.href = n; }
  }, true);
  var _open = window.open;
  window.open = function (url) {
    var a = [].slice.call(arguments);
    if (typeof url === "string") a[0] = decorate(url);
    return _open.apply(window, a);
  };

  function init() {
    decorateAll();
    if (window.MutationObserver) {
      var t;
      new MutationObserver(function () { clearTimeout(t); t = setTimeout(decorateAll, 150); })
        .observe(document.documentElement, { childList: true, subtree: true });
    }
    if (DEBUG) panel();
  }
  function panel() {
    var d = document.createElement("div");
    d.style.cssText = "position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#0b1220;color:#9ef0c0;font:12px/1.5 monospace;padding:12px;border-radius:10px;max-width:420px;max-height:55vh;overflow:auto;box-shadow:0 6px 24px rgba(0,0,0,.5)";
    var rows = ["<b style='color:#fff'>UtmCai</b> · ws " + (WS || "<span style='color:#f87171'>FALTA data-ws</span>"), "cid: " + state.cid];
    Object.keys(state.u).forEach(function (k) { rows.push(k + " = " + state.u[k]); });
    if (!Object.keys(state.u).length) rows.push("<span style='color:#fbbf24'>sem UTMs (orgânico/direto)</span>");
    rows.push("_fbc: " + (getCookie("_fbc") || "—"), "_fbp: " + (getCookie("_fbp") || "—"));
    var links = [].slice.call(document.querySelectorAll("a[href]")).filter(function (a) { return a.hostname !== location.hostname && a.href.indexOf("utmcai_cid=") > -1; });
    rows.push("<b style='color:#fff'>links com rastreio: " + links.length + "</b>");
    links.slice(0, 4).forEach(function (a) { rows.push("<span style='color:#94a3b8;word-break:break-all'>" + a.href + "</span>"); });
    d.innerHTML = rows.join("<br>");
    document.body.appendChild(d);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  window.UtmCai = {
    cid: function () { return state.cid; },
    utms: function () { return Object.assign({}, state.u); },
    decorate: decorate,
    refresh: decorateAll
  };
})();
