/* ============================================================
   PlanoFerias — app (lógica de negócio + rendering)
   ------------------------------------------------------------
   Ligado ao Supabase via js/api.js. Acesso restrito aos 2
   membros autorizados (Diogo + Margarida) — ver db/functions.sql.
   Sem modo local/offline: os dados vivem sempre no Supabase.
   ============================================================ */

import { API } from "./api.js";
import { IS_CONFIGURED } from "./config.js";
import { LOAD_ERROR } from "./supabase.js";

/* ---------- estado ---------- */
let DATA = null, myProfile = null, eventsBound = false;
let chS = null, chM = null, chSim = null, editId = null, editPenaId = null;
let showPast = false, showPastPena = false, penaLastSug = null, reforcoMode = false, penaSign = -1;
let mTipo = "contribuicao", simType = "deposito";

/* ---------- utils ---------- */
const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const fmt = (v) => eur.format(v || 0);
const r2 = (v) => Math.round((v || 0) * 100) / 100;
function mult5up(v) { return Math.ceil((v || 0) / 5) * 5; }
function mult5dn(v) { return Math.floor((v || 0) / 5) * 5; }
function splitBy(total, p) { const dp = (typeof p === "number" ? p : 55); const dio = mult5up((total || 0) * dp / 100); const marg = mult5dn((total || 0) * (100 - dp) / 100); return { dio: r2(dio), marg: r2(marg), total: r2(dio + marg) }; }
function defPct() { return (DATA.config.split && DATA.config.split.Diogo) || 55; }
function split55(total) { return splitBy(total, defPct()); }
function segAt(mk, segs) { let cur = null; segs.forEach(s => { if (s.desde <= mk) cur = s; }); return cur; }
function ratioForDate(dateISO, sims) { const segs = planSegments(sims); const mk = (dateISO || "").slice(0, 7); let cur = segAt(mk, segs) || segs[0]; return cur && typeof cur.diogoPct === "number" ? cur.diogoPct : defPct(); }
function fmtDate(iso) { if (!iso) return ""; const [y, m, d] = iso.split("-"); return d + "/" + m + "/" + y; }
function fmtDayMonth(iso) { if (!iso) return ""; const [y, m, d] = iso.split("-"); return d + "/" + m; }
const MS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function fmtMesAno(iso) { const [y, m] = iso.split("-"); return MS[+m - 1] + "/" + y.slice(2); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function esc(s) { return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function toast(t) { const e = document.getElementById("toast"); e.textContent = t; e.classList.add("show"); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("show"), 2400); }
function setState(cls, txt) { const p = document.getElementById("statePill"); p.className = "statepill " + cls; document.getElementById("stateTxt").textContent = txt; }

/* Copia para `target` os campos escalares vindos da API, preservando
   sempre target.planoMensal.segmentos (a config da BD não guarda os
   segmentos — vivem na tabela plano_segmentos, geridos à parte). */
function mergeConfig(target, upd) {
  Object.assign(target, { titulo: upd.titulo, subtitulo: upd.subtitulo, saldoInicial: upd.saldoInicial, dataInicial: upd.dataInicial, split: upd.split, buffer: upd.buffer });
  Object.assign(target.planoMensal, { ativo: upd.planoMensal.ativo, diaMes: upd.planoMensal.diaMes, ate: upd.planoMensal.ate });
}

/* ---------- geração plano + livro ---------- */
function planSegments(sims) {
  const pm = DATA.config.planoMensal; const dp = defPct();
  let segs = (pm.segmentos || []).map(s => ({ desde: s.desde, valorTotal: s.valorTotal, diogoPct: typeof s.diogoPct === "number" ? s.diogoPct : dp }));
  (sims || []).filter(s => s.tipo === "mensal").forEach(s => {
    let p = s.diogoPct; if (typeof p !== "number") { let cur = null; segs.forEach(x => { if (x.desde <= s.desde) cur = x; }); p = cur ? cur.diogoPct : dp; }
    segs.push({ desde: s.desde, valorTotal: s.valorTotal, diogoPct: p });
  });
  segs.sort((a, b) => a.desde < b.desde ? -1 : 1); return segs;
}
function monthlyValue(mk, segs) { let v = 0; segs.forEach(s => { if (s.desde <= mk) v = s.valorTotal; }); return v; }
function genMonthly(sims) {
  const pm = DATA.config.planoMensal; if (!pm.ativo) return [];
  const segs = planSegments(sims); if (!segs.length) return [];
  const start = segs[0].desde, end = pm.ate; if (end < start) return [];
  const dia = String(Math.min(28, Math.max(1, pm.diaMes || 1))).padStart(2, "0");
  let [y, m] = start.split("-").map(Number); const [ey, em] = end.split("-").map(Number); const out = [];
  while (y < ey || (y === ey && m <= em)) {
    const mk = y + "-" + String(m).padStart(2, "0"); const seg = segAt(mk, segs); const v = seg ? seg.valorTotal : 0;
    if (v > 0) { const sp = splitBy(v, seg.diogoPct);
      out.push({ id: "auto-" + mk + "-d", data: mk + "-" + dia, descricao: "Poupança Diogo", valor: sp.dio, tipo: "contribuicao", pessoa: "Diogo", auto: true });
      out.push({ id: "auto-" + mk + "-m", data: mk + "-" + dia, descricao: "Poupança Margarida", valor: sp.marg, tipo: "contribuicao", pessoa: "Margarida", auto: true }); }
    m++; if (m > 12) { m = 1; y++; }
  } return out;
}
function buildLedger(sims) {
  const concrete = DATA.movimentos.map(m => Object.assign({}, m));
  const monthly = genMonthly(sims);
  const deps = (sims || []).filter(s => s.tipo === "deposito").map(s => ({ id: "sim-" + s.id, data: s.data, descricao: (s.desc || "Depósito extra") + " (sim)", valor: Math.abs(+s.valor), tipo: "contribuicao", pessoa: "Comum", sim: true }));
  const penaTops = penaCompute().tops.map(t => ({ id: "penas-" + t.id, data: t.data, descricao: "Penas: " + t.obs, valor: -t.valor, tipo: "despesa", pessoa: "Comum", auto: true }));
  const all = [...concrete, ...monthly, ...deps, ...penaTops].sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
  let bal = DATA.config.saldoInicial; const out = [];
  for (const m of all) { bal += m.valor; out.push(Object.assign({}, m, { saldo: r2(bal) })); }
  return out;
}
function targetDate(L) { const h = new Date(); const nye = (h.getFullYear() + 1) + "-12-31"; const last = L.length ? L[L.length - 1].data : DATA.config.dataInicial; return last < nye ? last : nye; }
function calc(L) {
  const t = todayISO(); let saldoHoje = DATA.config.saldoInicial; L.forEach(m => { if (m.data <= t) saldoHoje = m.saldo; });
  const td = targetDate(L); let saldoTarget = DATA.config.saldoInicial; L.forEach(m => { if (m.data <= td) saldoTarget = m.saldo; });
  const upto = L.filter(m => m.data <= td);
  const desp = upto.filter(m => m.tipo === "despesa");
  const low = [...desp].sort((a, b) => a.saldo - b.saldo).slice(0, 3);
  let c = 0, r = 0, d = 0; L.forEach(m => { if (m.tipo === "contribuicao") c += m.valor; else if (m.tipo === "receita") r += m.valor; else if (m.tipo === "despesa") d += m.valor; });
  return { L, saldoHoje: r2(saldoHoje), target: td, saldoTarget: r2(saldoTarget), low, c: r2(c), r: r2(r), d: r2(d) };
}

/* ---------- HERO + RESUMO ---------- */
function renderHeader() {
  document.getElementById("appTitle").textContent = DATA.config.titulo || "Plano de Férias";
  const M = calc(buildLedger());
  document.getElementById("saldoHoje").textContent = fmt(M.saldoHoje);
  document.getElementById("saldoHojeMeta").textContent = "Em " + fmtDate(todayISO());
  const mn = M.low[0] || { saldo: M.saldoTarget, data: M.target, descricao: "" };
  document.getElementById("menorSaldo").textContent = fmt(mn.saldo);
  document.getElementById("menorSaldoMeta").textContent = fmtDate(mn.data) + (mn.descricao ? " · " + mn.descricao : "");
}
function renderResumo() {
  const t = todayISO(), buf = DATA.config.buffer || 0, L = buildLedger();
  const ref = L.filter(m => m.tipo === "contribuicao" && !m.auto && m.data >= t).sort((a, b) => a.data < b.data ? -1 : 1).slice(0, 6);
  const rbox = document.getElementById("proxReforcos");
  if (!ref.length) { rbox.innerHTML = '<div class="empty"><div class="ic">✦</div>Sem reforços extraordinários previstos.</div>'; }
  else rbox.innerHTML = ref.map(m => '<div class="proxrow"><span class="d num">' + fmtDayMonth(m.data) + '</span><span class="n">' + esc(m.descricao) + '</span><span class="vbox"><span class="v num pos">+' + fmt(m.valor) + "</span></span></div>").join("");
  const prox = L.filter(m => m.tipo === "despesa" && m.data >= t).sort((a, b) => a.data < b.data ? -1 : 1).slice(0, 6);
  const box = document.getElementById("proxDespesas");
  if (!prox.length) { box.innerHTML = '<div class="empty"><div class="ic">✦</div>Sem despesas futuras registadas.</div>'; }
  else box.innerHTML = prox.map(m => '<div class="proxrow"><span class="d num">' + fmtDayMonth(m.data) + '</span><span class="n">' + esc(m.descricao) + '</span><span class="vbox"><span class="v num">' + fmt(m.valor) + '</span><span class="s num' + (m.saldo < buf ? " low" : "") + '">' + fmt(m.saldo) + "</span></span></div>").join("");
}

/* ---------- MOVIMENTOS ---------- */
function renderMov() {
  const L = buildLedger(), t = todayISO(), buf = DATA.config.buffer || 0;
  const C = calc(L); const minSaldo = C.low[0] ? C.low[0].saldo : null, minData = C.low[0] ? C.low[0].data : null;
  const fs = document.getElementById("mSearch").value.toLowerCase().trim();
  const ft = document.getElementById("mTipo").value;
  const pastCount = L.filter(m => m.data < t).length;
  const btn = document.getElementById("btnPast");
  if (btn) { btn.style.display = pastCount ? "inline-flex" : "none"; btn.textContent = showPast ? "Ocultar anteriores" : "Mostrar anteriores (" + pastCount + ")"; btn.classList.toggle("primary", showPast); }
  const rows = L.filter(m => (showPast || m.data >= t) && (!fs || m.descricao.toLowerCase().includes(fs)) && (!ft || m.tipo === ft));
  const body = document.getElementById("movBody");
  if (!rows.length) { body.innerHTML = '<tr><td colspan="3"><div class="empty"><div class="ic">∅</div>Sem movimentos.</div></td></tr>'; return; }
  let html = "", lastM = "";
  rows.forEach(m => {
    const mo = m.data.slice(0, 7);
    if (mo !== lastM) { lastM = mo; html += '<tr class="divider-month"><td colspan="3">' + fmtMesAno(m.data) + "</td></tr>"; }
    const fut = m.data > t, pos = m.valor >= 0;
    const chip = m.tipo === "contribuicao" ? '<span class="chip contrib">Contribuição</span>' : m.tipo === "receita" ? '<span class="chip receita">Receita</span>' : '<span class="chip despesa">Despesa</span>';
    const isMin = m.data === minData && m.saldo === minSaldo;
    const editable = !m.auto;
    html += '<tr class="' + (fut ? "future " : "") + (isMin ? "minrow " : "") + (m.auto ? "autorow " : "") + '"' + (editable ? ' data-edit="' + m.id + '"' : "") + ">"
      + '<td class="datecell">' + fmtDayMonth(m.data) + "</td>"
      + '<td class="desccell"><b>' + esc(m.descricao) + "</b><div class=\"tcell\">" + chip + (m.auto ? ' <span class="tag-auto">auto</span>' : "") + "</div></td>"
      + '<td class="r valcell"><span class="val num ' + (pos ? "pos" : "neg") + '">' + fmt(m.valor) + "</span>"
      + '<span class="saldo num ' + (m.saldo < buf ? "low" : "") + '">' + fmt(m.saldo) + "</span></td></tr>";
  });
  body.innerHTML = html;
  body.querySelectorAll("tr[data-edit]").forEach(tr => tr.onclick = () => openMov(+tr.dataset.edit));
}

/* ---------- MODAL movimento ---------- */
function openMov(id) {
  reforcoMode = false;
  editId = id || null;
  document.getElementById("movModalTitle").textContent = id ? "Editar movimento" : "Novo movimento";
  document.getElementById("btnDelMov").style.display = id ? "flex" : "none";
  if (id) { const m = DATA.movimentos.find(x => x.id === id); mTipo = m.tipo;
    document.getElementById("fData").value = m.data; document.getElementById("fValor").value = Math.abs(m.valor); document.getElementById("fDesc").value = m.descricao; }
  else { mTipo = "contribuicao"; document.getElementById("fData").value = todayISO(); document.getElementById("fValor").value = ""; document.getElementById("fDesc").value = ""; }
  document.querySelectorAll("#segTipo button").forEach(b => b.classList.toggle("on", b.dataset.t === mTipo));
  show("ovMov");
}
function openReforcoMov(total) {
  reforcoMode = true; editId = null; mTipo = "contribuicao";
  document.getElementById("movModalTitle").textContent = "Registar reforço";
  document.getElementById("btnDelMov").style.display = "none";
  document.getElementById("fData").value = todayISO();
  document.getElementById("fValor").value = total;
  document.getElementById("fDesc").value = "Reforço";
  document.querySelectorAll("#segTipo button").forEach(b => b.classList.toggle("on", b.dataset.t === mTipo));
  show("ovMov");
}
async function saveMov() {
  const data = document.getElementById("fData").value; let v = parseFloat(document.getElementById("fValor").value);
  const desc = document.getElementById("fDesc").value.trim();
  if (!data || isNaN(v) || !desc) { toast("Preenche data, valor e descrição"); return; }
  v = Math.abs(v);
  setState("busy", "A guardar…");
  try {
    if (reforcoMode && mTipo === "contribuicao") {
      const sp = splitBy(v, ratioForDate(data, null)); reforcoMode = false;
      const [d1, d2] = await Promise.all([
        API.insertMovimento({ data, descricao: desc + " Diogo", valor: sp.dio, tipo: "contribuicao", pessoa: "Diogo" }),
        API.insertMovimento({ data, descricao: desc + " Margarida", valor: sp.marg, tipo: "contribuicao", pessoa: "Margarida" }),
      ]);
      DATA.movimentos.push(d1, d2);
      setState("ok", "Sincronizado"); close(); renderAll(); toast("Reforço registado ✓ (2 movimentos)"); return;
    }
    reforcoMode = false;
    if (mTipo === "despesa") v = -v;
    if (editId) {
      const upd = await API.updateMovimento(editId, { data, valor: v, descricao: desc, tipo: mTipo, pessoa: "Comum" });
      Object.assign(DATA.movimentos.find(x => x.id === editId), upd);
    } else {
      DATA.movimentos.push(await API.insertMovimento({ data, descricao: desc, valor: v, tipo: mTipo, pessoa: "Comum" }));
    }
    setState("ok", "Sincronizado"); close(); renderAll(); toast(editId ? "Movimento atualizado" : "Movimento adicionado");
  } catch (e) { setState("err", "Erro ao guardar"); toast("Erro: " + e.message); }
}
async function delMov() {
  if (!editId) return; if (!confirm("Eliminar este movimento?")) return;
  setState("busy", "A eliminar…");
  try {
    await API.deleteMovimento(editId);
    DATA.movimentos = DATA.movimentos.filter(x => x.id !== editId);
    setState("ok", "Sincronizado"); close(); renderAll(); toast("Eliminado");
  } catch (e) { setState("err", "Erro"); toast("Erro: " + e.message); }
}

/* ---------- SIMULAÇÃO ---------- */
function openSim(type) {
  simType = type; document.querySelectorAll("#segSim button").forEach(b => b.classList.toggle("on", b.dataset.s === type));
  document.getElementById("simFldDep").style.display = type === "deposito" ? "block" : "none";
  document.getElementById("simFldMen").style.display = type === "mensal" ? "block" : "none";
  document.getElementById("sData").value = todayISO();
  document.getElementById("sDesde").value = todayISO().slice(0, 7);
  document.getElementById("sValor").value = ""; document.getElementById("sDesc").value = ""; document.getElementById("sMensal").value = "";
  updSimHint(); show("ovSim");
}
function updSimHint() { const v = parseFloat(document.getElementById("sMensal").value); const sp = isNaN(v) ? null : split55(v);
  document.getElementById("simMenHint").textContent = sp ? ("Divisão: Diogo " + fmt(sp.dio) + " · Margarida " + fmt(sp.marg) + " (total " + fmt(sp.total) + ")") : ""; }
async function saveSim() {
  let payload;
  if (simType === "deposito") {
    const data = document.getElementById("sData").value, v = parseFloat(document.getElementById("sValor").value), desc = document.getElementById("sDesc").value.trim();
    if (!data || isNaN(v)) { toast("Indica data e valor"); return; }
    payload = { tipo: "deposito", data, valor: Math.abs(v), desc: desc || "Depósito extra" };
  } else {
    const desde = document.getElementById("sDesde").value, v = parseFloat(document.getElementById("sMensal").value);
    if (!desde || isNaN(v)) { toast("Indica mês e valor"); return; }
    payload = { tipo: "mensal", desde, valorTotal: v };
  }
  setState("busy", "A guardar…");
  try {
    DATA.sims.push(await API.insertSim(payload));
    setState("ok", "Sincronizado"); close(); renderSim(); toast("Ajuste adicionado ao cenário");
  } catch (e) { setState("err", "Erro ao guardar"); toast("Erro: " + e.message); }
}
function renderSim() {
  const list = document.getElementById("simList"), res = document.getElementById("simResult");
  if (!DATA.sims.length) { list.innerHTML = '<div class="empty"><div class="ic">✦</div>Sem ajustes. Adiciona um depósito ou alteração para simular.</div>'; res.style.display = "none"; return; }
  list.innerHTML = '<div class="card" style="padding:2px 4px">' + DATA.sims.map(s => {
    const txt = s.tipo === "deposito" ? { ic: "dep", t: esc(s.desc), s: fmt(s.valor) + " · " + fmtDate(s.data) } : { ic: "men", t: "Poupança mensal → " + fmt(s.valorTotal), s: "a partir de " + fmtMesAno(s.desde + "-01") };
    return '<div class="simitem"><div class="ic ' + txt.ic + '">' + (s.tipo === "deposito" ? "€" : "↻") + '</div><div class="t"><b>' + txt.t + "</b><span>" + txt.s + "</span></div>"
      + '<button class="iconbtn" data-rmsim="' + s.id + '">✕</button></div>';
  }).join("") + "</div>";
  list.querySelectorAll("[data-rmsim]").forEach(b => b.onclick = async () => {
    const id = +b.dataset.rmsim; setState("busy", "A eliminar…");
    try { await API.deleteSim(id); DATA.sims = DATA.sims.filter(x => x.id !== id); setState("ok", "Sincronizado"); renderSim(); }
    catch (e) { setState("err", "Erro"); toast("Erro: " + e.message); }
  });
  res.style.display = "block";
  const base = calc(buildLedger()), sim = calc(buildLedger(DATA.sims));
  const dT = sim.saldoTarget - base.saldoTarget, dM = (sim.low[0] ? sim.low[0].saldo : 0) - (base.low[0] ? base.low[0].saldo : 0);
  const dl = (v) => v === 0 ? "" : '<span class="delta ' + (v > 0 ? "up" : "down") + '">' + (v > 0 ? "+" : "") + fmt(v) + "</span>";
  document.getElementById("simCmp").innerHTML =
    '<div class="cmpcard"><div class="lbl">Plano atual</div>'
    + '<div class="cmpline"><span class="k">Saldo previsto <span class="muted" style="font-size:11px;font-weight:400">(' + fmtDate(base.target) + ')</span></span><span class="vv">' + fmt(base.saldoTarget) + "</span></div>"
    + '<div class="cmpline"><span class="k">Saldo mínimo <span class="muted" style="font-size:11px;font-weight:400">' + (base.low[0] ? "(" + fmtDate(base.low[0].data) + ")" : "") + '</span></span><span class="vv">' + fmt(base.low[0] ? base.low[0].saldo : 0) + "</span></div></div>"
    + '<div class="cmpcard" style="border-color:var(--diogo)"><div class="lbl" style="color:var(--diogo)">Simulado</div>'
    + '<div class="cmpline"><span class="k">Saldo previsto <span class="muted" style="font-size:11px;font-weight:400">(' + fmtDate(sim.target) + ')</span></span><span class="vv">' + fmt(sim.saldoTarget) + dl(dT) + "</span></div>"
    + '<div class="cmpline"><span class="k">Saldo mínimo <span class="muted" style="font-size:11px;font-weight:400">' + (sim.low[0] ? "(" + fmtDate(sim.low[0].data) + ")" : "") + '</span></span><span class="vv">' + fmt(sim.low[0] ? sim.low[0].saldo : 0) + dl(dM) + "</span></div></div>";
  renderSimChart(base.L, sim.L);
  document.getElementById("btnSimAplicar").style.display = "inline-flex";
}
function balAt(L, date) { let b = DATA.config.saldoInicial; L.forEach(m => { if (m.data <= date) b = m.saldo; }); return r2(b); }
function renderSimChart(baseL, simL) {
  if (typeof Chart === "undefined") return;
  const dates = [...new Set([...baseL.map(m => m.data), ...simL.map(m => m.data)])].sort();
  const labels = dates.map(fmtDate), bs = dates.map(d => balAt(baseL, d)), ss = dates.map(d => balAt(simL, d));
  if (chSim) chSim.destroy();
  chSim = new Chart(document.getElementById("chartSim"), { type: "line", data: { labels, datasets: [
    { label: "Plano atual", data: bs, borderColor: "#7C8A82", borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: .2 },
    { label: "Simulado", data: ss, borderColor: "#1C6B79", borderWidth: 2.6, pointRadius: 0, pointHoverRadius: 5, tension: .2, fill: false }] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.dataset.label + ": " + fmt(c.parsed.y) } } },
      scales: { x: { ticks: { maxTicksLimit: 7, color: "#7C8A82", font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: "#7C8A82", font: { size: 11 }, callback: v => v + " €" }, grid: { color: "rgba(21,48,42,.07)" } } } } });
}
async function aplicarSim() {
  if (!DATA.sims.length) return; if (!confirm("Aplicar a simulação ao plano real?")) return;
  setState("busy", "A aplicar…");
  try {
    for (const s of DATA.sims) {
      if (s.tipo === "deposito") {
        const base = s.desc || "Depósito extra"; const tot = Math.abs(s.valor); const dio = splitBy(tot, ratioForDate(s.data, null)).dio; const marg = r2(tot - dio);
        const [d1, d2] = await Promise.all([
          API.insertMovimento({ data: s.data, descricao: base + " (Diogo)", valor: dio, tipo: "contribuicao", pessoa: "Diogo" }),
          API.insertMovimento({ data: s.data, descricao: base + " (Margarida)", valor: marg, tipo: "contribuicao", pessoa: "Margarida" }),
        ]);
        DATA.movimentos.push(d1, d2);
      } else {
        const segs = DATA.config.planoMensal.segmentos; const ex = segs.find(x => x.desde === s.desde);
        if (ex) { Object.assign(ex, await API.updateSegmento(ex._id, { valorTotal: s.valorTotal })); }
        else { segs.push(await API.insertSegmento({ desde: s.desde, valorTotal: s.valorTotal, diogoPct: defPct() })); }
        segs.sort((a, b) => a.desde < b.desde ? -1 : 1);
      }
    }
    await API.clearSims();
    DATA.sims = [];
    setState("ok", "Sincronizado"); renderAll(); renderSim(); toast("Simulação aplicada ao plano ✓");
  } catch (e) { setState("err", "Erro ao aplicar"); toast("Erro: " + e.message); }
}

/* ---------- REFORÇOS ---------- */
function renderReforco() {
  const pToday = ratioForDate(todayISO(), null);
  document.getElementById("splitView").value = pToday + "% / " + r2(100 - pToday) + "%";
  const buf = parseFloat(document.getElementById("bufInput").value) || 0;
  const M = calc(buildLedger()), out = document.getElementById("reforcoResult");
  const min = M.low[0] ? M.low[0] : { saldo: DATA.config.saldoInicial, data: DATA.config.dataInicial };
  const need = buf - min.saldo;
  if (need <= 0) { out.innerHTML = '<div class="callout ok">✓ Tudo certo. O saldo previsto nunca desce abaixo de ' + fmt(buf) + " (mínimo: " + fmt(min.saldo) + " em " + fmtDate(min.data) + "). Sem reforço necessário.</div>"; return; }
  const base = Math.ceil(need / 10) * 10;
  const sp = splitBy(base, pToday); const total = sp.total, d = sp.dio, mg = sp.marg;
  out.innerHTML = '<div class="callout warn">⚠︎ O saldo previsto desce até <b>' + fmt(min.saldo) + "</b> em " + fmtDate(min.data) + ". Para manteres sempre " + fmt(buf) + ", precisas de reforçar <b>" + fmt(total) + "</b> antes dessa data.</div>"
    + '<div class="reforco-out"><div class="pcard diogo"><div class="who">Diogo</div><div class="amt num">' + fmt(d) + '</div><div class="pct">' + pToday + "% do reforço</div></div>"
    + '<div class="pcard marg"><div class="who">Margarida</div><div class="amt num">' + fmt(mg) + '</div><div class="pct">' + r2(100 - pToday) + "% do reforço</div></div></div>";
}
function renderQuick() {
  const v = parseFloat(document.getElementById("quickRef").value);
  const out = document.getElementById("quickOut"), btn = document.getElementById("btnAplicarRef"), hint = document.getElementById("quickRatioHint");
  if (isNaN(v) || v <= 0) { out.style.display = "none"; btn.style.display = "none"; if (hint) hint.textContent = ""; return; }
  const p = ratioForDate(todayISO(), null), sp = splitBy(v, p), d = sp.dio, mg = sp.marg;
  out.style.display = "grid";
  out.innerHTML = '<div class="pcard diogo"><div class="who">Diogo</div><div class="amt num">' + fmt(d) + '</div><div class="pct">' + p + "% · múlt. de 5</div></div>"
    + '<div class="pcard marg"><div class="who">Margarida</div><div class="amt num">' + fmt(mg) + '</div><div class="pct">' + r2(100 - p) + "% · múlt. de 5</div></div>";
  if (hint) hint.textContent = "Pré-visualização com o rácio de hoje (" + p + "/" + r2(100 - p) + "). Ao registar, podes escolher a data — a divisão usa o rácio em vigor nessa data.";
  btn.style.display = "inline-flex"; btn._v = { total: v };
}
function aplicarRef() { const btn = document.getElementById("btnAplicarRef"); if (!btn._v) return; openReforcoMov(btn._v.total); }

/* ---------- EDENRED PENAS ---------- */
function penaCompute() {
  const ms = [...DATA.penas].sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
  let bal = 0; const ledger = [], tops = [];
  for (const m of ms) {
    const fer = m.valor < 0 ? Math.max(0, Math.min(Math.abs(m.valor), +m.ferias || 0)) : 0;
    const edenred = r2(m.valor + fer);
    bal = r2(bal + edenred);
    ledger.push(Object.assign({}, m, { ferias: fer, edenred, saldo: bal }));
    if (fer > 0.005) tops.push({ id: m.id, data: m.data, valor: fer, obs: m.obs });
  }
  return { ledger, tops };
}
function penaLedger() { return penaCompute().ledger; }
function penaBalBefore(dateISO, excludeId) {
  let bal = 0;
  [...DATA.penas].filter(m => m.id !== excludeId).sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0)
    .forEach(m => { if (m.data <= dateISO) { const fer = m.valor < 0 ? Math.max(0, +m.ferias || 0) : 0; bal = r2(bal + m.valor + fer); } });
  return bal;
}
function renderPenas() {
  const L = penaLedger(), t = todayISO();
  const pastCount = L.filter(m => m.data < t).length;
  const pbtn = document.getElementById("btnPastPena");
  if (pbtn) { pbtn.style.display = pastCount ? "inline-flex" : "none"; pbtn.textContent = showPastPena ? "Ocultar anteriores" : "Mostrar anteriores (" + pastCount + ")"; pbtn.classList.toggle("primary", showPastPena); }
  const rows = L.filter(m => showPastPena || m.data >= t);
  const body = document.getElementById("penaBody");
  if (!rows.length) { body.innerHTML = '<tr><td colspan="3"><div class="empty"><div class="ic">∅</div>Sem movimentos.</div></td></tr>'; return; }
  let html = "", lastM = "";
  rows.forEach(m => {
    const mo = m.data.slice(0, 7);
    if (mo !== lastM) { lastM = mo; html += '<tr class="divider-month"><td colspan="3">' + fmtMesAno(m.data) + "</td></tr>"; }
    const pos = m.edenred >= 0, fut = m.data > t;
    const chip = m.valor >= 0 ? '<span class="chip receita">Entrada</span>' : '<span class="chip despesa">Saída</span>';
    const its = Array.isArray(m.itens) ? m.itens : [];
    let brk = "";
    if (its.length) {
      const base = typeof m.base === "number" ? m.base : r2(Math.abs(m.valor) - its.reduce((s, i) => s + i.v, 0));
      brk = '<div class="psub">' + fmt(base) + its.map(i => (i.v < 0 ? " − " : " + ") + esc(i.d) + " " + fmt(Math.abs(i.v))).join("") + "</div>";
    }
    const split = m.ferias > 0.005 ? '<div class="psub">Total ' + fmt(Math.abs(m.valor)) + " · " + fmt(m.ferias) + " pela conta de férias</div>" : "";
    html += '<tr class="' + (fut ? "future " : "") + (m.saldo < -0.005 ? "minrow " : "") + '" data-pe="' + m.id + '">'
      + '<td class="datecell">' + fmtDayMonth(m.data) + "</td>"
      + '<td class="desccell"><b>' + esc(m.obs) + "</b><div class=\"tcell\">" + chip + "</div>" + brk + split + "</td>"
      + '<td class="r valcell"><span class="val num ' + (pos ? "pos" : "neg") + '">' + fmt(m.edenred) + "</span>"
      + '<span class="saldo num ' + (m.saldo < -0.005 ? "low" : "") + '">' + fmt(m.saldo) + "</span></td></tr>";
  });
  body.innerHTML = html;
  body.querySelectorAll("tr[data-pe]").forEach(tr => tr.onclick = () => openPena(+tr.dataset.pe));
}
function penaSuggestFerias(total, available) {
  available = Math.max(0, available);
  if (available >= total) return 0;
  const overflow = r2(total - available);
  if (available < 50) return r2(total);
  if (overflow < 10) return 10;
  return overflow;
}
/* Reequilibra os splits em cadeia (ver nota original). Devolve a lista de
   ids cujo `ferias` mudou, para persistirmos só esses no Supabase. */
function penaNormalize(arr) {
  const ms = [...(arr || DATA.penas)].sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
  let bal = 0; const changedIds = [];
  for (const m of ms) {
    if (m.valor < 0) {
      const total = Math.abs(m.valor), avail = Math.max(0, bal);
      let fer = m.feriasManual ? Math.max(0, +m.ferias || 0) : penaSuggestFerias(total, avail);
      const minF = r2(Math.max(0, total - avail));
      if (fer < minF - 0.005) fer = minF;
      fer = r2(Math.min(fer, total));
      if (Math.abs(fer - (+m.ferias || 0)) > 0.005) { m.ferias = fer; changedIds.push(m.id); }
      bal = r2(bal + m.valor + fer);
    } else bal = r2(bal + m.valor);
  }
  return changedIds;
}
function updPenaSplit() {
  const mag = parseFloat(document.getElementById("pValor").value);
  const isCred = penaSign > 0;
  const valRaw = isNaN(mag) ? NaN : (isCred ? Math.abs(mag) : -Math.abs(mag));
  const data = document.getElementById("pData").value || todayISO();
  const ferEl = document.getElementById("pFerias"), wrap = document.getElementById("pFeriasWrap"), hint = document.getElementById("pSplitHint");
  const itWrap = document.getElementById("pItensWrap"), itHint = document.getElementById("pItensHint");
  itWrap.style.display = isCred ? "none" : "block";
  if (isCred || isNaN(valRaw)) {
    ferEl.value = ""; ferEl.disabled = true; wrap.style.opacity = ".5"; penaLastSug = null; if (itHint) itHint.textContent = "";
    hint.textContent = isCred ? "Carregamento — entra totalmente no Edenred, sem divisão." : "Indica o valor do pagamento. A divisão com a conta de férias aparece aqui.";
    return;
  }
  ferEl.disabled = false; wrap.style.opacity = "1";
  const itens = penaItemsRead(), base = Math.abs(valRaw), total = Math.max(0, penaTotalFromForm(base));
  if (itHint) itHint.textContent = itens.length ? "Total do pagamento: " + fmt(total) + " (" + fmt(base) + (itens.reduce((s, i) => s + i.v, 0) >= 0 ? " + " : " − ") + fmt(Math.abs(r2(total - base))) + " de itens)" : "";
  const avail = Math.max(0, penaBalBefore(data, editPenaId));
  const sug = penaSuggestFerias(total, avail), minF = r2(Math.max(0, total - avail));
  const cur = parseFloat(ferEl.value);
  if (ferEl.value === "" || (penaLastSug !== null && Math.abs((isNaN(cur) ? 0 : cur) - penaLastSug) < 0.005)) ferEl.value = sug > 0.005 ? r2(sug) : "";
  penaLastSug = sug;
  let fer = parseFloat(ferEl.value); if (isNaN(fer) || fer < 0) fer = 0; if (fer > total) fer = total;
  const edenred = r2(total - fer);
  let msg = "Edenred paga " + fmt(edenred) + " · conta de férias paga " + fmt(fer) + ". Disponível no Edenred: " + fmt(avail) + ".";
  const warn = fer < minF - 0.005 ? ' <b style="color:var(--neg)">O Edenred não pode ficar negativo — a conta de férias tem de cobrir ≥ ' + fmt(minF) + ".</b>" : "";
  if (Math.abs(fer - sug) > 0.005) {
    hint.innerHTML = msg + warn + ' <button type="button" class="btn sm" id="pFerSug" style="margin-top:8px">↺ Usar sugestão (férias ' + fmt(sug) + ")</button>";
    document.getElementById("pFerSug").onclick = () => { document.getElementById("pFerias").value = sug > 0.005 ? r2(sug) : ""; penaLastSug = sug; updPenaSplit(); };
    return;
  }
  hint.textContent = msg;
}
function setPenaSignUI() { document.querySelectorAll("#segPenaSinal button").forEach(b => b.classList.toggle("on", (+b.dataset.ps) === penaSign)); }
function penaItemRow(d, v) {
  const row = document.createElement("div"); row.className = "pitem-row";
  row.innerHTML = '<input type="text" class="pi-d" placeholder="ex.: Seguro anual"><input type="number" step="0.01" class="pi-v" placeholder="+/− €"><button type="button" class="pi-x" title="Remover">×</button>';
  row.querySelector(".pi-d").value = d || "";
  row.querySelector(".pi-v").value = (v != null && v !== "") ? v : "";
  row.querySelector(".pi-x").onclick = () => { row.remove(); updPenaSplit(); };
  row.querySelectorAll("input").forEach(i => i.addEventListener("input", updPenaSplit));
  document.getElementById("pItens").appendChild(row);
}
function penaItemsRead() {
  return [...document.querySelectorAll("#pItens .pitem-row")].map(r => ({ d: r.querySelector(".pi-d").value.trim(), v: parseFloat(r.querySelector(".pi-v").value) }))
    .filter(i => i.d && !isNaN(i.v) && Math.abs(i.v) > 0.005).map(i => ({ d: i.d, v: r2(i.v) }));
}
function penaTotalFromForm(base) { return r2(base + penaItemsRead().reduce((s, i) => s + i.v, 0)); }
function openPena(id) {
  editPenaId = id || null; document.getElementById("penaModalTitle").textContent = id ? "Editar — Edenred Penas" : "Movimento — Edenred Penas";
  document.getElementById("btnDelPena").style.display = id ? "flex" : "none";
  document.getElementById("pItens").innerHTML = "";
  if (id) { const m = DATA.penas.find(x => x.id === id); penaSign = m.valor < 0 ? -1 : 1; document.getElementById("pData").value = m.data;
    const its = Array.isArray(m.itens) ? m.itens : [];
    const base = its.length ? (typeof m.base === "number" ? m.base : r2(Math.abs(m.valor) - its.reduce((s, i) => s + i.v, 0))) : Math.abs(m.valor);
    document.getElementById("pValor").value = base; its.forEach(i => penaItemRow(i.d, i.v));
    document.getElementById("pObs").value = m.obs; document.getElementById("pFerias").value = (m.ferias > 0 ? m.ferias : ""); }
  else { penaSign = -1; document.getElementById("pData").value = todayISO(); document.getElementById("pValor").value = ""; document.getElementById("pObs").value = ""; document.getElementById("pFerias").value = ""; }
  setPenaSignUI(); penaLastSug = null; updPenaSplit(); show("ovPena");
}
async function savePena() {
  const data = document.getElementById("pData").value, mag = parseFloat(document.getElementById("pValor").value), o = document.getElementById("pObs").value.trim();
  if (!data || isNaN(mag) || !o) { toast("Preenche os campos"); return; }
  const base = Math.abs(mag), itens = penaSign < 0 ? penaItemsRead() : [];
  const totalAbs = penaSign < 0 ? penaTotalFromForm(base) : base;
  if (penaSign < 0 && totalAbs <= 0.005) { toast("O total do pagamento tem de ser positivo (os descontos excedem o valor)"); return; }
  const v = penaSign > 0 ? base : -totalAbs;
  let fer = parseFloat(document.getElementById("pFerias").value); if (isNaN(fer) || fer < 0) fer = 0; let adj = false, manual = false;
  if (v < 0) {
    const total = Math.abs(v); fer = Math.min(fer, total);
    const avail = Math.max(0, penaBalBefore(data, editPenaId)), minF = r2(Math.max(0, total - avail));
    manual = Math.abs(fer - penaSuggestFerias(total, avail)) > 0.005;
    if (fer < minF - 0.005) { fer = minF; adj = true; }
  } else fer = 0;
  const rec = { data, valor: r2(v), obs: o, ferias: r2(fer), feriasManual: manual, base: itens.length ? r2(base) : null, itens: itens.length ? itens : [] };
  setState("busy", "A guardar…");
  try {
    if (editPenaId) { Object.assign(DATA.penas.find(x => x.id === editPenaId), await API.updatePena(editPenaId, rec)); }
    else { DATA.penas.push(await API.insertPena(rec)); }
    const changedIds = penaNormalize();
    if (changedIds.length) await Promise.all(changedIds.map(id => API.updatePena(id, { ferias: DATA.penas.find(x => x.id === id).ferias })));
    setState("ok", "Sincronizado"); close(); renderAll();
    toast(adj ? "Guardado — divisão ajustada (o Edenred não pode ficar negativo)" : changedIds.length ? "Guardado — divisões seguintes reequilibradas" : "Guardado");
  } catch (e) { setState("err", "Erro ao guardar"); toast("Erro: " + e.message); }
}
async function delPena() {
  if (!editPenaId) return; if (!confirm("Eliminar?")) return;
  setState("busy", "A eliminar…");
  try {
    await API.deletePena(editPenaId);
    DATA.penas = DATA.penas.filter(x => x.id !== editPenaId);
    const changedIds = penaNormalize();
    if (changedIds.length) await Promise.all(changedIds.map(id => API.updatePena(id, { ferias: DATA.penas.find(x => x.id === id).ferias })));
    setState("ok", "Sincronizado"); close(); renderAll();
  } catch (e) { setState("err", "Erro"); toast("Erro: " + e.message); }
}

/* ---------- CHARTS ---------- */
function renderCharts() {
  if (typeof Chart === "undefined") return;
  const L = buildLedger(), buf = DATA.config.buffer || 0, t = todayISO();
  const labels = L.map(m => fmtDate(m.data)), saldos = L.map(m => m.saldo);
  let todayIdx = -1; L.forEach((m, k) => { if (m.data <= t) todayIdx = k; });
  if (chS) chS.destroy();
  chS = new Chart(document.getElementById("chartSaldo"), { type: "line", data: { labels, datasets: [{ label: "Saldo", data: saldos, borderColor: "#1C6B79",
    backgroundColor: (c) => { const a = c.chart.ctx.createLinearGradient(0, 0, 0, 300); a.addColorStop(0, "rgba(28,107,121,.22)"); a.addColorStop(1, "rgba(28,107,121,0)"); return a; },
    fill: true, tension: .25, borderWidth: 2.4, pointRadius: 0, pointHoverRadius: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
      scales: { x: { ticks: { maxTicksLimit: 7, color: "#7C8A82", font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: "#7C8A82", font: { size: 11 }, callback: v => v + " €" }, grid: { color: "rgba(21,48,42,.07)" } } } },
    plugins: [{ id: "lines", afterDraw(c) { const { ctx, chartArea: { top, bottom, left, right }, scales: { x, y } } = c;
      const yb = y.getPixelForValue(buf); ctx.save(); ctx.strokeStyle = "rgba(189,70,48,.55)"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(left, yb); ctx.lineTo(right, yb); ctx.stroke();
      if (todayIdx >= 0) { const xt = x.getPixelForValue(todayIdx); ctx.strokeStyle = "rgba(190,142,58,.8)"; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(xt, top); ctx.lineTo(xt, bottom); ctx.stroke(); } ctx.restore(); } }] });
  const map = {}; L.forEach(m => { const k = m.data.slice(0, 7); if (!map[k]) map[k] = { in: 0, out: 0 }; if (m.valor >= 0) map[k].in += m.valor; else map[k].out += m.valor; });
  const keys = Object.keys(map).sort();
  if (chM) chM.destroy();
  chM = new Chart(document.getElementById("chartMes"), { type: "bar", data: { labels: keys.map(fmtMesAno), datasets: [
    { label: "Entradas", data: keys.map(k => r2(map[k].in)), backgroundColor: "#2E7D5B", borderRadius: 5, stack: "s", maxBarThickness: 34 },
    { label: "Saídas", data: keys.map(k => r2(map[k].out)), backgroundColor: "#BD4630", borderRadius: 5, stack: "s", maxBarThickness: 34 },
    { label: "Saldo do mês", data: keys.map(k => r2(map[k].in + map[k].out)), type: "line", borderColor: "#15302A", borderWidth: 2, pointRadius: 2.5, tension: .2 }] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.dataset.label + ": " + fmt(c.parsed.y) } } },
      scales: { x: { stacked: true, ticks: { color: "#7C8A82", font: { size: 10 }, maxTicksLimit: 9 }, grid: { display: false } },
        y: { stacked: true, ticks: { color: "#7C8A82", font: { size: 11 }, callback: v => v + " €" }, grid: { color: "rgba(21,48,42,.07)" } } } } });
}

/* ---------- DEFINIÇÕES ---------- */
function renderDef() {
  const c = DATA.config;
  document.getElementById("setTitulo").value = c.titulo || "";
  document.getElementById("setSaldoIni").value = c.saldoInicial;
  document.getElementById("setDataIni").value = c.dataInicial;
  document.getElementById("setDataInfo").textContent = "Aberto em " + fmtDate(c.dataInicial);
  document.getElementById("setBuffer").value = c.buffer || 0;
  const info = document.getElementById("sessaoInfo");
  if (info) info.textContent = myProfile ? myProfile.pessoa + " · " + myProfile.email : "—";
}
function prevMonthLabel(mk) { let [y, m] = mk.split("-").map(Number); m--; if (m < 1) { m = 12; y--; } return fmtMesAno(y + "-" + String(m).padStart(2, "0") + "-01"); }
function renderPoupanca() {
  const pm = DATA.config.planoMensal;
  document.getElementById("tgPlano").classList.toggle("on", pm.ativo);
  document.getElementById("planoAte").value = pm.ate;
  document.getElementById("planoDia").value = pm.diaMes;
  const segs = pm.segmentos, host = document.getElementById("segList");
  host.innerHTML = segs.map((s, i) => {
    const p = typeof s.diogoPct === "number" ? s.diogoPct : defPct(); const mp = r2(100 - p); const sp = splitBy(s.valorTotal, p);
    const next = segs[i + 1];
    const fim = next ? prevMonthLabel(next.desde) : (pm.ate ? ("em diante (até " + fmtMesAno(pm.ate + "-01") + ")") : "em diante");
    return '<div class="segcard">'
      + '<div class="seghead"><span class="period">' + fmtMesAno(s.desde + "-01") + " → " + fim + "</span>"
      + (segs.length > 1 ? '<button class="iconbtn" data-rmseg="' + i + '">✕</button>' : "") + "</div>"
      + '<div class="segfields">'
        + '<label class="full">Desde<input type="month" data-seg="' + i + '" data-k="desde" value="' + s.desde + '"></label>'
        + '<label>Valor mensal (€)<input type="number" step="10" data-seg="' + i + '" data-k="valorTotal" value="' + s.valorTotal + '"></label>'
        + '<label>Rácio (D / M)<div class="ratiopair">'
          + '<input type="number" min="0" max="100" step="1" data-seg="' + i + '" data-k="diogoPct" value="' + p + '">'
          + "<span>/</span>"
          + '<input type="number" class="locked" data-mpct="' + i + '" value="' + mp + '" disabled></div></label>'
      + "</div>"
      + '<div class="segsplit">'
        + '<span class="pill diogo"><span class="nm">Diogo · ' + p + '%</span><b>' + fmt(sp.dio) + "</b></span>"
        + '<span class="pill marg"><span class="nm">Margarida · ' + mp + '%</span><b>' + fmt(sp.marg) + "</b></span></div>"
    + "</div>";
  }).join("");
  host.querySelectorAll('[data-k="diogoPct"]').forEach(el => el.addEventListener("input", () => {
    const v = Math.min(100, Math.max(0, parseInt(el.value) || 0)); const m = host.querySelector('[data-mpct="' + el.dataset.seg + '"]'); if (m) m.value = r2(100 - v);
  }));
  host.querySelectorAll("[data-seg]").forEach(el => el.addEventListener("change", async () => {
    const i = +el.dataset.seg, k = el.dataset.k; let val = el.value;
    if (k === "valorTotal") val = parseFloat(el.value) || 0;
    else if (k === "diogoPct") val = Math.min(100, Math.max(0, parseInt(el.value) || 0));
    const seg = DATA.config.planoMensal.segmentos[i];
    seg[k] = val;
    setState("busy", "A guardar…");
    try {
      Object.assign(seg, await API.updateSegmento(seg._id, { desde: seg.desde, valorTotal: seg.valorTotal, diogoPct: seg.diogoPct }));
      DATA.config.planoMensal.segmentos.sort((a, b) => a.desde < b.desde ? -1 : 1);
      setState("ok", "Sincronizado"); renderPoupanca(); renderAll();
    } catch (e) { setState("err", "Erro"); toast("Erro: " + e.message); renderPoupanca(); }
  }));
  host.querySelectorAll("[data-rmseg]").forEach(b => b.onclick = async () => {
    const i = +b.dataset.rmseg; const seg = DATA.config.planoMensal.segmentos[i];
    setState("busy", "A eliminar…");
    try {
      await API.deleteSegmento(seg._id);
      DATA.config.planoMensal.segmentos.splice(i, 1);
      setState("ok", "Sincronizado"); renderPoupanca(); renderAll();
    } catch (e) { setState("err", "Erro"); toast("Erro: " + e.message); }
  });
}
async function saveDef() {
  const c = DATA.config;
  const patch = {
    titulo: document.getElementById("setTitulo").value.trim() || "Plano de Férias",
    saldoInicial: parseFloat(document.getElementById("setSaldoIni").value) || 0,
    dataInicial: document.getElementById("setDataIni").value || c.dataInicial,
    buffer: parseFloat(document.getElementById("setBuffer").value) || 0,
    planoMensal: { ate: document.getElementById("planoAte").value || c.planoMensal.ate, diaMes: Math.min(28, Math.max(1, parseInt(document.getElementById("planoDia").value) || 1)) },
  };
  setState("busy", "A guardar…");
  try {
    mergeConfig(c, await API.updateConfig(patch));
    setState("ok", "Sincronizado"); renderDef(); renderAll();
  } catch (e) { setState("err", "Erro ao guardar"); toast("Erro: " + e.message); }
}

/* ---------- helpers ---------- */
function show(id) { document.getElementById(id).classList.add("show"); }
function close() { document.querySelectorAll(".overlay").forEach(o => o.classList.remove("show")); }
function renderAll() { renderHeader(); renderResumo(); renderMov(); renderPoupanca(); renderPenas(); renderReforco(); renderCharts(); }

function showScreen(name) {
  ["loginScreen", "notAuthScreen", "configScreen", "appRoot"].forEach(id => {
    document.getElementById(id).style.display = id === name ? "block" : "none";
  });
}
function showConfigError(msg) {
  document.querySelector("#configScreen p").textContent = msg;
  showScreen("configScreen");
}

/* ---------- ligação de eventos (uma vez, depois do 1º login) ---------- */
function bindEvents() {
  document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#tabs button").forEach(x => x.classList.remove("active")); b.classList.add("active");
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.getElementById("p-" + b.dataset.tab).classList.add("active");
    if (b.dataset.tab === "evolucao") setTimeout(renderCharts, 30);
    if (b.dataset.tab === "simulacao") { renderSim(); setTimeout(() => { if (DATA.sims.length) renderSim(); }, 30); }
  });

  document.getElementById("fab").onclick = () => { const at = document.querySelector("#tabs button.active"); if (at && at.dataset.tab === "penas") openPena(null); else openMov(null); };
  document.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
  document.querySelectorAll(".overlay").forEach(o => o.onclick = e => { if (e.target === o) close(); });
  document.querySelectorAll("#segTipo button").forEach(b => b.onclick = () => { mTipo = b.dataset.t; document.querySelectorAll("#segTipo button").forEach(x => x.classList.toggle("on", x === b)); });
  document.getElementById("btnSaveMov").onclick = saveMov; document.getElementById("btnDelMov").onclick = delMov;
  ["mSearch", "mTipo"].forEach(id => document.getElementById(id).oninput = renderMov);
  document.getElementById("btnPast").onclick = () => { showPast = !showPast; renderMov(); };

  document.getElementById("btnSimDep").onclick = () => openSim("deposito");
  document.getElementById("btnSimMen").onclick = () => openSim("mensal");
  document.querySelectorAll("#segSim button").forEach(b => b.onclick = () => openSim(b.dataset.s));
  document.getElementById("sMensal").oninput = updSimHint;
  document.getElementById("btnSaveSim").onclick = saveSim;
  document.getElementById("btnSimAplicar").onclick = aplicarSim;
  document.getElementById("btnSimLimpar").onclick = async () => {
    if (!DATA.sims.length || !confirm("Limpar o cenário?")) return;
    setState("busy", "A limpar…");
    try { await API.clearSims(); DATA.sims = []; setState("ok", "Sincronizado"); renderSim(); }
    catch (e) { setState("err", "Erro"); toast("Erro: " + e.message); }
  };

  document.getElementById("bufInput").value = DATA.config.buffer || 0;
  document.getElementById("bufInput").oninput = renderReforco;
  document.getElementById("quickRef").oninput = renderQuick;
  document.getElementById("btnAplicarRef").onclick = aplicarRef;

  document.getElementById("btnAddPena").onclick = () => openPena(null);
  document.querySelectorAll("#segPenaSinal button").forEach(b => b.onclick = () => { penaSign = +b.dataset.ps; setPenaSignUI(); penaLastSug = null; updPenaSplit(); });
  document.getElementById("btnPastPena").onclick = () => { showPastPena = !showPastPena; renderPenas(); };
  document.getElementById("btnSavePena").onclick = savePena; document.getElementById("btnDelPena").onclick = delPena;
  ["pValor", "pFerias", "pData"].forEach(id => document.getElementById(id).addEventListener("input", updPenaSplit));
  document.getElementById("btnAddItem").onclick = () => { penaItemRow("", ""); updPenaSplit(); };

  document.getElementById("tgPlano").onclick = async () => {
    setState("busy", "A guardar…");
    try { mergeConfig(DATA.config, await API.updateConfig({ planoMensal: { ativo: !DATA.config.planoMensal.ativo } })); setState("ok", "Sincronizado"); renderPoupanca(); renderAll(); }
    catch (e) { setState("err", "Erro"); toast("Erro: " + e.message); }
  };
  document.getElementById("planoAte").addEventListener("change", saveDef);
  document.getElementById("planoDia").addEventListener("change", saveDef);
  document.getElementById("btnAddSeg").onclick = async () => {
    const segs = DATA.config.planoMensal.segmentos; const last = segs[segs.length - 1];
    const [y, m] = last.desde.split("-").map(Number); const nm = m === 12 ? (y + 1) + "-01" : y + "-" + String(m + 1).padStart(2, "0");
    setState("busy", "A guardar…");
    try {
      segs.push(await API.insertSegmento({ desde: nm, valorTotal: last.valorTotal, diogoPct: typeof last.diogoPct === "number" ? last.diogoPct : defPct() }));
      segs.sort((a, b) => a.desde < b.desde ? -1 : 1);
      setState("ok", "Sincronizado"); renderPoupanca(); renderAll();
    } catch (e) { setState("err", "Erro"); toast("Erro: " + e.message); }
  };

  ["setTitulo", "setSaldoIni", "setDataIni", "setBuffer"].forEach(id => document.getElementById(id).addEventListener("change", saveDef));
  document.getElementById("btnLogout").onclick = async () => { await API.signOut(); showScreen("loginScreen"); };
  document.getElementById("btnExport").onclick = () => {
    const blob = new Blob([JSON.stringify({ config: DATA.config, movimentos: DATA.movimentos, penas: DATA.penas, sims: DATA.sims }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "planoferias-backup-" + todayISO() + ".json"; a.click();
  };

  ["conta", "sessao"].forEach(id => {
    const hdr = document.getElementById("acc-" + id), body = document.getElementById("accb-" + id);
    hdr.onclick = () => { hdr.classList.toggle("open"); body.classList.toggle("open"); };
  });
}

/* ---------- auth / arranque ---------- */
async function loadData() {
  const [config, segmentos, movimentos, penas, sims] = await Promise.all([
    API.getConfig(), API.listSegmentos(), API.listMovimentos(), API.listPenas(), API.listSims(),
  ]);
  config.planoMensal.segmentos = segmentos;
  DATA = { config, movimentos, penas, sims };
}
async function afterLogin() {
  setState("busy", "A verificar conta…");
  try {
    await API.ensureProfile();
    myProfile = await API.getMyProfile();
    if (!myProfile) throw new Error("Sem perfil");
  } catch (e) {
    await API.signOut();
    currentUid = null; // evita que o SIGNED_OUT assíncrono troque o ecrã para o de login
    showScreen("notAuthScreen");
    return;
  }
  try {
    await loadData();
  } catch (e) {
    setState("err", "Erro ao carregar"); toast("Erro: " + e.message);
    showScreen("appRoot");
    return;
  }
  if (!eventsBound) { bindEvents(); eventsBound = true; }
  showScreen("appRoot");
  renderAll(); renderDef(); renderSim();
  setState("ok", "Sincronizado");
}
// `undefined` (não `null`) até à 1ª verificação: um visitante sem sessão
// nenhuma também produz uid === null, e isso não pode ser confundido com
// "já processado" — senão a 1ª chamada (sem sessão) fica a fazer nada e o
// ecrã de login nunca aparece (foi exatamente este bug que deixou a app
// em branco para quem visita pela 1ª vez / sem sessão guardada).
let currentUid;
/* Chamada no boot e sempre que o Supabase dispara onAuthStateChange
   (INITIAL_SESSION, TOKEN_REFRESHED, SIGNED_IN, SIGNED_OUT, ...).
   Só re-processa quando o utilizador muda de facto (login/logout) —
   um TOKEN_REFRESHED periódico não deve recarregar tudo outra vez. */
async function establishSession(session) {
  const uid = session?.user?.id || null;
  if (uid === currentUid) return;
  currentUid = uid;
  if (!session) { DATA = null; myProfile = null; showScreen("loginScreen"); return; }
  await afterLogin();
}
async function boot() {
  document.getElementById("btnLogin").onclick = async () => {
    try { await API.signInWithGoogle(); } catch (e) { toast("Erro: " + e.message); }
  };
  document.getElementById("btnLogout2").onclick = async () => { await API.signOut(); showScreen("loginScreen"); };

  if (!IS_CONFIGURED) { showScreen("configScreen"); return; }
  if (LOAD_ERROR) { showConfigError("Não foi possível carregar a biblioteca do Supabase: " + LOAD_ERROR.message); return; }

  let session;
  try { session = await API.getSession(); }
  catch (e) { showConfigError("Não foi possível ligar ao Supabase: " + e.message); return; }

  API.onAuthStateChange((_event, newSession) => { establishSession(newSession); });
  await establishSession(session);
}
document.addEventListener("DOMContentLoaded", boot);
