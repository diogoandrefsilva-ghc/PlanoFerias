/* ============================================================
   Camada de acesso a dados — PlanoFerias
   ------------------------------------------------------------
   Fala sempre com o Supabase real (não há modo local/demo).
   Traduz entre as colunas snake_case da BD e a forma camelCase
   que o app.js espera (mesma forma que os dados tinham no
   antigo planoferias-data.json), para manter a lógica de
   negócio (buildLedger, calc, planSegments, ...) intacta.
   ============================================================ */

import { supabase } from "./supabase.js";

function must() {
  if (!supabase) throw new Error("Supabase não configurado (js/config.js)");
  return supabase;
}

function throwErr(error, fallback) {
  if (error) throw new Error(error.message || fallback || "Erro inesperado");
}

/* ---------- Mapeadores linha BD <-> objeto app ---------- */

const configFromRow = (r) => ({
  titulo: r.titulo,
  subtitulo: r.subtitulo,
  saldoInicial: Number(r.saldo_inicial),
  dataInicial: r.data_inicial,
  split: { Diogo: r.split_diogo_pct, Margarida: 100 - r.split_diogo_pct },
  buffer: Number(r.buffer),
  planoMensal: { ativo: r.plano_ativo, diaMes: r.plano_dia_mes, ate: r.plano_ate, segmentos: [] },
});

const segFromRow = (r) => ({ _id: r.id, desde: r.desde, valorTotal: Number(r.valor_total), diogoPct: r.diogo_pct });

const movFromRow = (r) => ({ id: r.id, data: r.data, descricao: r.descricao, valor: Number(r.valor), tipo: r.tipo, pessoa: r.pessoa });

const penaFromRow = (r) => ({
  id: r.id, data: r.data, valor: Number(r.valor), obs: r.obs,
  ferias: Number(r.ferias), feriasManual: !!r.ferias_manual,
  base: r.base == null ? undefined : Number(r.base),
  itens: Array.isArray(r.itens) ? r.itens : [],
});

const simFromRow = (r) => ({
  id: r.id, tipo: r.tipo, data: r.data, valor: r.valor == null ? undefined : Number(r.valor),
  desc: r.desc == null ? undefined : r.desc,
  desde: r.desde == null ? undefined : r.desde,
  valorTotal: r.valor_total == null ? undefined : Number(r.valor_total),
  diogoPct: r.diogo_pct == null ? undefined : r.diogo_pct,
});

export const API = {
  /* ---------- auth ---------- */
  async getSession() {
    const { data, error } = await must().auth.getSession();
    throwErr(error);
    return data.session;
  },
  onAuthStateChange(cb) {
    return must().auth.onAuthStateChange(cb);
  },
  async signInWithGoogle() {
    const { error } = await must().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
    throwErr(error);
  },
  async signOut() {
    await must().auth.signOut();
  },
  async ensureProfile() {
    const { error } = await must().rpc("ensure_profile");
    throwErr(error, "Não foi possível inscrever o utilizador");
  },
  async getMyProfile() {
    const { data: userData, error: uErr } = await must().auth.getUser();
    throwErr(uErr);
    if (!userData?.user) return null;
    const { data, error } = await must().from("members").select("*").eq("id", userData.user.id).maybeSingle();
    throwErr(error, "Não foi possível carregar o perfil");
    return data ? { id: data.id, pessoa: data.pessoa, email: data.email, displayName: data.display_name } : null;
  },

  /* ---------- config ---------- */
  async getConfig() {
    const { data, error } = await must().from("config").select("*").eq("id", 1).single();
    throwErr(error, "Não foi possível carregar a configuração");
    return configFromRow(data);
  },
  async updateConfig(patch) {
    const row = {};
    if ("titulo" in patch) row.titulo = patch.titulo;
    if ("subtitulo" in patch) row.subtitulo = patch.subtitulo;
    if ("saldoInicial" in patch) row.saldo_inicial = patch.saldoInicial;
    if ("dataInicial" in patch) row.data_inicial = patch.dataInicial;
    if (patch.split && "Diogo" in patch.split) row.split_diogo_pct = patch.split.Diogo;
    if ("buffer" in patch) row.buffer = patch.buffer;
    if (patch.planoMensal) {
      const pm = patch.planoMensal;
      if ("ativo" in pm) row.plano_ativo = pm.ativo;
      if ("diaMes" in pm) row.plano_dia_mes = pm.diaMes;
      if ("ate" in pm) row.plano_ate = pm.ate;
    }
    row.updated_at = new Date().toISOString();
    const { data, error } = await must().from("config").update(row).eq("id", 1).select().single();
    throwErr(error, "Não foi possível guardar a configuração");
    return configFromRow(data);
  },

  /* ---------- plano_segmentos ---------- */
  async listSegmentos() {
    const { data, error } = await must().from("plano_segmentos").select("*").order("desde", { ascending: true });
    throwErr(error, "Não foi possível carregar os intervalos de poupança");
    return (data || []).map(segFromRow);
  },
  async insertSegmento(seg) {
    const { data, error } = await must().from("plano_segmentos")
      .insert({ desde: seg.desde, valor_total: seg.valorTotal, diogo_pct: seg.diogoPct }).select().single();
    throwErr(error, "Não foi possível adicionar o intervalo");
    return segFromRow(data);
  },
  async updateSegmento(id, patch) {
    const row = {};
    if ("desde" in patch) row.desde = patch.desde;
    if ("valorTotal" in patch) row.valor_total = patch.valorTotal;
    if ("diogoPct" in patch) row.diogo_pct = patch.diogoPct;
    const { data, error } = await must().from("plano_segmentos").update(row).eq("id", id).select().single();
    throwErr(error, "Não foi possível guardar o intervalo");
    return segFromRow(data);
  },
  async deleteSegmento(id) {
    const { error } = await must().from("plano_segmentos").delete().eq("id", id);
    throwErr(error, "Não foi possível remover o intervalo");
  },

  /* ---------- movimentos ---------- */
  async listMovimentos() {
    const { data, error } = await must().from("movimentos").select("*").order("data", { ascending: true });
    throwErr(error, "Não foi possível carregar os movimentos");
    return (data || []).map(movFromRow);
  },
  async insertMovimento(mov) {
    const { data, error } = await must().from("movimentos")
      .insert({ data: mov.data, descricao: mov.descricao, valor: mov.valor, tipo: mov.tipo, pessoa: mov.pessoa || "Comum" })
      .select().single();
    throwErr(error, "Não foi possível adicionar o movimento");
    return movFromRow(data);
  },
  async updateMovimento(id, patch) {
    const row = {};
    if ("data" in patch) row.data = patch.data;
    if ("descricao" in patch) row.descricao = patch.descricao;
    if ("valor" in patch) row.valor = patch.valor;
    if ("tipo" in patch) row.tipo = patch.tipo;
    if ("pessoa" in patch) row.pessoa = patch.pessoa;
    const { data, error } = await must().from("movimentos").update(row).eq("id", id).select().single();
    throwErr(error, "Não foi possível guardar o movimento");
    return movFromRow(data);
  },
  async deleteMovimento(id) {
    const { error } = await must().from("movimentos").delete().eq("id", id);
    throwErr(error, "Não foi possível eliminar o movimento");
  },

  /* ---------- penas ---------- */
  async listPenas() {
    const { data, error } = await must().from("penas").select("*").order("data", { ascending: true });
    throwErr(error, "Não foi possível carregar o Edenred Penas");
    return (data || []).map(penaFromRow);
  },
  async insertPena(p) {
    const { data, error } = await must().from("penas").insert({
      data: p.data, valor: p.valor, obs: p.obs, ferias: p.ferias || 0,
      ferias_manual: !!p.feriasManual, base: p.base ?? null, itens: p.itens || [],
    }).select().single();
    throwErr(error, "Não foi possível adicionar o movimento");
    return penaFromRow(data);
  },
  async updatePena(id, patch) {
    const row = {};
    if ("data" in patch) row.data = patch.data;
    if ("valor" in patch) row.valor = patch.valor;
    if ("obs" in patch) row.obs = patch.obs;
    if ("ferias" in patch) row.ferias = patch.ferias;
    if ("feriasManual" in patch) row.ferias_manual = !!patch.feriasManual;
    if ("base" in patch) row.base = patch.base ?? null;
    if ("itens" in patch) row.itens = patch.itens || [];
    const { data, error } = await must().from("penas").update(row).eq("id", id).select().single();
    throwErr(error, "Não foi possível guardar o movimento");
    return penaFromRow(data);
  },
  async deletePena(id) {
    const { error } = await must().from("penas").delete().eq("id", id);
    throwErr(error, "Não foi possível eliminar o movimento");
  },

  /* ---------- sims ---------- */
  async listSims() {
    const { data, error } = await must().from("sims").select("*").order("id", { ascending: true });
    throwErr(error, "Não foi possível carregar as simulações");
    return (data || []).map(simFromRow);
  },
  async insertSim(s) {
    const row = { tipo: s.tipo };
    if (s.tipo === "deposito") { row.data = s.data; row.valor = s.valor; row.desc = s.desc; }
    else { row.desde = s.desde; row.valor_total = s.valorTotal; }
    const { data, error } = await must().from("sims").insert(row).select().single();
    throwErr(error, "Não foi possível adicionar o ajuste");
    return simFromRow(data);
  },
  async deleteSim(id) {
    const { error } = await must().from("sims").delete().eq("id", id);
    throwErr(error, "Não foi possível remover o ajuste");
  },
  async clearSims() {
    const { error } = await must().from("sims").delete().neq("id", 0);
    throwErr(error, "Não foi possível limpar as simulações");
  },
};
