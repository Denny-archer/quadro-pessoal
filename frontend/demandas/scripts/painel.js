import { req, iniciarSessao, aplicarContexto, abrirEventos } from '../../scripts/shared/http.js';
import { encerrarTela } from '../../scripts/shared/sessao.js';

(function(){
const STATUS = {afazer:"A fazer", andamento:"Em andamento", aguardando:"Aguardando", concluida:"Concluída"};
const STATUS_COLOR = {afazer:"var(--line)", andamento:"var(--accent)", aguardando:"var(--info)", concluida:"var(--ok)"};
const PRIO = {alta:"Alta", media:"Média", baixa:"Baixa"};
const PRIO_ORDER = {alta:0, media:1, baixa:2};

const S = {
  db:null, demo:false, readOnly:false, loading:true,
  demandas:[], colabs:[], metas:[], modelos:[],
  tab:"colab",
  f:{colab:"", status:"abertas", prio:"", q:""},
  fc:{colab:"", mes:"", q:""},
  fm:{setor:"", sit:"", q:""}, open:new Set(),
  fp:{modelo:"", colab:"", sit:"abertos", q:""}, shut:new Set(),
  sort:{key:"prazo", dir:1},
  modal:null
};


const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2,"0");
const isoDay = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const TODAY = isoDay(new Date());
const addDays = (iso,n) => { const d = new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return isoDay(d); };
const fmtDate = iso => iso ? iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4) : "—";
const daysBetween = (a,b) => Math.round((new Date(b+"T12:00:00") - new Date(a+"T12:00:00"))/86400000);
const safeUrl = u => /^https?:\/\//i.test(String(u||"").trim()) ? String(u).trim() : "";
const hue = s => { let h=0; for(const c of String(s)) h = (h*31 + c.charCodeAt(0)) % 360; return h; };
const initials = n => String(n||"?").trim().split(/\s+/).filter(Boolean).map((w,i,a)=> (i===0||i===a.length-1)? w[0] : "").join("").slice(0,2).toUpperCase() || "?";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const colabById = id => S.colabs.find(c => c.id === id);
const colabName = id => colabById(id)?.nome || "Sem responsável";

function formatSEI(v){
  const d = String(v||"").replace(/\D/g,"");
  if(d.length === 17) return d.slice(0,5)+"."+d.slice(5,11)+"/"+d.slice(11,15)+"-"+d.slice(15);
  return String(v||"").trim();
}
function isOpen(d){ return d.status !== "concluida"; }
function deadline(d){
  if(!isOpen(d) || !d.prazo) return null;
  const diff = daysBetween(TODAY, d.prazo);
  if(diff < 0) return {cls:"late", tag:"tag-late", label: (-diff)===1 ? "1 dia de atraso" : (-diff)+" dias de atraso"};
  if(diff === 0) return {cls:"soon", tag:"tag-soon", label:"vence hoje"};
  if(diff <= 3) return {cls:"soon", tag:"tag-soon", label:"vence em "+diff+(diff===1?" dia":" dias")};
  return null;
}
function avatar(id, sm){
  const c = colabById(id);
  if(!c) return `<span class="av${sm?" sm":""}" style="--h:210;opacity:.5">—</span>`;
  return `<span class="av${sm?" sm":""}" style="--h:${hue(c.nome)}" aria-hidden="true">${esc(initials(c.nome))}</span>`;
}
function seiLink(d){
  const num = d.processo ? esc(d.processo) : "sem nº";
  const url = safeUrl(d.link);
  if(url) return `<a class="sei" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Abrir processo no SEI" data-stop>${num} <span aria-hidden="true">↗</span></a>`;
  return `<span class="sei nolink" title="Sem link do SEI">${num}</span>`;
}
const statusPill = s => `<span class="pill s-${s}">${STATUS[s]||s}</span>`;
const exTag = d => d.exemplo ? ` <span class="ex">exemplo</span>` : "";

/* ---------- render ---------- */
function render(){
  renderToday();
  renderNotice(); renderKpis(); renderTabs(); renderView();
  // Keep an open demand form intact while live updates arrive; the collaborator list is safe to refresh.
  if(!S.modal || S.modal.type==="colabs" || !$("#modal-root form")) renderModal();
  $("#btn-nova").disabled = !S.ctx?.capacidades.gerir_demandas;
}
function renderToday(){
  const d = new Date(TODAY+"T12:00:00");
  const wd = d.toLocaleDateString("pt-BR",{weekday:"long"}), dm = d.toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric"});
  $("#today-lbl").innerHTML = `${esc(dm)}<small>${esc(wd.charAt(0).toUpperCase()+wd.slice(1))}</small>`;
}
function renderNotice(){
  const n = $("#notice"); let html = "";
  if(S.demo) html = `<div class="notice"><span><b>Modo demonstração.</b> Os dados abaixo são exemplos e as alterações não ficam salvas nesta visualização.</span></div>`;
  else if(somenteLeitura()) html = `<div class="notice"><span>Você tem acesso somente para leitura. O cadastro e a atualização de demandas são feitos pela gestão; metas e modelos são mantidos pela administração.</span></div>`;
  else if(!S.loading && (S.demandas.some(d=>d.exemplo) || S.metas.some(m=>m.exemplo) || S.modelos.some(m=>m.exemplo))) html = `<div class="notice"><span>O painel contém registros de <b>exemplo</b> (modelos de processo ou demandas). Edite-os ou remova-os quando começar a usar os seus.</span><button class="btn small" data-action="clear-examples">Remover exemplos</button></div>`;
  n.innerHTML = html;
}
function renderKpis(){
  const open = S.demandas.filter(isOpen);
  const late = open.filter(d => d.prazo && d.prazo < TODAY).length;
  const soon = open.filter(d => d.prazo && d.prazo >= TODAY && d.prazo <= addDays(TODAY,3)).length;
  const mes = TODAY.slice(0,7);
  const doneMonth = S.demandas.filter(d => d.status==="concluida" && (d.concluidoEm||"").slice(0,7)===mes).length;
  const v = x => S.loading ? "…" : x;
  $("#kpis").innerHTML = `
    <div class="kpi hero"><span class="label">Demandas abertas</span><b class="value">${v(open.length)}</b><span class="sub">${v(S.metas.filter(m=>metaInfo(m).sit!=="concluida").length)} metas 5W2H em aberto</span></div>
    <div class="kpi ${late?"bad":""}" style="--k:var(--bad)"><span class="label">Prazo vencido</span><b class="value">${v(late)}</b><span class="sub">demandas em atraso</span></div>
    <div class="kpi ${soon?"warn":""}" style="--k:var(--warn)"><span class="label">Vencem em 3 dias</span><b class="value">${v(soon)}</b><span class="sub">até ${fmtDate(addDays(TODAY,3))}</span></div>
    <div class="kpi ok" style="--k:var(--ok)"><span class="label">Concluídas no mês</span><b class="value">${v(doneMonth)}</b><span class="sub">processos finalizados</span></div>`;
}
function renderTabs(){
  const open = S.demandas.filter(isOpen).length, done = S.demandas.length - open;
  const t = (id,label,count) => `<button class="tab" role="tab" id="tab-${id}" aria-selected="${S.tab===id}" data-action="tab" data-tab="${id}">${label}<span class="count">${count}</span></button>`;
  $("#tabs").innerHTML = t("colab","Por colaborador",S.colabs.length) + t("todas","Todas as demandas",S.demandas.length) + t("processos","Controle de processos",S.demandas.filter(d => ckArr(d).length).length) + t("concluidas","Processos concluídos",done) + t("metas","Metas 5W2H",S.metas.length);
}
function renderView(){
  const v = $("#view");
  if(S.loading){ v.innerHTML = `<div class="empty">Carregando demandas…</div>`; return; }
  if(S.tab==="todas") v.innerHTML = viewTodas();
  else if(S.tab==="concluidas") v.innerHTML = viewConcluidas();
  else if(S.tab==="metas") v.innerHTML = viewMetas();
  else if(S.tab==="processos") v.innerHTML = viewProcessos();
  else v.innerHTML = viewColab();
}

/* ---------- metas 5W2H ---------- */
const ET_STATUS = {pendente:"A ser realizada", andamento:"Em andamento", concluida:"Concluída", nao_concluida:"Não concluída"};
const SIT = {atrasada:"Atrasada", emandamento:"Em andamento", planejada:"Não iniciada", concluida:"Concluída"};
const SIT_COLOR = {atrasada:"var(--bad)", emandamento:"var(--warn)", planejada:"var(--line-strong)", concluida:"var(--ok)"};
const MES_SIGLA = ["J","F","M","A","M","J","J","A","S","O","N","D"];
const MES_NOME = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MES_ATUAL = +TODAY.slice(5,7), ANO_ATUAL = +TODAY.slice(0,4);
const metaEtapas = m => Array.isArray(m.etapas) ? m.etapas : [];
function etapaAtrasada(e){ return e.status!=="concluida" && ((e.prazo && e.prazo < TODAY) || e.status==="nao_concluida"); }
function metaInfo(m){
  const et = metaEtapas(m), total = et.length;
  const done = et.filter(e => e.status==="concluida").length;
  const late = et.filter(etapaAtrasada).length;
  let sit;
  if(total && done===total) sit = "concluida";
  else if(!total && m.status==="concluida") sit = "concluida";
  else if(late || (m.prazo && m.prazo < TODAY)) sit = "atrasada";
  else if(done || et.some(e => e.status==="andamento") || (!total && m.status==="andamento")) sit = "emandamento";
  else sit = "planejada";
  const abertas = et.filter(e => e.status!=="concluida").sort((a,b) => String(a.prazo||"9").localeCompare(String(b.prazo||"9")));
  const dias = m.prazo ? daysBetween(TODAY, m.prazo) : null;
  return {total, done, late, sit, prog: total ? done/total : (sit==="concluida"?1:0), next: abertas[0] || null, dias};
}
const META_ST = {planejada:"Não iniciada", andamento:"Em andamento", concluida:"Concluída"};
function fonteTag(m){
  const f = Array.isArray(m.fontes) ? m.fontes : (m.origem ? [m.origem] : []);
  if(!f.length) return "";
  const lbl = f.includes("planilha") && f.includes("pdf") ? "Planilha + PDF" : f.includes("pdf") ? "PDF" : "Planilha";
  return `<span class="ex" title="Origem dos dados">${lbl}</span>`;
}
function prazoTexto(i){
  if(i.sit==="concluida") return "Concluída";
  if(i.dias==null) return "Sem prazo definido";
  if(i.dias<0) return (-i.dias)+(i.dias===-1?" dia":" dias")+" após o prazo";
  if(i.dias===0) return "Vence hoje";
  return "Faltam "+i.dias+(i.dias===1?" dia":" dias");
}
// status of one month for one step: the spreadsheet colour if there is one, otherwise a marker on the deadline month
function mesEtapa(e, k, ano){
  const v = e.meses && e.meses[String(k)];
  if(v) return "st-"+v;
  if(e.prazo && +e.prazo.slice(0,4)===ano && +e.prazo.slice(5,7)===k) return "st-prazo";
  return "";
}
// one summary row per meta: the most advanced/critical status seen in each month
function mesMeta(m, k){
  const rank = {"st-nao_concluida":4,"st-andamento":3,"st-concluida":2,"st-previsto":1,"st-prazo":0,"":-1};
  let best = "";
  metaEtapas(m).forEach(e => { const c = mesEtapa(e, k, m.ano||ANO_ATUAL); if(rank[c] > rank[best]) best = c; });
  if(!metaEtapas(m).length && m.prazo && +m.prazo.slice(0,4)===(m.ano||ANO_ATUAL) && +m.prazo.slice(5,7)===k) best = "st-prazo";
  return best;
}
const monthHead = cls => MES_SIGLA.map((s,i) => `<span class="${i+1===MES_ATUAL?"now":""}" title="${MES_NOME[i]}">${s}</span>`).join("");
function setoresList(){
  const map = new Map();
  S.metas.forEach(m => { const k = m.setor || "Sem setor"; if(!map.has(k)) map.set(k, {setor:k, nome:m.setorNome||"", metas:[]}); map.get(k).metas.push(m); });
  return [...map.values()].sort((a,b) => a.setor.localeCompare(b.setor,"pt-BR"));
}
function matchMeta(m, q){
  if(!q) return true; q = q.toLowerCase();
  return [m.titulo,m.oque,m.porque,m.como,m.quem,m.setor,m.setorNome,m.respProjeto,...metaEtapas(m).flatMap(e=>[e.etapa,e.responsavel,e.obs])].some(x => String(x||"").toLowerCase().includes(q));
}
function segbar(list){
  const c = {concluida:0, emandamento:0, atrasada:0, planejada:0};
  list.forEach(m => c[metaInfo(m).sit]++);
  const n = list.length || 1;
  return `<div class="segbar" aria-hidden="true">${["concluida","emandamento","atrasada","planejada"].map(k => c[k]?`<i style="width:${c[k]/n*100}%;background:${SIT_COLOR[k]}"></i>`:"").join("")}</div>`;
}
function viewMetas(){
  const f = S.fm;
  const setores = setoresList();
  const infos = new Map(S.metas.map(m => [m.id, metaInfo(m)]));
  const rows = S.metas.filter(m => (!f.setor || (m.setor||"Sem setor")===f.setor) && (!f.sit || infos.get(m.id).sit===f.sit) && matchMeta(m, f.q));
  const allEt = S.metas.flatMap(metaEtapas), etDone = allEt.filter(e=>e.status==="concluida").length;
  const cnt = k => S.metas.filter(m => infos.get(m.id).sit===k).length;
  const w5 = (k, pt, v) => `<div><span class="k">${k} <span>· ${pt}</span></span><p>${v ? esc(v) : "—"}</p></div>`;
  const card = m => {
    const i = infos.get(m.id), et = metaEtapas(m), ano = m.ano || ANO_ATUAL;
    const nk = i.next ? (etapaAtrasada(i.next) ? "var(--bad)" : i.next.status==="andamento" ? "var(--warn)" : "var(--line-strong)") : "var(--ok)";
    const nextTxt = i.next
      ? `<span class="lbl">Próxima etapa</span>${esc(i.next.etapa)}${i.next.responsavel?` <span class="hint">· ${esc(i.next.responsavel)}</span>`:""}<br><span class="${etapaAtrasada(i.next)?"late":""}" style="font-size:12.5px">${i.next.prazo?"Prazo "+fmtDate(i.next.prazo):(i.next.prazoTexto?esc(i.next.prazoTexto):"Sem prazo")} · ${ET_STATUS[i.next.status]||""}${etapaAtrasada(i.next)&&i.next.prazo&&i.next.prazo<TODAY?" · vencida há "+daysBetween(i.next.prazo,TODAY)+" dias":""}</span>`
      : (et.length ? `<span class="lbl">Etapas</span>Todas as etapas concluídas.` : `<span class="lbl">Situação informada</span>${esc(m.statusPdf || META_ST[m.status] || "Sem etapas cadastradas")}${m.pdfData?` <span class="hint">· PDF de ${fmtDate(m.pdfData)}</span>`:""}`);
    return `<article class="meta" style="--k:${SIT_COLOR[i.sit]}">
      <div class="meta-main">
        <div>
          <div class="kicker"><span class="chip">${esc(m.setor||"Sem setor")}${m.numero?" · Meta "+String(m.numero).padStart(2,"0"):""}</span><span class="pill s-${i.sit}">${SIT[i.sit]}</span>${fonteTag(m)}${exTag(m)}</div>
          <h3>${esc(m.titulo || m.oque || "Meta sem título")}</h3>
          <div class="facts-line">
            ${m.quem?`<span>Quem: <b>${esc(m.quem)}</b></span>`:""}
            ${m.quando?`<span>Quando: <b>${esc(m.quando.length>70?m.quando.slice(0,70)+"…":m.quando)}</b></span>`:""}
            ${m.quanto?`<span>Quanto: <b>${esc(m.quanto.length>40?m.quanto.slice(0,40)+"…":m.quanto)}</b></span>`:""}
          </div>
          <div class="next" style="--nk:${nk}">${nextTxt}</div>
        </div>
        <div class="meta-side">
          <div class="prog-row"><b>${Math.round(i.prog*100)}%</b><span>${i.total ? `${i.done} de ${i.total} ${i.total===1?"etapa concluída":"etapas concluídas"}` : "sem etapas detalhadas"}</span></div>
          <div class="prog ${i.sit==="atrasada"?"bad":i.sit==="concluida"?"ok":"warn"}"><i style="width:${Math.round(i.prog*100)}%"></i></div>
          <div>
            <div class="months" aria-hidden="true">${monthHead()}</div>
            <div class="months" role="img" aria-label="Cronograma de ${ano}">${MES_SIGLA.map((s,k) => `<i class="${mesMeta(m,k+1)} ${k+1===MES_ATUAL&&ano===ANO_ATUAL?"now":""}" title="${MES_NOME[k]}"></i>`).join("")}</div>
          </div>
          <div class="hint">Prazo final ${fmtDate(m.prazo)} · <span class="${i.sit==="atrasada"?"late":""}">${prazoTexto(i)}</span></div>
        </div>
      </div>
      <details${S.open.has(m.id+":et")?" open":""} data-key="${esc(m.id)}:et"><summary>Etapas e cronograma (${et.length})</summary>
        ${et.length ? `<div class="gantt-wrap"><table class="gantt">
          <thead><tr><th>Etapa</th><th>Responsável</th><th>Prazo</th><th>Situação</th>${MES_SIGLA.map((s,k)=>`<th class="m ${k+1===MES_ATUAL&&ano===ANO_ATUAL?"now":""}" title="${MES_NOME[k]}">${s}</th>`).join("")}</tr></thead>
          <tbody>${et.map((e,idx) => `<tr>
            <td class="et">${esc(e.etapa)}${e.areas||e.custo||e.obs?`<small>${[e.areas?"Áreas: "+esc(e.areas):"", e.custo?"Custo: "+esc(e.custo):"", e.obs?"Obs.: "+esc(e.obs):""].filter(Boolean).join(" · ")}</small>`:""}</td>
            <td style="white-space:nowrap">${esc(e.responsavel||"—")}</td>
            <td class="mono" style="white-space:nowrap"><span class="${etapaAtrasada(e)&&e.prazo&&e.prazo<TODAY?"late":""}">${e.prazo?fmtDate(e.prazo):"—"}</span>${e.prazoTexto?`<small class="hint" style="display:block;font-family:var(--sans)">${esc(e.prazoTexto)}</small>`:""}</td>
            <td><select class="inline" data-action="etapa-status" data-id="${esc(m.id)}" data-i="${idx}" aria-label="Situação da etapa" ${somenteLeitura()?"disabled":""}>${Object.keys(ET_STATUS).map(s=>`<option value="${s}" ${e.status===s?"selected":""}>${ET_STATUS[s]}</option>`).join("")}</select></td>
            ${MES_SIGLA.map((s,k) => `<td class="m ${k+1===MES_ATUAL&&ano===ANO_ATUAL?"now":""}"><i class="${mesEtapa(e,k+1,ano)}"></i></td>`).join("")}
          </tr>`).join("")}</tbody></table></div>` : `<div class="empty-mini">Nenhuma etapa cadastrada.</div>`}
      </details>
      <details${S.open.has(m.id+":5w")?" open":""} data-key="${esc(m.id)}:5w"><summary>Plano 5W2H completo${m.pdfItens&&m.pdfItens.length>1?` (${m.pdfItens.length} linhas no PDF)`:""}</summary>
        <div class="w5">
          ${w5("What","O quê",m.oque)}${w5("Why","Por quê",m.porque)}${w5("Where","Onde",m.onde)}
          ${w5("Who","Quem",m.quem)}${w5("When","Quando",m.quando)}${w5("How","Como",m.como)}${w5("How much","Quanto",m.quanto)}
          ${m.statusPdf?w5("Status no PDF",m.pdfData?"em "+fmtDate(m.pdfData):"",m.statusPdf):""}
          ${w5("Dimensão","",[m.dimensao,m.objetivo].filter(Boolean).join(" — "))}
          ${w5("Área solicitante","",[m.areaSolicitante,m.solicitante].filter(Boolean).join(" — "))}
          ${w5("Responsáveis","área · projeto · coordenação",[m.respArea,m.respProjeto,m.respCoord].map(x=>x||"—").join(" · "))}
          ${m.processo||m.link?`<div><span class="k">SEI <span>· processo</span></span><p>${seiLink(m)}</p></div>`:""}
        </div>
      </details>
      <div class="meta-foot"><button class="btn small" data-action="meta-edit" data-id="${esc(m.id)}">${somenteLeitura()?"Ver detalhes":"Editar meta"}</button></div>
    </article>`;
  };
  // group cards by sector unless one sector is selected
  const groups = new Map();
  rows.slice().sort((a,b) => String(a.setor||"").localeCompare(String(b.setor||""),"pt-BR") || (a.numero||0)-(b.numero||0)).forEach(m => {
    const k = m.setor || "Sem setor"; if(!groups.has(k)) groups.set(k, []); groups.get(k).push(m);
  });
  const list = [...groups.entries()].map(([k, ms]) => {
    const s = setores.find(x => x.setor===k);
    return `${groups.size>1 || !f.setor ? `<div class="grp-head"><h2>${esc(k)}</h2><span>${esc(s&&s.nome&&s.nome.toUpperCase()!==k.toUpperCase()?s.nome:"")}</span></div>` : ""}${ms.map(card).join("")}`;
  }).join("");
  return `<div style="display:grid;gap:14px">
    <section class="panel">
      <div class="panel-head"><h2>Metas por setor</h2>
        <div class="summary"><span><b>${S.metas.length}</b> metas</span><span><b>${etDone}</b> de <b>${allEt.length}</b> etapas concluídas (${allEt.length?Math.round(etDone/allEt.length*100):0}%)</span>
          <span><span class="pill s-atrasada">Atrasadas</span> <b>${cnt("atrasada")}</b></span><span><span class="pill s-emandamento">Em andamento</span> <b>${cnt("emandamento")}</b></span><span><span class="pill s-concluida">Concluídas</span> <b>${cnt("concluida")}</b></span><span><span class="pill s-planejada">Não iniciadas</span> <b>${cnt("planejada")}</b></span></div>
      </div>
      ${setores.length ? `<div class="setores">${setores.map(s => {
        const et = s.metas.flatMap(metaEtapas), d = et.filter(e=>e.status==="concluida").length;
        const late = s.metas.filter(m => infos.get(m.id).sit==="atrasada").length;
        return `<button class="setor-btn" data-action="setor-pick" data-setor="${esc(s.setor)}" aria-pressed="${f.setor===s.setor}" title="${esc(s.nome)}">
          <span class="top"><b>${esc(s.setor)}</b><span class="pct">${et.length?Math.round(d/et.length*100):0}%</span></span>
          ${segbar(s.metas)}
          <span class="s"><span>${s.metas.length} ${s.metas.length===1?"meta":"metas"}</span><span>${d}/${et.length} etapas</span>${late?`<span class="late">${late} ${late===1?"atrasada":"atrasadas"}</span>`:""}</span>
        </button>`}).join("")}</div>` : `<div class="empty">Nenhuma meta cadastrada ainda.</div>`}
    </section>
    <div class="metas-top">
      <div class="filters">
        <input type="search" id="fm-q" placeholder="Buscar meta, etapa ou responsável" value="${esc(f.q)}" aria-label="Buscar metas">
        <select id="fm-setor" aria-label="Setor"><option value="">Todos os setores</option>${setores.map(s=>`<option value="${esc(s.setor)}" ${f.setor===s.setor?"selected":""}>${esc(s.setor)}</option>`).join("")}</select>
        <select id="fm-sit" aria-label="Situação da meta"><option value="">Todas as situações</option>${Object.keys(SIT).map(k=>`<option value="${k}" ${f.sit===k?"selected":""}>${SIT[k]}</option>`).join("")}</select>
        <span class="meta-count hint">${rows.length} ${rows.length===1?"meta":"metas"}</span>
      </div>
      <button class="btn primary" data-action="meta-new" ${somenteLeitura()?"disabled":""}>+ Nova meta</button>
    </div>
    <div class="legend"><span><i class="sw" style="--c:var(--ok)"></i>Concluída</span><span><i class="sw" style="--c:var(--warn)"></i>Em andamento</span><span><i class="sw" style="--c:var(--bad)"></i>Não concluída</span><span><i class="sw" style="--c:var(--line-strong)"></i>Previsto</span><span><i class="sw" style="--c:transparent;box-shadow:inset 0 0 0 2px var(--accent)"></i>Mês do prazo</span><span>Contorno escuro = mês atual</span></div>
    ${rows.length ? `<div class="mlist">${list}</div>` : `<div class="table-wrap"><div class="empty">${S.metas.length?"Nenhuma meta com esses filtros.":"Nenhuma meta cadastrada ainda."}</div></div>`}
  </div>`;
}
function modalMeta(md){
  const m = md.data, ro = somenteLeitura(), dis = ro ? "disabled" : "";
  const fld = (id,label,val,extra="",hint="") => `<div class="field ${md.errors?.[id]?"invalid":""}"><label for="m-${id}">${label}</label><input id="m-${id}" name="${id}" value="${esc(val??"")}" ${extra} ${dis}>${md.errors?.[id]?`<span class="err">${md.errors[id]}</span>`:hint?`<span class="hint">${hint}</span>`:""}</div>`;
  const area = (id,label,val,ph="") => `<div class="field"><label for="m-${id}">${label}</label><textarea id="m-${id}" name="${id}" placeholder="${ph}" ${dis}>${esc(val??"")}</textarea></div>`;
  const setores=(S.setores||[]).filter(x=>x.ativo).map(x=>x.nome);
  const et = metaEtapas(m);
  return `<div class="overlay" data-action="close-overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mm-title" style="max-width:780px">
    <div class="modal-head"><h2 id="mm-title">${md.isNew?"Nova meta 5W2H":(ro?"Meta 5W2H":"Editar meta 5W2H")}</h2><button class="x" data-action="close" aria-label="Fechar">×</button></div>
    <form id="form-meta" class="modal-body" novalidate>
      <fieldset class="fs"><legend>Identificação</legend>
        <div class="grid3">
          ${fld("setor","Setor",m.setor,'list="setores-list" placeholder="Ex.: DAGEP"')}
          ${fld("numero","Nº da meta",m.numero,'type="number" min="1" step="1"')}
          ${fld("areaSolicitante","Área solicitante",m.areaSolicitante)}
        </div>
        <datalist id="setores-list">${setores.map(s=>`<option value="${esc(s)}">`).join("")}</datalist>
        ${fld("titulo","Meta (título do plano de ação)",m.titulo,'placeholder="Ex.: Capacitação da equipe do setor"')}
        <div class="grid2">${fld("dimensao","Dimensão",m.dimensao)}${fld("objetivo","Objetivo estratégico",m.objetivo)}</div>
      </fieldset>
      <fieldset class="fs"><legend>What · Why · Where · Who · When</legend>
        ${area("oque","O quê (what)",m.oque)}
        ${area("porque","Por quê (why)",m.porque)}
        <div class="grid2">${fld("onde","Onde (where)",m.onde)}${fld("quem","Quem (who)",m.quem)}</div>
        ${fld("quando","Quando (when)",m.quando,'placeholder="Ex.: De 01/06/2026 a 31/12/2026"')}
        ${area("como","Como (how) · resumo",m.como,"Como a meta será executada")}
        <div class="field"><label for="m-status">Situação (usada quando a meta não tem etapas)</label><select id="m-status" name="status" ${dis}>${Object.keys(META_ST).map(k=>`<option value="${k}" ${(m.status||"planejada")===k?"selected":""}>${META_ST[k]}</option>`).join("")}</select></div>
        <div class="grid2">${fld("inicio","Início",m.inicio,'type="date"')}${fld("prazo","Prazo final",m.prazo,'type="date"')}</div>
      </fieldset>
      <fieldset class="fs"><legend>How · etapas</legend>
        ${et.map((e,i) => `<div class="et-row">
          <div class="head"><b>Etapa ${i+1}</b>${ro?"":`<button type="button" class="btn small danger" data-action="etapa-del" data-i="${i}">Remover</button>`}</div>
          <div class="field"><label for="e-${i}-etapa">Descrição</label><textarea id="e-${i}-etapa" name="e-${i}-etapa" ${dis}>${esc(e.etapa)}</textarea></div>
          <div class="grid3">
            <div class="field"><label for="e-${i}-responsavel">Responsável</label><input id="e-${i}-responsavel" name="e-${i}-responsavel" value="${esc(e.responsavel)}" ${dis}></div>
            <div class="field"><label for="e-${i}-prazo">Prazo</label><input id="e-${i}-prazo" name="e-${i}-prazo" type="date" value="${esc(e.prazo)}" ${dis}></div>
            <div class="field"><label for="e-${i}-status">Situação</label><select id="e-${i}-status" name="e-${i}-status" ${dis}>${Object.keys(ET_STATUS).map(s=>`<option value="${s}" ${e.status===s?"selected":""}>${ET_STATUS[s]}</option>`).join("")}</select></div>
          </div>
          <div class="grid3">
            <div class="field"><label for="e-${i}-areas">Áreas envolvidas</label><input id="e-${i}-areas" name="e-${i}-areas" value="${esc(e.areas)}" ${dis}></div>
            <div class="field"><label for="e-${i}-custo">Custo</label><input id="e-${i}-custo" name="e-${i}-custo" value="${esc(e.custo)}" ${dis}></div>
            <div class="field"><label for="e-${i}-obs">Observação</label><input id="e-${i}-obs" name="e-${i}-obs" value="${esc(e.obs)}" ${dis}></div>
          </div>
        </div>`).join("")}
        ${ro?"":`<div><button type="button" class="btn small" data-action="etapa-add">+ Adicionar etapa</button></div>`}
      </fieldset>
      <fieldset class="fs"><legend>How much · responsáveis</legend>
        ${fld("quanto","Quanto (how much)",m.quanto)}
        <div class="grid3">${fld("respArea","Resp. pela área solicitante",m.respArea)}${fld("respProjeto","Resp. pelo projeto",m.respProjeto)}${fld("respCoord","Resp. pela coordenação geral",m.respCoord)}</div>
        <div class="grid2">${fld("processo","Nº do processo SEI (opcional)",m.processo,'class="mono" placeholder="00000.000000/2026-00"')}${fld("link","Link do SEI (opcional)",m.link,'type="url" placeholder="https://sei.…"')}</div>
      </fieldset>
    </form>
    <div class="modal-foot">
      ${!md.isNew && !ro ? (md.confirmDelete
          ? `<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="err">Excluir esta meta?</span><button class="btn small danger" data-action="meta-del-yes">Excluir</button><button class="btn small" data-action="delete-no">Manter</button></span>`
          : `<button class="btn danger" data-action="delete">Excluir</button>`) : ""}
      <div class="right"><button class="btn" data-action="close">${ro?"Fechar":"Cancelar"}</button>${ro?"":`<button class="btn primary" data-action="meta-save" ${md.saving?"disabled":""}>${md.saving?"Salvando…":"Salvar"}</button>`}</div>
    </div>
  </div></div>`;
}
function openMeta(id){
  const m = id ? S.metas.find(x => x.id===id) : null;
  if(id && !m) return;
  S.modal = {type:"meta", isNew:!m, data: m ? JSON.parse(JSON.stringify(m)) : {id:uid(), setor:S.fm.setor||"", numero:"", titulo:"", dimensao:"", objetivo:"", areaSolicitante:"", solicitante:"", oque:"", porque:"", onde:"", quem:"", quando:"", inicio:TODAY, prazo:"", quanto:"", como:"", status:"planejada", respArea:"", respProjeto:"", respCoord:"", processo:"", link:"", ano:ANO_ATUAL, etapas:[{etapa:"", responsavel:"", areas:"", custo:"", meses:{}, prazo:"", prazoTexto:"", status:"pendente", obs:""}]}};
  renderModal();
  setTimeout(()=>{ const el = $(md_first()); if(el && !somenteLeitura()) el.focus(); },0);
}
const md_first = () => S.modal && S.modal.isNew ? "#m-setor" : "#m-titulo";
// copy what is typed in the form back into the modal state (before adding/removing steps or saving)
function harvestMeta(){
  const form = $("#form-meta"); if(!form) return S.modal.data;
  const g = n => form.elements[n] ? form.elements[n].value.trim() : "";
  const d = S.modal.data;
  ["setor","titulo","dimensao","objetivo","areaSolicitante","oque","porque","onde","quem","quando","como","status","inicio","prazo","quanto","respArea","respProjeto","respCoord","link"].forEach(k => d[k] = g(k));
  d.setorId=(S.setores||[]).find(s=>s.nome===d.setor)?.id||null;
  d.processo = formatSEI(g("processo"));
  d.numero = g("numero") ? +g("numero") : "";
  d.etapas = metaEtapas(d).map((e,i) => {
    const prazo = g(`e-${i}-prazo`);
    return {...e, etapa:g(`e-${i}-etapa`), responsavel:g(`e-${i}-responsavel`), areas:g(`e-${i}-areas`), custo:g(`e-${i}-custo`), obs:g(`e-${i}-obs`),
      status:g(`e-${i}-status`)||"pendente", prazo, prazoTexto: prazo!==e.prazo ? "" : (e.prazoTexto||"")};
  });
  return d;
}
async function saveMeta(){
  const md = S.modal;
  const data = harvestMeta();
  data.etapas = metaEtapas(data).filter(e => e.etapa || e.responsavel || e.prazo);
  const errors = {};
  if(!data.titulo && !data.oque) errors.titulo = "Dê um título à meta.";
  if(data.inicio && data.prazo && data.prazo < data.inicio) errors.prazo = "O prazo final não pode ser antes do início.";
  if(data.link && !safeUrl(data.link)) errors.link = "Use um endereço completo, começando com https://";
  if(Object.keys(errors).length){ S.modal = {...md, data, errors}; renderModal(); return; }
  if(!data.prazo){ const ps = data.etapas.map(e=>e.prazo).filter(Boolean).sort(); data.prazo = ps[ps.length-1] || ""; }
  data.ano = data.prazo ? +data.prazo.slice(0,4) : (data.ano || ANO_ATUAL);
  if(!data.criadoEm) data.criadoEm = TODAY;
  data.atualizadoEm = new Date().toISOString();
  S.modal = {...md, data, saving:true}; renderModal();
  try{
    await write("metas", data.id, clean(data));
    S.modal = null; render(); toast(md.isNew ? "Meta cadastrada" : "Meta atualizada");
  }catch(e){ if(S.modal){ S.modal.saving = false; renderModal(); } }
}
async function setEtapaStatus(id, i, status){
  const m = S.metas.find(x => x.id===id); if(!m) return;
  const data = JSON.parse(JSON.stringify(m));
  if(!data.etapas || !data.etapas[i] || data.etapas[i].status===status) return;
  data.etapas[i].status = status;
  data.atualizadoEm = new Date().toISOString();
  try{ await write("metas", id, clean(data)); if(S.demo) render(); toast("Etapa: "+ET_STATUS[status]); }catch(e){ render(); }
}

function viewColab(){
  if(!S.colabs.length) return `<div class="table-wrap"><div class="empty">Nenhum responsável no seu alcance. O administrador configura os vínculos com o RH.</div></div>`;
  const groups = S.colabs.slice().sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")).map(c => ({id:c.id, c}));
  const orphan = S.demandas.filter(d => !colabById(d.responsavelId));
  if(orphan.length) groups.push({id:"", c:null});
  return `<div class="board">${groups.map(g => personCard(g.id, g.c)).join("")}</div>`;
}
function personCard(id, c){
  const mine = S.demandas.filter(d => c ? d.responsavelId===id : !colabById(d.responsavelId));
  const open = mine.filter(isOpen).sort(byDeadline);
  const done = mine.length - open.length;
  const late = open.filter(d => d.prazo && d.prazo < TODAY).length;
  const counts = {afazer:0,andamento:0,aguardando:0,concluida:0};
  mine.forEach(d => counts[d.status] = (counts[d.status]||0)+1);
  const total = mine.length || 1;
  const bar = Object.keys(counts).map(k => counts[k] ? `<i style="width:${counts[k]/total*100}%;background:${STATUS_COLOR[k]}" title="${STATUS[k]}: ${counts[k]}"></i>` : "").join("");
  const head = c
    ? `${avatar(id)}<div><h3>${esc(c.nome)}${exTag(c)}</h3>${c.funcao?`<div class="role">${esc(c.funcao)}</div>`:""}</div>`
    : `<span class="av" style="--h:210;opacity:.5">—</span><div><h3>Sem responsável</h3><div class="role">Demandas ainda não atribuídas</div></div>`;
  const list = open.length
    ? `<ul class="plist">${open.map(d => { const dl = deadline(d); return `
        <li data-action="edit" data-id="${esc(d.id)}" tabindex="0">
          <div class="t">${esc(d.titulo)}${ckChip(d)}${exTag(d)}</div>
          <div class="m">${seiLink(d)} ${statusPill(d.status)} <span class="prio ${d.prioridade}">${PRIO[d.prioridade]||""}</span>
            <span class="${dl?dl.cls:""}">Prazo ${fmtDate(d.prazo)}${dl?" · "+dl.label:""}</span></div>
        </li>`}).join("")}</ul>`
    : `<div class="empty-mini">Nenhuma demanda aberta.</div>`;
  return `<article class="person">
    <div class="person-head">${head}</div>
    <div class="stack" aria-hidden="true">${bar}</div>
    <div class="person-stats"><span><b>${open.length}</b> abertas</span>${late?`<span class="late"><b>${late}</b> atrasadas</span>`:""}<span><b>${done}</b> concluídas</span></div>
    ${list}
    <div class="person-foot">
      <button class="btn link" data-action="see-done" data-colab="${esc(id)}" ${done?"":"disabled"}>Ver concluídas (${done})</button>
      ${c && !somenteLeitura() ? `<button class="btn small" data-action="new" data-colab="${esc(id)}">+ Atribuir</button>`:""}
    </div>
  </article>`;
}
function byDeadline(a,b){
  const pa = a.prazo || "9999", pb = b.prazo || "9999";
  return pa < pb ? -1 : pa > pb ? 1 : (PRIO_ORDER[a.prioridade]??3) - (PRIO_ORDER[b.prioridade]??3);
}
function colabOptions(sel, withAll, allLabel){
  const opts = S.colabs.filter(c=>S.modal?.type!=='demanda'||c.setorId===Number(S.modal.data.setorId)||c.id===S.modal.data.responsavelId).slice().sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")).map(c => `<option value="${esc(c.id)}" ${sel===c.id?"selected":""}>${esc(c.nome)}</option>`).join("");
  return (withAll?`<option value="">${allLabel||"Todos os colaboradores"}</option>`:"") + opts;
}
function matchQ(d,q){
  if(!q) return true; q = q.toLowerCase();
  return [d.titulo,d.processo,d.obs,d.modeloNome,colabName(d.responsavelId)].some(x => String(x||"").toLowerCase().includes(q));
}

function viewTodas(){
  const f = S.f;
  let rows = S.demandas.filter(d =>
    (!f.colab || (f.colab==="__none" ? !colabById(d.responsavelId) : d.responsavelId===f.colab)) &&
    (!f.status || (f.status==="abertas" ? isOpen(d) : f.status==="atrasadas" ? (isOpen(d) && d.prazo && d.prazo<TODAY) : d.status===f.status)) &&
    (!f.prio || d.prioridade===f.prio) && matchQ(d,f.q));
  const k = S.sort.key, dir = S.sort.dir;
  rows.sort((a,b) => {
    if(k==="prazo") return byDeadline(a,b)*dir;
    if(k==="prioridade") return ((PRIO_ORDER[a.prioridade]??3)-(PRIO_ORDER[b.prioridade]??3))*dir;
    const va = k==="responsavel" ? colabName(a.responsavelId) : String(a[k]||""), vb = k==="responsavel" ? colabName(b.responsavelId) : String(b[k]||"");
    return va.localeCompare(vb,"pt-BR")*dir;
  });
  const arrow = key => S.sort.key===key ? (S.sort.dir>0?" ↑":" ↓") : "";
  const th = (key,label) => `<th class="sortable" data-action="sort" data-key="${key}" aria-sort="${S.sort.key===key?(S.sort.dir>0?"ascending":"descending"):"none"}">${label}${arrow(key)}</th>`;
  return `
  <div style="display:grid;gap:12px">
    <div class="filters">
      <input type="search" id="f-q" placeholder="Buscar por demanda, nº do processo ou colaborador" value="${esc(f.q)}" aria-label="Buscar">
      <select id="f-colab" aria-label="Colaborador">${colabOptions(f.colab,true)}<option value="__none" ${f.colab==="__none"?"selected":""}>Sem responsável</option></select>
      <select id="f-status" aria-label="Situação">
        <option value="" ${!f.status?"selected":""}>Todas as situações</option>
        <option value="abertas" ${f.status==="abertas"?"selected":""}>Abertas</option>
        <option value="atrasadas" ${f.status==="atrasadas"?"selected":""}>Atrasadas</option>
        ${Object.keys(STATUS).map(s=>`<option value="${s}" ${f.status===s?"selected":""}>${STATUS[s]}</option>`).join("")}
      </select>
      <select id="f-prio" aria-label="Prioridade"><option value="">Todas as prioridades</option>${Object.keys(PRIO).map(p=>`<option value="${p}" ${f.prio===p?"selected":""}>${PRIO[p]}</option>`).join("")}</select>
      <span class="meta">${rows.length} ${rows.length===1?"demanda":"demandas"}</span>
    </div>
    <div class="table-wrap">
      ${rows.length ? `<table>
        <thead><tr>${th("titulo","Demanda")}${th("processo","Processo SEI")}${th("responsavel","Responsável")}${th("prioridade","Prioridade")}${th("prazo","Prazo")}<th>Situação</th><th></th></tr></thead>
        <tbody>${rows.map(d => { const dl = deadline(d); return `<tr>
          <td><div class="t">${esc(d.titulo)}${ckChip(d)}${exTag(d)}</div>${d.obs?`<div class="sub">${esc(d.obs)}</div>`:""}</td>
          <td>${seiLink(d)}</td>
          <td><span class="who">${avatar(d.responsavelId,true)}${esc(colabName(d.responsavelId))}</span></td>
          <td><span class="prio ${d.prioridade}">${PRIO[d.prioridade]||"—"}</span></td>
          <td class="mono" style="white-space:nowrap">${fmtDate(d.prazo)}${dl?`<div><span class="pill ${dl.tag}" style="font-family:var(--sans)">${dl.label}</span></div>`:""}</td>
          <td><select class="inline" data-action="status" data-id="${esc(d.id)}" aria-label="Situação de ${esc(d.titulo)}" ${!podeSetor(d.setorId)?"disabled":""}>${Object.keys(STATUS).map(s=>`<option value="${s}" ${d.status===s?"selected":""}>${STATUS[s]}</option>`).join("")}</select></td>
          <td><button class="btn small" data-action="edit" data-id="${esc(d.id)}">${somenteLeitura()?"Ver":"Editar"}</button></td>
        </tr>`}).join("")}</tbody></table>`
      : `<div class="empty">Nenhuma demanda encontrada com esses filtros.</div>`}
    </div>
  </div>`;
}

function viewConcluidas(){
  const f = S.fc;
  const all = S.demandas.filter(d => d.status==="concluida");
  const meses = [...new Set(all.map(d => (d.concluidoEm||"").slice(0,7)).filter(Boolean))].sort().reverse();
  const rows = all.filter(d => (!f.colab || d.responsavelId===f.colab) && (!f.mes || (d.concluidoEm||"").startsWith(f.mes)) && matchQ(d,f.q))
    .sort((a,b) => String(b.concluidoEm||"").localeCompare(String(a.concluidoEm||"")));
  const noPrazo = rows.filter(d => !d.prazo || !d.concluidoEm || d.concluidoEm <= d.prazo).length;
  const pct = rows.length ? Math.round(noPrazo/rows.length*100) : 0;
  const mesLabel = m => { const n = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"]; return n[+m.slice(5,7)-1]+"/"+m.slice(0,4); };
  const perColab = {};
  rows.forEach(d => perColab[d.responsavelId||""] = (perColab[d.responsavelId||""]||0)+1);
  const top = Object.entries(perColab).sort((a,b)=>b[1]-a[1]).map(([id,n]) => `<span>${esc(colabName(id))}: <b>${n}</b></span>`).join("");
  return `
  <div style="display:grid;gap:12px">
    <div class="filters">
      <input type="search" id="fc-q" placeholder="Buscar por processo ou demanda" value="${esc(f.q)}" aria-label="Buscar concluídas">
      <select id="fc-colab" aria-label="Colaborador">${colabOptions(f.colab,true)}</select>
      <select id="fc-mes" aria-label="Mês de conclusão"><option value="">Qualquer mês</option>${meses.map(m=>`<option value="${m}" ${f.mes===m?"selected":""}>${mesLabel(m)}</option>`).join("")}</select>
    </div>
    <div class="summary"><span><b>${rows.length}</b> ${rows.length===1?"processo concluído":"processos concluídos"}</span><span><b>${pct}%</b> dentro do prazo</span>${f.colab?"":top}</div>
    <div class="table-wrap">
      ${rows.length ? `<table>
        <thead><tr><th>Processo SEI</th><th>Demanda</th><th>Responsável</th><th>Prazo</th><th>Concluída em</th><th>Cumprimento</th><th></th></tr></thead>
        <tbody>${rows.map(d => { const ok = !d.prazo || !d.concluidoEm || d.concluidoEm <= d.prazo; const atraso = (!ok) ? daysBetween(d.prazo,d.concluidoEm) : 0; return `<tr>
          <td>${seiLink(d)}</td>
          <td><div class="t">${esc(d.titulo)}${ckChip(d)}${exTag(d)}</div>${d.obs?`<div class="sub">${esc(d.obs)}</div>`:""}</td>
          <td><span class="who">${avatar(d.responsavelId,true)}${esc(colabName(d.responsavelId))}</span></td>
          <td class="mono">${fmtDate(d.prazo)}</td>
          <td class="mono">${fmtDate(d.concluidoEm)}</td>
          <td>${ok?`<span class="pill tag-ok">No prazo</span>`:`<span class="pill tag-late">${atraso} ${atraso===1?"dia":"dias"} após</span>`}</td>
          <td><button class="btn small" data-action="edit" data-id="${esc(d.id)}">${somenteLeitura()?"Ver":"Abrir"}</button></td>
        </tr>`}).join("")}</tbody></table>`
      : `<div class="empty">Nenhum processo concluído com esses filtros.</div>`}
    </div>
  </div>`;
}

/* ---------- controle de processos (checklists) ---------- */
// A demand's checklist is stored as a map {itemId: {texto, prazo, feito, feitoEm, ordem}} so that two people
// ticking different steps at the same time merge instead of overwriting each other.
function ckArr(d){
  const c = d && d.checklist;
  if(!c) return [];
  const arr = Array.isArray(c) ? c.map((x,i) => ({id:x.id||("i"+i), ordem:i, ...x})) : Object.entries(c).map(([id,x]) => ({id, ...x}));
  return arr.filter(x => x && x.texto!=null).sort((a,b) => (a.ordem??0)-(b.ordem??0));
}
function ckMap(arr){ const o = {}; arr.forEach((x,i) => { o[x.id] = {texto:x.texto, prazo:x.prazo||"", feito:!!x.feito, feitoEm:x.feitoEm||null, ordem:i}; }); return o; }
function ckInfo(d){
  const it = ckArr(d), total = it.length, done = it.filter(x => x.feito).length;
  const late = it.filter(x => !x.feito && x.prazo && x.prazo < TODAY).length;
  return {it, total, done, late, next: it.find(x => !x.feito) || null, prog: total ? done/total : 0};
}
function ckChip(d){
  const i = ckInfo(d); if(!i.total) return "";
  return `<span class="ckchip ${i.done===i.total?"ok":i.late?"bad":""}" title="Etapas do checklist concluídas">✓ ${i.done}/${i.total}</span>`;
}
function modeloById(id){ return S.modelos.find(x => x.id===id); }
function applyModelo(id){
  const d = S.modal.data, mod = modeloById(id);
  if(!mod){ d.modeloId = ""; d.modeloNome = ""; return; }
  const base = d.inicio || TODAY;
  d.ck = (mod.etapas||[]).map(e => ({id:uid(), texto:e.texto||"", prazo:(e.prazoDias===""||e.prazoDias==null) ? "" : addDays(base, +e.prazoDias), feito:false, feitoEm:null}));
  d.modeloId = id; d.modeloNome = mod.nome;
  const ps = d.ck.map(x => x.prazo).filter(Boolean).sort();
  if(ps.length) d.prazo = ps[ps.length-1];
  if(!d.titulo) d.titulo = mod.nome;
}
function viewProcessos(){
  const f = S.fp, ro = somenteLeitura();
  const modelos = S.modelos.slice().sort((a,b) => String(a.nome).localeCompare(String(b.nome),"pt-BR"));
  const procs = S.demandas.filter(d => ckArr(d).length);
  const rows = procs.filter(d => (!f.modelo || d.modeloId===f.modelo) && (!f.colab || d.responsavelId===f.colab)
      && (f.sit==="todos" || (f.sit==="concluidos" ? !isOpen(d) : isOpen(d))) && matchQ(d, f.q))
    .sort((a,b) => (isOpen(b)-isOpen(a)) || (ckInfo(b).late-ckInfo(a).late) || String(a.prazo||"9").localeCompare(String(b.prazo||"9")));
  const abertos = procs.filter(isOpen);
  const itensLate = abertos.reduce((n,d) => n + ckInfo(d).late, 0);
  const etapasAbertas = abertos.reduce((n,d) => { const i = ckInfo(d); return n + i.total - i.done; }, 0);
  const modeloCard = mo => {
    const et = Array.isArray(mo.etapas) ? mo.etapas : [];
    const em = S.demandas.filter(d => d.modeloId===mo.id && isOpen(d)).length;
    const dias = et.map(e => +e.prazoDias).filter(n => !isNaN(n) && n>0);
    return `<div class="modelo">
      <div><b>${esc(mo.nome)}</b>${exTag(mo)}</div>
      ${mo.descricao?`<div class="s">${esc(mo.descricao)}</div>`:""}
      <div class="s">${et.length} ${et.length===1?"etapa":"etapas"}${dias.length?` · prazo total de ${Math.max(...dias)} dias`:""} · ${em} ${em===1?"processo aberto":"processos abertos"}</div>
      <ol>${et.slice(0,4).map(e => `<li>${esc(e.texto)}</li>`).join("")}${et.length>4?`<li class="more">e mais ${et.length-4}…</li>`:""}</ol>
      <div class="row">${ro?"":`<button class="btn small primary" data-action="proc-start" data-modelo="${esc(mo.id)}">Iniciar processo</button>`}<button class="btn small" data-action="modelo-edit" data-id="${esc(mo.id)}">${S.ctx?.perfil!=="admin"?"Ver etapas":"Editar modelo"}</button></div>
    </div>`;
  };
  const card = d => {
    const i = ckInfo(d), dl = deadline(d);
    const k = !isOpen(d) ? "var(--ok)" : (i.late || (dl && dl.cls==="late")) ? "var(--bad)" : i.done ? "var(--warn)" : "var(--line-strong)";
    const open = !S.shut.has("ck:"+d.id);
    return `<article class="meta" style="--k:${k}">
      <div class="meta-main">
        <div>
          <div class="kicker">${d.modeloNome?`<span class="chip">${esc(d.modeloNome)}</span>`:`<span class="chip">Checklist próprio</span>`}${statusPill(d.status)}${exTag(d)}</div>
          <h3>${esc(d.titulo)}</h3>
          <div class="facts-line">
            <span>${seiLink(d)}</span>
            <span class="who">${avatar(d.responsavelId,true)} <b>${esc(colabName(d.responsavelId))}</b></span>
            <span>Prazo <b class="mono">${fmtDate(d.prazo)}</b>${dl?` <span class="pill ${dl.tag}">${dl.label}</span>`:""}</span>
          </div>
          <div class="next" style="--nk:${i.next ? (i.next.prazo && i.next.prazo<TODAY ? "var(--bad)" : "var(--warn)") : "var(--ok)"}">
            ${i.next ? `<span class="lbl">Próxima etapa</span>${esc(i.next.texto)}${i.next.prazo?` <span class="${i.next.prazo<TODAY?"late":"hint"}">· até ${fmtDate(i.next.prazo)}${i.next.prazo<TODAY?" (vencida)":""}</span>`:""}` : `<span class="lbl">Checklist</span>Todas as etapas concluídas.`}
          </div>
        </div>
        <div class="meta-side">
          <div class="prog-row"><b>${Math.round(i.prog*100)}%</b><span>${i.done} de ${i.total} ${i.total===1?"etapa":"etapas"}</span></div>
          <div class="prog ${!isOpen(d)?"ok":i.late?"bad":"warn"}"><i style="width:${Math.round(i.prog*100)}%"></i></div>
          <div class="hint">${i.late?`<span class="late">${i.late} ${i.late===1?"etapa vencida":"etapas vencidas"}</span> · `:""}Início ${fmtDate(d.inicio||d.criadoEm)}</div>
        </div>
      </div>
      <details${open?" open":""} data-key="ck:${esc(d.id)}"><summary>Checklist (${i.done}/${i.total})</summary>
        <ul class="ck-list">${i.it.map(x => `<li class="ck-item ${x.feito?"done":""}">
          <input type="checkbox" id="ck-${esc(d.id)}-${esc(x.id)}" data-ck="${esc(x.id)}" data-id="${esc(d.id)}" ${x.feito?"checked":""} ${!podeSetor(d.setorId)?"disabled":""}>
          <label for="ck-${esc(d.id)}-${esc(x.id)}">${esc(x.texto)}</label>
          <span class="when ${!x.feito && x.prazo && x.prazo<TODAY?"late":""}">${x.feito ? `feito ${fmtDate(x.feitoEm)}` : (x.prazo ? "até "+fmtDate(x.prazo) : "sem prazo")}</span>
        </li>`).join("")}</ul>
      </details>
      <div class="meta-foot"><button class="btn small" data-action="edit" data-id="${esc(d.id)}">${ro?"Ver demanda":"Editar demanda e checklist"}</button></div>
    </article>`;
  };
  return `<div style="display:grid;gap:14px">
    <section class="panel">
      <div class="panel-head"><h2>Modelos de processo</h2>${S.ctx?.perfil!=="admin"?"":`<button class="btn small" data-action="modelo-new">+ Novo modelo</button>`}</div>
      <p class="hint" style="margin:0 0 12px">Cada modelo guarda o passo a passo de um tipo de processo. Ao cadastrar uma demanda com o modelo, o checklist já vem preenchido, com o prazo de cada etapa calculado a partir da data de início.</p>
      ${modelos.length ? `<div class="modelos">${modelos.map(modeloCard).join("")}</div>` : `<div class="empty" style="padding:16px">Nenhum modelo cadastrado. Crie o primeiro com o passo a passo de um processo que se repete no departamento.</div>`}
    </section>
    <div class="summary"><span><b>${abertos.length}</b> ${abertos.length===1?"processo aberto":"processos abertos"} com checklist</span><span><b>${etapasAbertas}</b> etapas pendentes</span><span class="${itensLate?"late":""}"><b>${itensLate}</b> ${itensLate===1?"etapa vencida":"etapas vencidas"}</span></div>
    <div class="metas-top">
      <div class="filters">
        <input type="search" id="fp-q" placeholder="Buscar processo, nº SEI ou responsável" value="${esc(f.q)}" aria-label="Buscar processos">
        <select id="fp-modelo" aria-label="Tipo de processo"><option value="">Todos os tipos</option>${modelos.map(mo=>`<option value="${esc(mo.id)}" ${f.modelo===mo.id?"selected":""}>${esc(mo.nome)}</option>`).join("")}</select>
        <select id="fp-colab" aria-label="Responsável">${colabOptions(f.colab,true,"Todos os responsáveis")}</select>
        <select id="fp-sit" aria-label="Situação"><option value="abertos" ${f.sit==="abertos"?"selected":""}>Em aberto</option><option value="concluidos" ${f.sit==="concluidos"?"selected":""}>Concluídos</option><option value="todos" ${f.sit==="todos"?"selected":""}>Todos</option></select>
      </div>
      <button class="btn primary" data-action="new" ${ro?"disabled":""}>+ Novo processo</button>
    </div>
    ${rows.length ? `<div class="mlist">${rows.map(card).join("")}</div>`
      : `<div class="table-wrap"><div class="empty">${procs.length ? "Nenhum processo com esses filtros." : "Nenhum processo com checklist ainda. Clique em “Iniciar processo” num modelo acima ou escolha um tipo de processo ao cadastrar uma demanda."}</div></div>`}
  </div>`;
}
function modalModelo(md){
  const m = md.data, ro = somenteLeitura(), dis = ro ? "disabled" : "";
  const usos = S.demandas.filter(d => d.modeloId===m.id).length;
  const et = Array.isArray(m.etapas) ? m.etapas : [];
  return `<div class="overlay" data-action="close-overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mo-title" style="max-width:720px">
    <div class="modal-head"><h2 id="mo-title">${md.isNew?"Novo modelo de processo":(ro?"Modelo de processo":"Editar modelo de processo")}</h2><button class="x" data-action="close" aria-label="Fechar">×</button></div>
    <form id="form-modelo" class="modal-body" novalidate>
      <div class="field ${md.errors?.nome?"invalid":""}"><label for="mo-nome">Tipo de processo</label><input id="mo-nome" name="nome" value="${esc(m.nome)}" placeholder="Ex.: Concessão de férias" ${dis}>${md.errors?.nome?`<span class="err">${md.errors.nome}</span>`:""}</div>
      <div class="field"><label for="mo-desc">Descrição (opcional)</label><textarea id="mo-desc" name="descricao" placeholder="Quando usar este modelo, base legal, observações" ${dis}>${esc(m.descricao)}</textarea></div>
      <fieldset class="fs"><legend>Etapas do checklist</legend>
        <span class="hint">O prazo é contado em dias corridos a partir do início do processo. Deixe em branco se a etapa não tiver prazo.</span>
        <div class="ck-edit-list">${et.map((e,i) => `<div class="ck-edit mt-edit">
          <span class="n">${i+1}</span>
          <input id="mt-${i}-texto" name="mt-${i}-texto" value="${esc(e.texto)}" placeholder="Descreva a etapa" aria-label="Etapa ${i+1}" ${dis}>
          <input id="mt-${i}-dias" name="mt-${i}-dias" type="number" min="0" step="1" value="${esc(e.prazoDias)}" placeholder="dias" aria-label="Prazo da etapa ${i+1}, em dias" ${dis}>
          ${ro?"":`<span class="mt-btns"><button type="button" class="btn small" data-action="mt-up" data-i="${i}" aria-label="Subir etapa ${i+1}" ${i===0?"disabled":""}>↑</button><button type="button" class="btn small" data-action="mt-down" data-i="${i}" aria-label="Descer etapa ${i+1}" ${i===et.length-1?"disabled":""}>↓</button><button type="button" class="btn small danger" data-action="mt-del" data-i="${i}" aria-label="Remover etapa ${i+1}">×</button></span>`}
        </div>`).join("")}</div>
        ${md.errors?.etapas?`<span class="err">${md.errors.etapas}</span>`:""}
        ${ro?"":`<div><button type="button" class="btn small" data-action="mt-add">+ Adicionar etapa</button></div>`}
      </fieldset>
      ${!md.isNew && usos ? `<div class="hint">Alterações valem para os próximos processos. ${usos===1?"O processo já cadastrado mantém":"Os "+usos+" processos já cadastrados mantêm"} o checklist que recebeu.</div>` : ""}
    </form>
    <div class="modal-foot">
      ${!md.isNew && !ro ? (md.confirmDelete
          ? `<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="err">Excluir este modelo?</span><button class="btn small danger" data-action="modelo-del-yes">Excluir</button><button class="btn small" data-action="delete-no">Manter</button></span>`
          : `<button class="btn danger" data-action="delete">Excluir</button>`) : ""}
      <div class="right"><button class="btn" data-action="close">${ro?"Fechar":"Cancelar"}</button>${ro?"":`<button class="btn primary" data-action="modelo-save" ${md.saving?"disabled":""}>${md.saving?"Salvando…":"Salvar modelo"}</button>`}</div>
    </div>
  </div></div>`;
}
function openModelo(id){
  const mo = id ? modeloById(id) : null;
  if(id && !mo) return;
  S.modal = {type:"modelo", isNew:!mo, data: mo ? JSON.parse(JSON.stringify(mo)) : {id:uid(), nome:"", descricao:"", etapas:[{texto:"", prazoDias:""},{texto:"", prazoDias:""},{texto:"", prazoDias:""}]}};
  renderModal();
  setTimeout(()=>{ const el = $("#mo-nome"); if(el && !somenteLeitura()) el.focus(); },0);
}
function harvestModelo(){
  const form = $("#form-modelo"), d = S.modal.data; if(!form) return d;
  const g = n => form.elements[n] ? form.elements[n].value : "";
  d.nome = g("nome").trim(); d.descricao = g("descricao").trim();
  d.etapas = (d.etapas||[]).map((e,i) => { const v = g(`mt-${i}-dias`); return {texto:g(`mt-${i}-texto`).trim(), prazoDias: v==="" ? "" : Math.max(0, Math.round(+v))}; });
  return d;
}
async function saveModelo(){
  const md = S.modal, d = harvestModelo();
  const data = {...d, etapas:(d.etapas||[]).filter(e => e.texto)};
  const errors = {};
  if(!data.nome) errors.nome = "Dê um nome ao tipo de processo.";
  if(!data.etapas.length) errors.etapas = "Inclua pelo menos uma etapa.";
  if(Object.keys(errors).length){ S.modal = {...md, errors}; renderModal(); return; }
  if(!data.criadoEm) data.criadoEm = TODAY;
  data.atualizadoEm = new Date().toISOString();
  S.modal = {...md, saving:true}; renderModal();
  try{ await write("modelos", data.id, clean(data)); S.modal = null; render(); toast(md.isNew ? "Modelo criado" : "Modelo atualizado"); }
  catch(e){ if(S.modal){ S.modal.saving = false; renderModal(); } }
}
function deepMerge(a, b){
  for(const k of Object.keys(b)){
    const v = b[k];
    if(v && typeof v==="object" && !Array.isArray(v) && a[k] && typeof a[k]==="object" && !Array.isArray(a[k])) a[k] = deepMerge({...a[k]}, v);
    else a[k] = v;
  }
  return a;
}
// partial write: nested objects merge, so only the fields in `patch` change
async function patchDoc(col,id,patch){ return persistir(col,id,patch,true); }
async function toggleItem(id, itemId, feito){
  const d = S.demandas.find(x => x.id===id); if(!d) return;
  const arr = ckArr(d).map(x => x.id===itemId ? {...x, feito, feitoEm: feito ? TODAY : null} : x);
  const done = arr.filter(x => x.feito).length, total = arr.length;
  const patch = {checklist: Array.isArray(d.checklist) ? ckMap(arr) : {[itemId]: {feito, feitoEm: feito ? TODAY : null}}, atualizadoEm:new Date().toISOString()};
  let msg = feito ? "Etapa concluída" : "Etapa reaberta";
  if(total && done===total && d.status!=="concluida"){ patch.status = "concluida"; patch.concluidoEm = TODAY; msg = "Checklist completo. Demanda concluída."; }
  else if(done<total && d.status==="concluida"){ patch.status = "andamento"; patch.concluidoEm = null; }
  else if(done>0 && d.status==="afazer"){ patch.status = "andamento"; }
  try{ await patchDoc("demandas", id, patch); if(S.demo) render(); toast(msg); }catch(e){ render(); }
}
function harvestDemanda(){
  const form = $("#form-demanda"), d = S.modal.data; if(!form) return d;
  const g = n => form.elements[n] ? form.elements[n].value : "";
  Object.assign(d, {titulo:g("titulo").trim(), processo:formatSEI(g("processo")), link:g("link").trim(), responsavelId:g("responsavelId"),
    setorId:Number(g("setorId"))||d.setorId, prioridade:g("prioridade"), prazo:g("prazo"), status:g("status"), obs:g("obs").trim(), inicio:g("inicio") || d.inicio || TODAY, modeloId:g("modeloId")});
  d.ck = (d.ck||[]).map((x,i) => { const box = form.elements[`ck-${i}-feito`]; const feito = !!(box && box.checked);
    return {...x, texto:g(`ck-${i}-texto`).trim(), prazo:g(`ck-${i}-prazo`), feito, feitoEm: feito ? (x.feitoEm || TODAY) : null}; });
  return d;
}

/* ---------- modals ---------- */
function renderModal(){
  const root = $("#modal-root");
  if(!S.modal){ root.innerHTML = ""; return; }
  if(S.modal.type==="demanda") root.innerHTML = modalDemanda(S.modal);
  else if(S.modal.type==="meta") root.innerHTML = modalMeta(S.modal);
  else if(S.modal.type==="modelo") root.innerHTML = modalModelo(S.modal);
  else {
    const n = $("#c-nome"), f = $("#c-funcao"), focused = document.activeElement && document.activeElement.id;
    if(n && S.modal.nome===undefined){ S.modal.nome = n.value; S.modal.funcao = f.value; }
    root.innerHTML = modalColabs(S.modal);
    delete S.modal.nome; delete S.modal.funcao;
    if(focused && $("#"+focused)) $("#"+focused).focus();
  }
  if(S.modal?.conflict){
    const col={demanda:'demandas',meta:'metas',modelo:'modelos'}[S.modal.type];
    const atual=col&&colecao(col).find(x=>x.id===S.modal.data.id);
    const aviso=document.createElement('div');aviso.className='conflict';
    aviso.innerHTML='<b>Conflito de edição.</b> Seu rascunho foi preservado. Compare os dados atuais; feche e reabra o registro para editar a versão mais recente.<details><summary>Consultar versão atual</summary><pre>'+esc(JSON.stringify(atual,null,2))+'</pre></details>';
    root.querySelector('.modal')?.prepend(aviso);
  }
}
function modalDemanda(m){
  const d = m.data, ro = somenteLeitura();
  const dis = ro ? "disabled" : "";
  return `<div class="overlay" data-action="close-overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="md-title">
    <div class="modal-head"><h2 id="md-title">${m.isNew?"Nova demanda":(ro?"Demanda":"Editar demanda")}</h2><button class="x" data-action="close" aria-label="Fechar">×</button></div>
    <form id="form-demanda" class="modal-body" novalidate>
      <div class="field"><label for="d-setor">Setor da demanda</label><select id="d-setor" name="setorId" ${dis} ${!m.isNew&&S.ctx?.perfil!=='admin'?'disabled':''}>${(S.setores||[]).filter(x=>podeSetor(x.id)||x.id===Number(d.setorId)).map(x=>`<option value="${x.id}" ${Number(d.setorId)===x.id?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></div>
      <div class="field ${m.errors?.titulo?"invalid":""}"><label for="d-titulo">Demanda</label>
        <input id="d-titulo" name="titulo" value="${esc(d.titulo)}" placeholder="Ex.: Elaborar parecer sobre renovação do contrato de limpeza" ${dis}>
        ${m.errors?.titulo?`<span class="err">${m.errors.titulo}</span>`:""}</div>
      <div class="grid2">
        <div class="field"><label for="d-processo">Nº do processo SEI</label>
          <input id="d-processo" name="processo" class="mono" value="${esc(d.processo)}" placeholder="00000.000000/2026-00" ${dis}>
          <span class="hint">17 dígitos são formatados automaticamente.</span></div>
        <div class="field ${m.errors?.link?"invalid":""}"><label for="d-link">Link do processo no SEI</label>
          <input id="d-link" name="link" type="url" value="${esc(d.link)}" placeholder="https://sei.…/controlador.php?…" ${dis}>
          ${m.errors?.link?`<span class="err">${m.errors.link}</span>`:`<span class="hint">Copie o endereço com o processo aberto no SEI.</span>`}</div>
      </div>
      <div class="grid2">
        <div class="field"><label for="d-resp">Responsável</label>
          <select id="d-resp" name="responsavelId" ${dis}>${colabOptions(d.responsavelId,true,"Sem responsável")}</select></div>
        <div class="field"><label for="d-prio">Prioridade</label>
          <select id="d-prio" name="prioridade" ${dis}>${Object.keys(PRIO).map(p=>`<option value="${p}" ${d.prioridade===p?"selected":""}>${PRIO[p]}</option>`).join("")}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="d-prazo">Prazo</label><input id="d-prazo" name="prazo" type="date" value="${esc(d.prazo)}" ${dis}></div>
        <div class="field"><label for="d-status">Situação</label>
          <select id="d-status" name="status" ${dis}>${Object.keys(STATUS).map(s=>`<option value="${s}" ${d.status===s?"selected":""}>${STATUS[s]}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label for="d-obs">Observações</label><textarea id="d-obs" name="obs" placeholder="Andamento, pendências, com quem está o processo…" ${dis}>${esc(d.obs)}</textarea></div>
      <fieldset class="fs"><legend>Checklist do processo</legend>
        <div class="grid2">
          <div class="field"><label for="d-modelo">Tipo de processo</label>
            <select id="d-modelo" name="modeloId" ${dis}><option value="">Sem modelo (checklist livre)</option>${S.modelos.slice().sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR")).map(mo=>`<option value="${esc(mo.id)}" ${d.modeloId===mo.id?"selected":""}>${esc(mo.nome)}</option>`).join("")}</select>
            <span class="hint">Ao escolher, o checklist é preenchido com as etapas do modelo.</span></div>
          <div class="field"><label for="d-inicio">Início do processo</label><input id="d-inicio" name="inicio" type="date" value="${esc(d.inicio||TODAY)}" ${dis}>
            <span class="hint">Os prazos das etapas são contados a partir desta data.</span></div>
        </div>
        ${m.ckMsg?`<span class="err">${esc(m.ckMsg)}</span>`:""}
        ${(d.ck||[]).length ? `<div class="ck-edit-list">${d.ck.map((x,i) => `<div class="ck-edit">
          <input type="checkbox" id="ck-${i}-feito" name="ck-${i}-feito" ${x.feito?"checked":""} aria-label="Etapa ${i+1} concluída" ${dis}>
          <input id="ck-${i}-texto" name="ck-${i}-texto" value="${esc(x.texto)}" placeholder="Descreva a etapa" aria-label="Etapa ${i+1}" ${dis}>
          <input id="ck-${i}-prazo" name="ck-${i}-prazo" type="date" value="${esc(x.prazo)}" aria-label="Prazo da etapa ${i+1}" ${dis}>
          ${ro?"<span></span>":`<button type="button" class="btn small danger" data-action="ck-del" data-i="${i}" aria-label="Remover etapa ${i+1}">×</button>`}
        </div>`).join("")}</div>` : `<span class="hint">Nenhuma etapa. Escolha um tipo de processo ou adicione as etapas uma a uma.</span>`}
        ${ro?"":`<div><button type="button" class="btn small" data-action="ck-add">+ Adicionar etapa</button></div>`}
      </fieldset>
      ${!m.isNew?`<div class="hint" style="font-size:12px;color:var(--muted)">Registrada em ${fmtDate(d.criadoEm)}${d.concluidoEm?` · concluída em ${fmtDate(d.concluidoEm)}`:""}</div>`:""}
    </form>
    <div class="modal-foot">
      ${!m.isNew && !ro ? (m.confirmDelete
          ? `<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="err">Excluir esta demanda?</span><button class="btn small danger" data-action="delete-yes">Excluir</button><button class="btn small" data-action="delete-no">Manter</button></span>`
          : `<button class="btn danger" data-action="delete">Excluir</button>`) : ""}
      <div class="right"><button class="btn" data-action="close">${ro?"Fechar":"Cancelar"}</button>${ro?"":`<button class="btn primary" data-action="save" ${m.saving?"disabled":""}>${m.saving?"Salvando…":"Salvar"}</button>`}</div>
    </div>
  </div></div>`;
}
function modalColabs(){return `<div class="overlay" data-action="close-overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="Responsáveis"><div class="modal-head"><h2>Responsáveis do RH</h2><button class="x" data-action="close" aria-label="Fechar">×</button></div><div class="modal-body"><p>O cadastro e os vínculos são mantidos na Administração compartilhada.</p><ul>${S.colabs.map(c=>`<li>${esc(c.nome)} · ${esc(c.funcao||'')}</li>`).join('')}</ul></div></div></div>`;}

/* ---------- data ---------- */
async function write(col,id,data){ return persistir(col,id,data,false); }
const clean = d => { const o = {...d}; delete o.id; return o; };

async function saveDemanda(){
  const m = S.modal;
  const data = {...harvestDemanda()};
  const ck = (data.ck||[]).filter(x => x.texto);
  const errors = {};
  if(!data.titulo) errors.titulo = "Descreva a demanda.";
  if(data.link && !safeUrl(data.link)) errors.link = "Use um endereço completo, começando com https://";
  if(Object.keys(errors).length){ S.modal = {...m, errors}; renderModal(); return; }
  const done = ck.filter(x => x.feito).length;
  if(ck.length && done===ck.length) data.status = "concluida";
  else if(done && data.status==="afazer") data.status = "andamento";
  if(data.status==="concluida" && !data.concluidoEm) data.concluidoEm = TODAY;
  if(data.status!=="concluida") data.concluidoEm = null;
  const mod = modeloById(data.modeloId);
  data.modeloNome = mod ? mod.nome : "";
  if(!mod) data.modeloId = "";
  data.checklist = ckMap(ck);
  delete data.ck;
  if(!data.criadoEm) data.criadoEm = TODAY;
  data.atualizadoEm = new Date().toISOString();
  S.modal = {...m, saving:true}; renderModal();
  try{
    await write("demandas", data.id, clean(data));
    S.modal = null; render(); toast(m.isNew ? (ck.length ? `Demanda registrada com ${ck.length} etapas no checklist` : "Demanda registrada") : "Demanda atualizada");
  }catch(e){ if(S.modal) { S.modal.saving = false; renderModal(); } }
}
async function setStatus(id, status){
  const d = S.demandas.find(x => x.id===id); if(!d || d.status===status) return;
  const data = {...d, status, concluidoEm: status==="concluida" ? (d.concluidoEm||TODAY) : null, atualizadoEm:new Date().toISOString()};
  try{ await write("demandas", id, clean(data)); if(S.demo) render(); toast(status==="concluida" ? "Demanda concluída" : "Situação: "+STATUS[status]); }catch(e){ render(); }
}

function openDemanda(id, colab, modeloId){
  const d = id ? S.demandas.find(x => x.id===id) : null;
  if(id && !d) return;
  S.modal = {type:"demanda", isNew:!d, data: d ? {...d, ck: ckArr(d)} : {id:uid(), titulo:"", processo:"", link:"", responsavelId:colab||"", prioridade:"media", prazo:addDays(TODAY,7), status:"afazer", obs:"", inicio:TODAY, modeloId:"", modeloNome:"", ck:[]}};
  if(!d) S.modal.data.setorId=colabById(colab)?.setorId||(S.ctx?.setores_geridos[0])||(S.setores||[]).find(x=>x.ativo)?.id;
  if(!d && modeloId) applyModelo(modeloId);
  renderModal();
  setTimeout(()=>{ const el = $("#d-titulo"); if(el && !somenteLeitura()) el.focus(); },0);
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  if(e.target.closest("[data-stop]")) return;
  const el = e.target.closest("[data-action]"); if(!el) return;
  const a = el.dataset.action;
  if(a==="close-overlay"){ if(e.target===el){ S.modal=null; renderModal(); } return; }
  if(el.tagName==="SELECT") return;
  switch(a){
    case "tab": S.tab = el.dataset.tab; try{localStorage.setItem(`demandas:${S.ctx.usuario.id}:tab`,S.tab)}catch(_){} render(); break;
    case "new": if(S.ctx?.capacidades.gerir_demandas) openDemanda(null, el.dataset.colab); break;
    case "edit": openDemanda(el.dataset.id); break;
    case "close": S.modal = null; renderModal(); break;
    case "save": saveDemanda(); break;
    case "delete": S.modal.confirmDelete = true; renderModal(); break;
    case "delete-no": S.modal.confirmDelete = false; renderModal(); break;
    case "meta-new": if(!somenteLeitura()) openMeta(null); break;
    case "proc-start": if(!somenteLeitura()) openDemanda(null, "", el.dataset.modelo); break;
    case "modelo-new": if(!somenteLeitura()) openModelo(null); break;
    case "modelo-edit": openModelo(el.dataset.id); break;
    case "modelo-save": saveModelo(); break;
    case "modelo-del-yes": { const id = S.modal.data.id; try{ await write("modelos", id, null); S.modal=null; render(); toast("Modelo excluído"); }catch(_){} break; }
    case "mt-add": harvestModelo(); S.modal.data.etapas = [...(S.modal.data.etapas||[]), {texto:"", prazoDias:""}]; renderModal(); setTimeout(()=>{ if(S.modal && S.modal.type==="modelo") $("#mt-"+(S.modal.data.etapas.length-1)+"-texto")?.focus(); },0); break;
    case "mt-del": harvestModelo(); S.modal.data.etapas.splice(+el.dataset.i, 1); renderModal(); break;
    case "mt-up": case "mt-down": { harvestModelo(); const et = S.modal.data.etapas, i = +el.dataset.i, j = a==="mt-up" ? i-1 : i+1; if(j>=0 && j<et.length){ [et[i], et[j]] = [et[j], et[i]]; } renderModal(); break; }
    case "ck-add": harvestDemanda(); S.modal.data.ck = [...(S.modal.data.ck||[]), {id:uid(), texto:"", prazo:"", feito:false, feitoEm:null}]; renderModal(); setTimeout(()=>{ if(S.modal && S.modal.type==="demanda") $("#ck-"+(S.modal.data.ck.length-1)+"-texto")?.focus(); },0); break;
    case "ck-del": harvestDemanda(); S.modal.data.ck.splice(+el.dataset.i, 1); renderModal(); break;
    case "meta-edit": openMeta(el.dataset.id); break;
    case "meta-save": saveMeta(); break;
    case "etapa-add": harvestMeta(); S.modal.data.etapas = [...metaEtapas(S.modal.data), {etapa:"", responsavel:"", areas:"", custo:"", meses:{}, prazo:"", prazoTexto:"", status:"pendente", obs:""}]; renderModal(); setTimeout(()=>{ if(!S.modal || S.modal.type!=="meta") return; const n = metaEtapas(S.modal.data).length-1; $("#e-"+n+"-etapa")?.focus(); },0); break;
    case "etapa-del": harvestMeta(); S.modal.data.etapas.splice(+el.dataset.i, 1); renderModal(); break;
    case "setor-pick": S.fm.setor = S.fm.setor===el.dataset.setor ? "" : el.dataset.setor; renderView(); break;
    case "meta-del-yes": { const id = S.modal.data.id; try{ await write("metas", id, null); S.modal=null; render(); toast("Meta excluída"); }catch(_){} break; }
    case "delete-yes": { const id = S.modal.data.id; try{ await write("demandas", id, null); S.modal=null; render(); toast("Demanda excluída"); }catch(_){} break; }
    case "colabs": S.modal={type:"colabs"}; renderModal(); break;
    case "colab-del": {
      const open = S.demandas.filter(d => d.responsavelId===el.dataset.id && isOpen(d)).length;
      const metasAbertas = S.metas.filter(m => m.responsavelId===el.dataset.id && metaInfo(m).sit!=="concluida").length;
      if(open || metasAbertas){
        const partes = [open?`${open} ${open===1?"demanda aberta":"demandas abertas"}`:"", metasAbertas?`${metasAbertas} ${metasAbertas===1?"meta em aberto":"metas em aberto"}`:""].filter(Boolean).join(" e ");
        S.modal.error = `Reatribua ${partes} de ${colabName(el.dataset.id)} antes de removê-lo(a).`; S.modal.confirm=null;
      }
      else { S.modal.error = null; S.modal.confirm = el.dataset.id; }
      renderModal(); break;
    }
    case "colab-del-no": S.modal.confirm = null; renderModal(); break;
    case "colab-del-yes": { try{ await write("colaboradores", el.dataset.id, null); if(S.modal) S.modal.confirm=null; render(); toast("Colaborador removido"); }catch(_){} break; }
    case "see-done": S.tab = "concluidas"; S.fc = {colab: el.dataset.colab, mes:"", q:""}; try{localStorage.setItem(`demandas:${S.ctx.usuario.id}:tab`,S.tab)}catch(_){} render(); window.scrollTo({top:0}); break;
    case "sort": { const k = el.dataset.key; S.sort = {key:k, dir: S.sort.key===k ? -S.sort.dir : 1}; renderView(); break; }
    case "clear-examples": {
      el.disabled = true;
      const ds = S.demandas.filter(d=>d.exemplo), cs = S.colabs.filter(c=>c.exemplo), ms = S.metas.filter(m=>m.exemplo), os = S.modelos.filter(m=>m.exemplo);
      try{
        for(const d of ds) await write("demandas", d.id, null);
        for(const o of os) await write("modelos", o.id, null);
        for(const m of ms) await write("metas", m.id, null);
        for(const c of cs){ if(!S.demandas.some(d => d.responsavelId===c.id && !d.exemplo) && !S.metas.some(m => m.responsavelId===c.id && !m.exemplo)) await write("colaboradores", c.id, null); }
        render(); toast("Exemplos removidos");
      }catch(_){ el.disabled = false; }
      break;
    }
  }
});
document.addEventListener("toggle", e => {
  const d = e.target; if(!d.matches || !d.matches("details[data-key]")) return;
  if(d.dataset.key.startsWith("ck:")){ if(d.open) S.shut.delete(d.dataset.key); else S.shut.add(d.dataset.key); return; }
  if(d.open) S.open.add(d.dataset.key); else S.open.delete(d.dataset.key);
}, true);
document.addEventListener("keydown", e => {
  if(e.key==="Escape" && S.modal){ S.modal=null; renderModal(); }
  if((e.key==="Enter"||e.key===" ") && e.target.matches("li[data-action='edit']")){ e.preventDefault(); openDemanda(e.target.dataset.id); }
});
document.addEventListener("change", e => {
  const t = e.target;
  if(t.matches("select[data-action='status']")) return setStatus(t.dataset.id, t.value);
  if(t.matches("input[data-ck]")) return toggleItem(t.dataset.id, t.dataset.ck, t.checked);
  if(t.id==="d-modelo"){
    const prev = S.modal.data.modeloId || ""; harvestDemanda(); const d = S.modal.data;
    if(d.ck.some(x => x.feito)){ d.modeloId = prev; S.modal.ckMsg = "Este checklist já tem etapas concluídas. Desmarque-as para trocar o tipo de processo."; renderModal(); return; }
    S.modal.ckMsg = null;
    if(!t.value){ d.modeloNome = ""; renderModal(); return; }
    applyModelo(t.value); renderModal(); return;
  }
  if(t.id==="d-inicio"){
    const old = S.modal.data.inicio || TODAY; harvestDemanda(); const d = S.modal.data;
    if(d.inicio && d.inicio!==old){ const delta = daysBetween(old, d.inicio); d.ck = d.ck.map(x => x.prazo && !x.feito ? {...x, prazo:addDays(x.prazo, delta)} : x); if(d.prazo && d.modeloId) d.prazo = addDays(d.prazo, delta); renderModal(); }
    return;
  }
  if(t.id==="fp-modelo"){ S.fp.modelo = t.value; renderView(); }
  if(t.id==="fp-colab"){ S.fp.colab = t.value; renderView(); }
  if(t.id==="fp-sit"){ S.fp.sit = t.value; renderView(); }
  if(t.id==="f-colab"){ S.f.colab = t.value; renderView(); }
  if(t.id==="f-status"){ S.f.status = t.value; renderView(); }
  if(t.id==="f-prio"){ S.f.prio = t.value; renderView(); }
  if(t.id==="fc-colab"){ S.fc.colab = t.value; renderView(); }
  if(t.id==="fc-mes"){ S.fc.mes = t.value; renderView(); }
  if(t.id==="fm-setor"){ S.fm.setor = t.value; renderView(); }
  if(t.matches("select[data-action='etapa-status']")) return setEtapaStatus(t.dataset.id, +t.dataset.i, t.value);
  if(t.id==="fm-sit"){ S.fm.sit = t.value; renderView(); }
});
document.addEventListener("input", e => {
  const t = e.target;
  if(t.id==="f-q" || t.id==="fc-q" || t.id==="fm-q" || t.id==="fp-q"){
    if(t.id==="f-q") S.f.q = t.value; else if(t.id==="fc-q") S.fc.q = t.value; else if(t.id==="fp-q") S.fp.q = t.value; else S.fm.q = t.value;
    const pos = t.selectionStart; renderView();
    const n = $("#"+t.id); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(_){} }
  }
});
document.addEventListener("focusout", e => {
  if(e.target.id==="d-processo" || e.target.id==="m-processo") e.target.value = formatSEI(e.target.value);
});
document.addEventListener("submit", async e => {
  e.preventDefault();
  if(e.target.id==="form-demanda") return saveDemanda();
  if(e.target.id==="form-meta") return saveMeta();
  if(e.target.id==="form-modelo") return saveModelo();
  if(e.target.id==="form-colab"){
    const nome = $("#c-nome").value.trim(), funcao = $("#c-funcao").value.trim();
    if(!nome){ S.modal.error = "Informe o nome do colaborador."; renderModal(); $("#c-nome")?.focus(); return; }
    if(S.colabs.some(c => c.nome.toLowerCase()===nome.toLowerCase())){ S.modal = {...S.modal, error:`${nome} já está cadastrado(a).`, nome, funcao}; renderModal(); return; }
    try{
      await write("colaboradores", uid(), {nome, funcao, criadoEm:TODAY});
      S.modal = {type:"colabs", nome:"", funcao:""}; render(); toast(nome+" adicionado(a)");
      setTimeout(()=>$("#c-nome")?.focus(),0);
    }catch(_){}
  }
});

let toastTimer;
function toast(msg){
  const r = $("#toast-root"); r.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>{ r.innerHTML=""; }, 2600);
}

/* ---------- demo data (only when the shared store is unavailable) ---------- */
// A base nasce vazia; somente dados autenticados do servidor.
const podeSetor = id => !!S.ctx && (S.ctx.perfil==='admin'||S.ctx.setores_geridos.includes(Number(id)));
function somenteLeitura(){
  if(!S.ctx) return true;
  if(S.modal?.type==='colabs') return true;
  if(['meta','modelo'].includes(S.modal?.type)) return S.ctx.perfil!=='admin';
  if(S.modal?.type==='demanda' && !S.modal.isNew) return !podeSetor(S.modal.data.setorId);
  if(!S.modal && S.tab==='metas') return S.ctx.perfil!=='admin';
  return !S.ctx.capacidades.gerir_demandas;
}
function colecao(col){return col==='demandas'?S.demandas:col==='metas'?S.metas:S.modelos;}
async function persistir(col,id,dados,parcial){
  if(!['demandas','metas','modelos'].includes(col)) throw new Error('Cadastro compartilhado: use a Administração.');
  const atual=colecao(col).find(x=>x.id===id);
  const modal=S.modal?.data?.id===id?S.modal:null;
  const versao=modal?(modal.isNew?0:modal.data.versao):(atual?.versao||0);
  try {
    const url=`/api/demandas/${col}/${encodeURIComponent(id)}`;
    const salvo=dados===null?await req('DELETE',url+'?versao='+versao):await req(parcial?'PATCH':'PUT',url,{versao,dados});
    const arr=colecao(col),i=arr.findIndex(x=>x.id===id);
    if(dados===null){if(i>=0)arr.splice(i,1);}else if(i>=0)arr[i]=salvo;else arr.push(salvo);
    render();return salvo;
  }catch(e){
    if(e.code==='conflict' && modal){modal.conflict=true;renderModal();}
    toast(e.mensagem||e.message||'Não foi possível salvar.');throw e;
  }
}
let fonte;
async function carregar(){
  const novo=await req('GET','/api/demandas/estado');
  const mudou=S.ctx && (S.ctx.usuario.id!==novo.contexto.usuario.id || S.ctx.perfil!==novo.contexto.perfil || S.ctx.funcionario_id!==novo.contexto.funcionario_id || JSON.stringify(S.ctx.setores_geridos)!==JSON.stringify(novo.contexto.setores_geridos));
  S.ctx=novo.contexto;S.setores=novo.setores;aplicarContexto(S.ctx);
  S.colabs=novo.colaboradores;S.demandas=novo.demandas;S.metas=novo.metas;S.modelos=novo.modelos;
  if(S.modal?.data && !S.modal.isNew){
    const col={demanda:'demandas',meta:'metas',modelo:'modelos'}[S.modal.type];
    const atual=col&&colecao(col).find(x=>x.id===S.modal.data.id);
    if(col && (!atual||mudou)) {S.modal=null;toast('Seu acesso ou o registro mudou. A tela foi atualizada.');}
    else if(atual&&atual.versao!==S.modal.data.versao){toast('Este registro mudou. Seu formulário foi preservado.');}
  }else if(mudou)S.modal=null;
  S.loading=false;render();
}
render();
(async()=>{
  try{
    const u=await iniciarSessao(()=>{fonte?.close();S.demandas=[];S.metas=[];S.colabs=[];S.modelos=[];S.modal=null;$('#view').replaceChildren();$('#modal-root').replaceChildren();});
    $('#userbar').innerHTML=`<span>${esc(u.nome)}</span><a class="btn" href="/">Quadro de Pessoal</a>${u.papel==='admin'?'<a class="btn" href="/administracao">Administração</a>':''}<button class="btn" id="sair">Sair</button>`;
    $('#sair').addEventListener('click',async()=>{await req('POST','/api/auth/logout');fonte?.close();encerrarTela('saiu',true);});
    await carregar();
    try{S.tab=localStorage.getItem(`demandas:${u.id}:tab`)||'colab';}catch{}render();
    fonte=abrirEventos(S.ctx.revisao_acesso,carregar);
  }catch(e){if(e.code!=='revoked'){$('#view').textContent=e.mensagem||'Não foi possível carregar. Recarregue a página.';}}
})();
})();
