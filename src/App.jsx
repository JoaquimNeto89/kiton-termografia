import { useState, useEffect, useRef, createContext, useContext } from "react";
import { LOGO_B64 } from "./logo.js";
import * as Drive from "./drive.js";
// ─── Critérios técnicos de ΔT por tipo de equipamento ──────────────────────────
// Origem normativa ainda não auditada/confirmada — não atribuir a uma NBR específica
// até a matriz ser validada. Ver "Critérios de Aceitação" no relatório (texto neutro).
const NBR = {
  "Painel Elétrico":        { alerta: 10, critico: 20, ref: "Fase adjacente em mesma carga" },
  "Quadro de Distribuição": { alerta: 10, critico: 20, ref: "Fase adjacente em mesma carga" },
  "Disjuntor":              { alerta: 10, critico: 20, ref: "Disjuntor similar no mesmo QD" },
  "Contatora":              { alerta: 10, critico: 20, ref: "Contatora similar em operação" },
  "Barramento":             { alerta: 5,  critico: 15, ref: "Seção adjacente do barramento" },
  "Cabo/Conexão":           { alerta: 5,  critico: 15, ref: "Cabo/conexão similar na mesma fase" },
  "Motor Elétrico":         { alerta: 15, critico: 30, ref: "Motor similar em mesma carga" },
  "Transformador":          { alerta: 15, critico: 30, ref: "Fase/enrolamento adjacente" },
  "Subestação":             { alerta: 15, critico: 25, ref: "Elemento similar em carga equivalente" },
  "Outro":                  { alerta: 10, critico: 20, ref: "Elemento similar em mesma condição" },
};
const TIPOS = Object.keys(NBR);

// ─── Tema (claro/escuro) ────────────────────────────────────────────────────
const ThemeContext = createContext(null);

const DARK_THEME = {
  mode: "dark",
  bg: "#0b0e17", panel: "#0f1422", panelDeep: "#080b13", panelInfo: "#0a1628",
  input: "#111827", border: "#1f2937", borderMuted: "#374151", borderInfo: "#1e3a5f",
  badgeBlueBg: "#1e3a5f", amberBadgeBg: "#78350f", greenBadgeBg: "#14532d",
  text: "#e2e8f0", textBright: "#f1f5f9", textMuted: "#6b7280", textDim: "#94a3b8", textFaint: "#4b5563",
  accent: "#CD0000", white: "#fff", gray9ca: "#9ca3af", slate: "#64748b",
  green: "#22c55e", greenStrong: "#16a34a", greenBright: "#4ade80",
  red: "#ef4444", redDeep: "#dc2626", redSoftBg: "#2d1515", redSoftBorder: "#7f1d1d", redSoftText: "#f87171", redDeepBg: "#1c0a0a",
  amber: "#f59e0b", amberBright: "#fbbf24",
  blue: "#60a5fa", blueBorder: "#3b82f6", blueStrong: "#2563eb",
  violet: "#a78bfa", violetBorder: "#7c3aed", indigo: "#818cf8", indigoBorder: "#6366f1", cyan: "#22d3ee", cyanBorder: "#0891b2",
  // Escala de severidade de 5 níveis (CFCA: Normal → Suspeita de Falha → Falha Provável → Falha Certa → Falha Iminente).
  // Cores validadas para contraste (WCAG) contra o fundo do badge e da página nos dois temas — ver nota de implementação.
  sev: {
    normal:   { label: "Normal",            color: "#22c55e", bg: "#052e16", border: "#14532d", icon: "🟢" },
    suspeita: { label: "Suspeita de Falha",  color: "#f59e0b", bg: "#2d1f00", border: "#78350f", icon: "🟡" },
    provavel: { label: "Falha Provável",     color: "#fb923c", bg: "#431407", border: "#9a3412", icon: "🟠" },
    certa:    { label: "Falha Certa",        color: "#ef4444", bg: "#3b0a0a", border: "#7f1d1d", icon: "🔴" },
    iminente: { label: "Falha Iminente",     color: "#e879f9", bg: "#4a044e", border: "#86198f", icon: "🟣" },
  },
};

const LIGHT_THEME = {
  mode: "light",
  bg: "#ffffff", panel: "#f8fafc", panelDeep: "#f1f5f9", panelInfo: "#eff6ff",
  input: "#ffffff", border: "#e2e8f0", borderMuted: "#cbd5e1", borderInfo: "#bfdbfe",
  badgeBlueBg: "#dbeafe", amberBadgeBg: "#fef3c7", greenBadgeBg: "#dcfce7",
  text: "#1f2937", textBright: "#111827", textMuted: "#6b7280", textDim: "#475569", textFaint: "#9ca3af",
  accent: "#CD0000", white: "#fff", gray9ca: "#6b7280", slate: "#64748b",
  green: "#16a34a", greenStrong: "#16a34a", greenBright: "#16a34a",
  red: "#dc2626", redDeep: "#b91c1c", redSoftBg: "#fef2f2", redSoftBorder: "#fecaca", redSoftText: "#dc2626", redDeepBg: "#fef2f2",
  amber: "#b45309", amberBright: "#b45309",
  blue: "#2563eb", blueBorder: "#2563eb", blueStrong: "#2563eb",
  violet: "#7c3aed", violetBorder: "#7c3aed", indigo: "#4f46e5", indigoBorder: "#4f46e5", cyan: "#0e7490", cyanBorder: "#0e7490",
  sev: {
    normal:   { label: "Normal",            color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "🟢" },
    suspeita: { label: "Suspeita de Falha",  color: "#b45309", bg: "#fffbeb", border: "#fde68a", icon: "🟡" },
    provavel: { label: "Falha Provável",     color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", icon: "🟠" },
    certa:    { label: "Falha Certa",        color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "🔴" },
    iminente: { label: "Falha Iminente",     color: "#a21caf", bg: "#fdf4ff", border: "#f0abfc", icon: "🟣" },
  },
};

// ─── CFCA (Critério de Classificação de Componentes Aquecidos) ─────────────
// Razão AC/MAA, onde MAA = MTA - Ta. As 5 faixas mapeiam 1:1 para os 5 níveis de severidade do app.
const CFCA_NIVEIS = [
  { max: 0.3,  nivel: "Normal",             severidade: "normal",   prazo: "Rotina" },
  { max: 0.6,  nivel: "Suspeita de Falha",  severidade: "suspeita", prazo: "Observação / nova medição em curto prazo" },
  { max: 0.9,  nivel: "Falha Provável",     severidade: "provavel", prazo: "Intervenção programada" },
  { max: 1.2,  nivel: "Falha Certa",        severidade: "certa",    prazo: "Intervenção imediata" },
  { max: Infinity, nivel: "Falha Iminente", severidade: "iminente", prazo: "Crítico — ação imediata" },
];
const classificaCFCA = razao => CFCA_NIVEIS.find(f => razao < f.max) || CFCA_NIVEIS[CFCA_NIVEIS.length-1];

// Calcula severidade + metadados a partir do ponto e do critério cadastrado (já resolvido, não pelo nome).
// Retorna {severidade, severidadeAuto, cfca} — nunca sobrescreve se o técnico marcou manual (severidadeAuto:false já setado por quem chama).
function calcSeveridade(ponto, criterio) {
  const tMax = parseFloat(ponto.tempMax), tAmb = parseFloat(ponto.tempAmb);
  if (!criterio) {
    return { severidade: ponto.severidade || "normal", severidadeAuto: false, cfca: null };
  }
  if (criterio.metodo === "maa") {
    const mta = parseFloat(criterio.mta);
    if (isNaN(tMax) || isNaN(tAmb) || isNaN(mta)) {
      return { severidade: ponto.severidade || "normal", severidadeAuto: false, cfca: null };
    }
    const maa = mta - tAmb;
    if (maa <= 0) return { severidade: ponto.severidade || "normal", severidadeAuto: false, cfca: null };
    const ac = tMax - tAmb;
    const razao = ac / maa;
    const c = classificaCFCA(razao);
    return {
      severidade: c.severidade, severidadeAuto: true,
      cfca: { razao: razao.toFixed(2), ac: ac.toFixed(1), maa: maa.toFixed(1), mta, nivel: c.nivel, prazo: c.prazo },
    };
  }
  if (criterio.metodo === "comparativo") {
    const alerta = parseFloat(criterio.toleranciaAlerta), critico = parseFloat(criterio.toleranciaCritico);
    const dt = parseFloat(ponto.deltaT);
    if (isNaN(dt) || isNaN(alerta) || isNaN(critico)) {
      return { severidade: ponto.severidade || "normal", severidadeAuto: false, cfca: null };
    }
    // Comparativo só tem 2 limiares definidos pelo técnico (alerta/crítico), então resolve
    // naturalmente em 3 das 5 posições (normal/suspeita/certa). "Provável" e "iminente" ficam
    // reservados ao método MAA/CFCA, que calcula a razão proporcional — ou a um ajuste manual.
    const severidade = dt >= critico ? "certa" : dt >= alerta ? "suspeita" : "normal";
    return { severidade, severidadeAuto: true, cfca: null };
  }
  // "qualitativo": técnico sempre classifica manualmente
  return { severidade: ponto.severidade || "normal", severidadeAuto: false, cfca: null };
}
const calcMedia = (mx,mn)   => { const a=parseFloat(mx),b=parseFloat(mn); return isNaN(a)||isNaN(b)?"":((a+b)/2).toFixed(1); };
const calcDelta = (mx,rf)   => { const a=parseFloat(mx),b=parseFloat(rf); return isNaN(a)||isNaN(b)?"":(a-b).toFixed(1); };
// Fator de carga (%) = maior corrente de fase medida / corrente nominal. Retorna null (não calculável)
// quando faltar a nominal ou nenhuma fase estiver preenchida — nesses casos o campo fica manual.
const calcFatorCarga = p => {
  const nom = parseFloat(p.corrNom);
  if (isNaN(nom) || nom<=0) return null;
  const fases = [p.corrR,p.corrS,p.corrT].map(v=>parseFloat(v)).filter(v=>!isNaN(v));
  if (fases.length===0) return null;
  return ((Math.max(...fases)/nom)*100).toFixed(1);
};
const fmtDate   = d         => d ? new Date(d+"T12:00").toLocaleDateString("pt-BR") : "—";
const fmtRelTime = ts => {
  if (!ts) return null;
  const min = Math.floor(Math.max(0, Date.now() - ts) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
};

const newPonto = () => ({
  id: Date.now()+Math.random(),
  dataMedicao: "", horaMedicao: "",
  tag: "", equipamento: "", tipoEquip: "", localizacao: "", codigoArea: "",
  periodicidade: "",
  tipoInstalacao: "", statusOperacao: "",
  emissividade: "0.95", transmissao: "1.00",
  tempAmb: "", umidade: "", condicaoAmb: "",
  tempMax: "", tempMin: "", tempMedia: "", tempRef: "", deltaT: "",
  fatorCarga: "", fatorCargaAuto: false,
  corrR: "", corrS: "", corrT: "", corrNom: "",
  severidade: "normal",
  severidadeAuto: false, cfca: null, criterioSnapshot: null,
  defeito: "", recomendacao: "", acaoExecutada: "",
  observacoes: "",
  fotoTermicaPreview: null, fotoRealPreview: null,
});

const SK = "kiton_termo_v4";
const INITIAL = {
  relatorios: [],
  cadastros: {
    clientes: [],    // {id, nome, responsavel}
    instrumentos: [], // {id, tipo, fabricante, modelo, serie, tag, calibracao}
    tecnicos: [],    // {id, nome, crea}
    criterios: [],   // {id, nome, grupo, metodo:"maa"|"comparativo"|"qualitativo", ...}
  }
};
// Migração/semente: transforma os 10 tipos fixos antigos (objeto NBR) em critérios método "comparativo",
// preservando exatamente os valores atuais (nenhum número novo é inventado aqui).
const seedCriteriosFromNBR = () => Object.entries(NBR).map(([tipo,c]) => ({
  id: "seed-"+tipo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-"),
  nome: tipo, grupo: tipo, metodo: "comparativo",
  oQueComparado: c.ref, condicoes: "",
  mta: "", toleranciaAlerta: c.alerta, toleranciaCritico: c.critico,
  documentacaoNecessaria: "",
  fonteNormativa: "", statusFonte: "interno", ativo: true,
}));
// Migração da severidade de 3 para 5 níveis: dados salvos antes desta versão só conheciam
// "critico"/"alerta"/"normal". Mapeia para os novos nomes (mesma cor/posição, sem perda de sentido);
// "provavel" e "iminente" só passam a existir organicamente em novas medições pelo método MAA/CFCA.
const migraSeveridade5Niveis = relatorios => (relatorios||[]).map(r => ({
  ...r,
  pontos: (r.pontos||[]).map(p => {
    if (p.severidade === "critico") return { ...p, severidade: "certa" };
    if (p.severidade === "alerta")  return { ...p, severidade: "suspeita" };
    return p;
  }),
}));
// Normaliza qualquer objeto de dados (localStorage, backup importado, ou payload vindo do Drive) para
// o formato atual: garante os 4 cadastros, semeia critérios se ausentes, migra severidade para 5 níveis.
// Usar em TODO ponto de entrada de dados (load, restaurar backup, trazer da nuvem) — não só no load() local.
const normalizeData = d => {
  if (!d) d = {...INITIAL};
  if (!d.cadastros) d.cadastros = {...INITIAL.cadastros};
  if (!d.cadastros.clientes) d.cadastros.clientes = [];
  if (!d.cadastros.instrumentos) d.cadastros.instrumentos = [];
  if (!d.cadastros.tecnicos) d.cadastros.tecnicos  = [];
  if (!d.cadastros.criterios) d.cadastros.criterios = seedCriteriosFromNBR();
  if (!d.relatorios) d.relatorios = [];
  d.relatorios = migraSeveridade5Niveis(d.relatorios);
  return d;
};
const load = () => {
  try {
    const r = localStorage.getItem(SK);
    if (!r) { const d = {...INITIAL}; d.cadastros = {...INITIAL.cadastros, criterios: seedCriteriosFromNBR()}; return d; }
    return normalizeData(JSON.parse(r));
  } catch { const d={...INITIAL}; d.cadastros={...INITIAL.cadastros, criterios:seedCriteriosFromNBR()}; return d; }
};
const save = d => { try { localStorage.setItem(SK,JSON.stringify(d)); } catch {} };

// Metadados da sincronização com o Drive (ID do arquivo remoto + última versão conhecida)
const WHATSAPP_NUMBER = "5544997311914";
const WHATSAPP_MENSAGEM = "Eng. Joaquim Neto, estou com uma dúvida no sistema de Relatórios de Termografia da Kiton Engenharia Integrada.";

const DK = "kiton_termo_drive_meta_v1";
const loadDriveMeta = () => { try { return JSON.parse(localStorage.getItem(DK)) || {}; } catch { return {}; } };
const saveDriveMeta = m => { try { localStorage.setItem(DK,JSON.stringify(m)); } catch {} };

// Gerar número de relatório sequencial RTK-XXX/AA
function gerarNumRelatorio(relatorios) {
  const ano = new Date().getFullYear().toString().slice(-2);
  const prefix = `RTK-`;
  const sufixo = `/${ano}`;
  const nums = relatorios
    .map(r => r.numRelatorio)
    .filter(n => n && n.startsWith(prefix) && n.endsWith(sufixo))
    .map(n => parseInt(n.replace(prefix,'').replace(sufixo,'')) || 0);
  const ultimo = (nums && nums.length > 0) ? Math.max(...nums) : 77; // começa em 078
  return `${prefix}${String(ultimo+1).padStart(3,'0')}${sufixo}`;
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [view,setView]     = useState("dash");
  const [data,setData]     = useState(load);
  const [editRel,setEditRel]       = useState(null);
  const [comparCli,setComparCli]   = useState(null);
  const [toast,setToast]   = useState(null);
  const [cadTab,setCadTab] = useState("clientes");
  const backupInputRef = useRef(null);
  const [driveSyncing,setDriveSyncing] = useState(false);
  const [driveMeta,setDriveMeta] = useState(loadDriveMeta);
  const [nowTick,setNowTick] = useState(Date.now());
  const [showFirstSyncModal,setShowFirstSyncModal] = useState(false);
  const dirtyRef = useRef(false); // true = há mudança local ainda não enviada ao Drive
  const [theme,setTheme] = useState(()=>{ try{ return localStorage.getItem("kiton_termo_theme")||"dark"; }catch{ return "dark"; } });
  useEffect(()=>{ try{ localStorage.setItem("kiton_termo_theme",theme); }catch{} },[theme]);
  const T = theme==="light" ? LIGHT_THEME : DARK_THEME;

  useEffect(()=>{ save(data); },[data]);
  useEffect(()=>{ const t=setInterval(()=>setNowTick(Date.now()),30000); return ()=>clearInterval(t); },[]);

  const showToast = (msg,t="ok") => { setToast({msg,t}); setTimeout(()=>setToast(null),3000); };

  const handleSave = rel => {
    dirtyRef.current = true;
    setData(prev => {
      const exists = prev.relatorios.find(r=>r.id===rel.id);
      const relatorios = exists ? prev.relatorios.map(r=>r.id===rel.id?rel:r) : [...prev.relatorios,rel];
      return {...prev, relatorios};
    });
    showToast("Relatório salvo!");
    setView("dash"); setEditRel(null);
  };

  // Clona um relatório existente (ex.: rotina mensal com os mesmos equipamentos/cliente): mantém só o que
  // é parâmetro fixo do equipamento/instalação (TAG, tipo, localização, periodicidade, tipo de instalação,
  // emissividade/transmissão, corrente NOMINAL de placa) e limpa tudo que é específico da visita: data/hora
  // de cada medição, nº da OS, nº da ART, dados coletados em campo (T.Máx/Mín/Referência), condições
  // ambientais (temperatura, umidade, condição do dia), correntes de fase MEDIDAS, fator de carga, defeito,
  // recomendação, ação executada, observações e fotos. NÃO salva direto — abre no formulário como um
  // rascunho novo, para revisão antes de gravar.
  const handleClone = rel => {
    const clonarPonto = p => ({
      ...p,
      id: Date.now()+Math.random(),
      dataMedicao: "", horaMedicao: "",
      tempAmb: "", umidade: "", condicaoAmb: "",
      corrR: "", corrS: "", corrT: "",
      fatorCarga: "", fatorCargaAuto: false,
      tempMax: "", tempMin: "", tempRef: "", tempMedia: "", deltaT: "",
      severidade: "normal", severidadeAuto: false, cfca: null, criterioSnapshot: null,
      defeito: "", recomendacao: "", acaoExecutada: "", observacoes: "",
      fotoTermicaPreview: null, fotoRealPreview: null,
    });
    const clone = {
      ...rel,
      id: Date.now(),
      numRelatorio: "",
      os: "", numArt: "",
      status: "Rascunho",
      dataRelatorio: new Date().toISOString().slice(0,10),
      pontos: (rel.pontos||[]).map(clonarPonto),
    };
    setEditRel(clone);
    setView("form");
    showToast("Relatório clonado — preencha data, OS/ART e os dados desta nova medição.");
  };

  const handleSaveCadastro = (tipo, item) => {
    dirtyRef.current = true;
    setData(prev => {
      const cads = prev.cadastros || {...INITIAL.cadastros};
      const lista = cads[tipo] || [];
      const exists = lista.find(x=>x.id===item.id);
      const nova = exists ? lista.map(x=>x.id===item.id?item:x) : [...lista,item];
      return {...prev, cadastros:{...cads,[tipo]:nova}};
    });
    showToast("Cadastro salvo!");
  };

  const handleDeleteCadastro = (tipo, id) => {
    if (!confirm("Remover cadastro?")) return;
    dirtyRef.current = true;
    setData(prev => {
      const cads = prev.cadastros || {...INITIAL.cadastros};
      return {...prev, cadastros:{...cads,[tipo]:(cads[tipo]||[]).filter(x=>x.id!==id)}};
    });
    showToast("Removido.","info");
  };

  const handleDelete = id => {
    if (!confirm("Remover permanentemente?")) return;
    dirtyRef.current = true;
    setData(prev=>({...prev,relatorios:prev.relatorios.filter(r=>r.id!==id)}));
    showToast("Removido.","info");
  };

  const handleExportBackup = () => {
    const payload = { app:"kiton-termografia", schemaKey:SK, exportadoEm:new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const hoje = new Date();
    const dd = String(hoje.getDate()).padStart(2,"0");
    const mm = String(hoje.getMonth()+1).padStart(2,"0");
    const hh = String(hoje.getHours()).padStart(2,"0");
    const min = String(hoje.getMinutes()).padStart(2,"0");
    a.href = url;
    a.download = `kiton-termografia-backup_${dd}-${mm}-${hoje.getFullYear()}_${hh}h${min}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Backup exportado (${data.relatorios.length} relatórios, ${data.cadastros.clientes.length} clientes)!`);
  };

  const handleImportBackup = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const incoming = parsed && parsed.data ? parsed.data : parsed;
        if (!incoming || !Array.isArray(incoming.relatorios) || !incoming.cadastros) {
          showToast("Arquivo inválido: não é um backup do sistema RTK.","erro");
          return;
        }
        const okConfirm = confirm(
          `Isso vai SUBSTITUIR todos os dados atuais neste dispositivo (${data.relatorios.length} relatórios) `+
          `pelos ${incoming.relatorios.length} relatórios do arquivo de backup. Essa ação não pode ser desfeita. Confirma?`
        );
        if (!okConfirm) return;
        dirtyRef.current = true;
        setData(normalizeData(incoming));
        showToast(`Backup restaurado (${incoming.relatorios.length} relatórios)!`);
      } catch {
        showToast("Erro ao ler o arquivo de backup.","erro");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // silent:true = chamada automática (ao abrir o app ou depois de salvar), sem caixas de diálogo.
  // Nesse modo, qualquer decisão importante (primeira sync do dispositivo, conflito real) é pulada
  // e fica para o clique manual no botão Drive resolver, nunca decide sozinha o que pode perder dado.
  const syncDrive = async ({ silent = false } = {}) => {
    if (driveSyncing) return;
    let meta = loadDriveMeta();
    if (silent && !meta.fileId) return; // este dispositivo nunca conectou ao Drive, não faz nada sozinho

    setDriveSyncing(true);
    let ownerEmail = meta.ownerEmail || null; // e-mail da conta Google dona do arquivo na nuvem (só para exibir no rodapé)
    const marcarSincronizado = novoMeta => {
      const m = { ...meta, ...novoMeta, ownerEmail, lastSyncedAt: Date.now() };
      saveDriveMeta(m); setDriveMeta(m); meta = m;
      dirtyRef.current = false;
    };

    try {
      let fileId = meta.fileId;
      if (!fileId) {
        fileId = await Drive.findOrCreateFile();
        marcarSincronizado({ fileId });
      }

      const remoteInfo = await Drive.getFileMeta(fileId);
      ownerEmail = remoteInfo.owners?.[0]?.emailAddress || ownerEmail;
      const remoteModified = remoteInfo.modifiedTime;
      const isFirstSyncNesteDispositivo = !meta.lastRemoteModified;
      const remoteMudouDesdeUltimoSync = !isFirstSyncNesteDispositivo && remoteModified !== meta.lastRemoteModified;

      // Primeira sincronização deste dispositivo: decisão importante demais para ser automática.
      if (isFirstSyncNesteDispositivo) {
        if (silent) { setDriveSyncing(false); return; }
        const remoteData = await Drive.downloadFile(fileId);
        const remoteTemDados = remoteData && Array.isArray(remoteData.relatorios) && remoteData.relatorios.length > 0;
        const localTemDados = data.relatorios.length > 0;

        if (remoteTemDados && localTemDados) {
          const usarNuvem = confirm(
            `Primeira sincronização deste dispositivo.\n\n`+
            `Na nuvem: ${remoteData.relatorios.length} relatório(s).\n`+
            `Neste dispositivo: ${data.relatorios.length} relatório(s).\n\n`+
            `OK = trazer os dados da nuvem para este dispositivo (substitui os daqui).\n`+
            `Cancelar = enviar os dados deste dispositivo para a nuvem (substitui os de lá).`
          );
          if (usarNuvem) {
            setData(normalizeData(remoteData));
            marcarSincronizado({ lastRemoteModified: remoteModified });
            showToast(`Dados trazidos da nuvem (${remoteData.relatorios.length} relatórios)!`);
          } else {
            await Drive.uploadFile(fileId, data);
            const novo = await Drive.getFileMeta(fileId);
            ownerEmail = novo.owners?.[0]?.emailAddress || ownerEmail;
            marcarSincronizado({ lastRemoteModified: novo.modifiedTime });
            showToast("Dados deste dispositivo enviados para a nuvem!");
          }
          setDriveSyncing(false);
          return;
        }
        if (remoteTemDados && !localTemDados) {
          setData(normalizeData(remoteData));
          marcarSincronizado({ lastRemoteModified: remoteModified });
          showToast(`Dados trazidos da nuvem (${remoteData.relatorios.length} relatórios)!`);
          setDriveSyncing(false);
          return;
        }
        // nenhum dos dois tem dados, ou só o local tem: segue o fluxo normal abaixo (envia local)
      } else if (remoteMudouDesdeUltimoSync) {
        if (dirtyRef.current) {
          // conflito de verdade: os dois lados mudaram. No automático, só avisa e deixa para o clique manual.
          if (silent) {
            setDriveSyncing(false);
            showToast("A nuvem foi atualizada em outro dispositivo. Clique em Drive para revisar.", "info");
            return;
          }
          const usarNuvem = confirm(
            `A versão na nuvem foi atualizada (por outro dispositivo ou pessoa) desde a última sincronização deste aqui.\n\n`+
            `OK = trazer a versão da nuvem (substitui os dados deste dispositivo).\n`+
            `Cancelar = enviar a versão deste dispositivo mesmo assim (substitui a da nuvem).`
          );
          if (usarNuvem) {
            const remoteData = await Drive.downloadFile(fileId);
            setData(normalizeData(remoteData));
            marcarSincronizado({ lastRemoteModified: remoteModified });
            showToast(`Dados trazidos da nuvem (${remoteData.relatorios.length} relatórios)!`);
            setDriveSyncing(false);
            return;
          }
        } else {
          // nuvem mudou, mas este dispositivo não tem edição própria pendente: seguro trazer sozinho.
          const remoteData = await Drive.downloadFile(fileId);
          setData(normalizeData(remoteData));
          marcarSincronizado({ lastRemoteModified: remoteModified });
          if (!silent) showToast(`Dados trazidos da nuvem (${remoteData.relatorios.length} relatórios)!`);
          setDriveSyncing(false);
          return;
        }
      }

      if (!dirtyRef.current && !isFirstSyncNesteDispositivo) {
        // nada mudou de nenhum lado, nada a enviar
        setDriveSyncing(false);
        return;
      }

      await Drive.uploadFile(fileId, data);
      const novo = await Drive.getFileMeta(fileId);
      ownerEmail = novo.owners?.[0]?.emailAddress || ownerEmail;
      marcarSincronizado({ lastRemoteModified: novo.modifiedTime });
      if (!silent) showToast(`Sincronizado com o Drive (${data.relatorios.length} relatórios)!`);
    } catch (err) {
      // 404/403 aqui quase sempre significa que a tela de login do Google (que reaparece a cada
      // recarregamento da página, se o navegador tiver mais de uma conta logada) foi respondida
      // com uma conta diferente da que este dispositivo já usa para salvar os dados. Esse caso avisa
      // mesmo em modo silencioso, porque senão fica parecendo que sincronizou e na verdade não fez nada.
      const contaProvavelmenteErrada = err.status === 404 || err.status === 403;
      if (contaProvavelmenteErrada) {
        alert(
          "Não sincronizou: a conta Google usada agora parece ser diferente da que este dispositivo já usa "+
          "para salvar os dados"+(meta.ownerEmail ? ` (${meta.ownerEmail})` : "")+".\n\n"+
          "Clique OK, recarregue a página e, na tela de login do Google, escolha "+
          (meta.ownerEmail ? `a conta ${meta.ownerEmail}` : "a mesma conta de sempre")+"."
        );
      } else if (!silent) {
        showToast("Erro ao sincronizar com o Drive: " + err.message, "erro");
      }
      // fora desse caso, falha no modo automático fica silenciosa (ex: precisa de login interativo) — não alarma à toa
    } finally {
      setDriveSyncing(false);
    }
  };

  // Troca manual de conta do Drive usada neste dispositivo (ex: migrar de uma conta para outra
  // dedicada). Força a tela de escolha de conta do Google, some com a referência ao arquivo antigo
  // salva aqui (sem apagar nenhum relatório/cadastro local) e refaz a sincronização já com a conta
  // nova. Se a troca for cancelada, nada muda: só mexe no estado salvo depois de confirmar o login.
  const handleTrocarContaDrive = async () => {
    if (driveSyncing) return;
    if (!confirm(
      "Trocar a conta do Google Drive usada neste dispositivo?\n\n"+
      "Nenhum relatório ou cadastro salvo aqui é apagado. Na próxima tela, escolha a conta Google "+
      "que este dispositivo deve usar a partir de agora."
    )) return;
    try {
      Drive.forgetAccount();
      await Drive.requestAccessToken({ forceAccountSelection: true });
      saveDriveMeta({}); setDriveMeta({}); dirtyRef.current = false;
      showToast("Conta trocada neste dispositivo. Confirme a sincronização a seguir.");
      await syncDrive({ silent:false });
    } catch (err) {
      showToast("Troca de conta cancelada ou falhou: " + err.message, "erro");
    }
  };

  // Sincronização automática: tenta buscar/enviar sozinho ao abrir o app e depois de qualquer
  // alteração local, sempre em modo silencioso (nunca decide um conflito real sozinho).
  // Dispositivo que nunca sincronizou aqui (sem fileId salvo) não tem como logar sozinho:
  // o navegador bloqueia popup de login do Google sem um clique do usuário. Nesse caso,
  // em vez de falhar em silêncio, mostra um aviso central pedindo a autorização.
  useEffect(() => {
    if (!loadDriveMeta().fileId) { setShowFirstSyncModal(true); return; }
    syncDrive({ silent:true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = setTimeout(() => syncDrive({ silent:true }), 1200);
    return () => clearTimeout(t);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  void nowTick; // força recálculo do texto de tempo relativo a cada 30s (ver useEffect acima)
  const driveRel = fmtRelTime(driveMeta.lastSyncedAt);
  const driveLabel = driveSyncing ? "Sincronizando…" : driveRel ? `Drive · ${driveRel}` : "Drive";
  const driveAgeMin = driveMeta.lastSyncedAt ? (Date.now() - driveMeta.lastSyncedAt) / 60000 : Infinity;
  const driveDotColor = !driveMeta.lastSyncedAt ? T.textFaint : driveAgeMin < 60 ? T.green : driveAgeMin < 24*60 ? T.amber : T.red;

  return (
    <ThemeContext.Provider value={T}>
    <div style={{fontFamily:"'Barlow',sans-serif",minHeight:"100vh",background:T.bg,color:T.text}}>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800&family=Rajdhani:wght@500;600;700&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap" rel="stylesheet"/>

      <header className="topheader" style={{background:T.panel,borderBottom:"2px solid "+T.accent,padding:"0 16px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div className="topheader-brand" style={{display:"flex",alignItems:"center",gap:8,minWidth:0,overflow:"hidden",flexShrink:1}}>
          <img src="data:image/png;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABOTEsAZFpSAWdbUgBnXFQCKyIcAz0wJgEAAAAAVUtCTkM3LtA1KR//MSQa/zEkGv0zJhz8MyYc/zMmHP81KB7/NSge/y0gFv8lFwz/LiEW/1dNRP+Zko3/0s/N//n5+f///////v7+///////+/v7//Pv7//z7+//9/f3//v7+//7+/v/+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//7+/v/+/v7//v39//z8/P/7+/v//Pz8//7+/v/+/v7//v7+///////z8vL/xcG+/4mCfP9KPjX/KRwR/yYYDv8wIxn/Nikf/zQnHf8zJhz/MyYc/zMmHPwwIxn+MCMZ/zwwJv9WS0PFh396PxgKAACRjIgBPzYuBKuloALEwLwAs66qAaGgnwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAk42GAFpQSAFXS0EAW1BHAi4jGwP///8AycbFCE1COXU8MCbuMyYc/zEkGf8yJRv8MyYc/zMmHP80Jx3/NSkf/y0gFv8lFwz/Nikf/3FoYf+8uLX/9PTz///////+/v7///////z8/P/8+/v//f39//7+/v/+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//7+/v/+/v7//f39//v7+//9/f3///////7+/v//////6uno/6umov9fVU3/LyEX/yUXDf8wIxn/Nikf/zQnHf8zJhz/MyYc/jIlG/wvIRf/NSge/0o/NuZ1bGZl////BAAAAAE8NC4DnZaQArSuqACoop0B5uTjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIiFgwByaWIBd21mAGlfVwI2KyMD////AKagnAxNQTmPPC8m/DEkGv8xJBr9MyYc/TMmHP8zJhz/Nikf/zEkGv8lGA3/MiUb/3FoYf/Hw8D/+/v6//7+/v///////f39//z7+//+/f3//v7+//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/+/v7//v7+//39/f/7+/v//v79//7+/v//////8/Py/7SvrP9dU0v/Kx4U/ycaD/80Jx3/NSge/zMmHP8zJhz/MyYc/DAiGP4yJRv/ST00+XRsZYD///8HAAAAAUhAOQS1r6sC6+nnAMK/vAHIx8YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB6elkAeHBqAayloQByaGABNy4mBP///wCqpKAKST41kTotJP4xIxn/MiUb/DMmHP4yJRv/NCcd/zUpH/8rHRP/JxoP/1dMRP+2sa3/+Pf3/////////////Pz8//z8/P/+/v7///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+//7+/v/8/Pv//f39//7+/v//////7ezr/5+ZlP9FOTD/JRcN/y8hF/82KR//MyYc/zMmHP8zJhz9MCMZ/TAiGP9GOjH6cWhggP///wYAAAABUUhCBO7r5wH///8AzMfFAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJCJhAAAAAAB////AUI2LgQAAAAB////BFFGPoQ7LiT9MSQa/zIlG/wzJhz+MiUb/zQnHv80Jx7/JxkO/zIlG/+De3X/4+Hg///////+/v7//Pz8//z8/P/+/v7//v7+//7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+//7+/v/8/Pv//f39//7+/v//////0M3K/2pgWf8qHRL/Kh0S/zUpH/80Jx3/MiUb/zMnHf4wIxn8MCIY/0k9NfmCe3V2////ASEWDQJqYVoEAAAAADUpIAHh4N8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABybGYAWlBHAUk9MwBPQzsDMyggAwAAAABUSUFdPC8m9DEkGv8yJRv8MyYc/jIlG/80KB7/NCcd/yUXDf8/Myn/pJ+a//j49////////v7+//z7+//+/v7//v7+//7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+//7+/v/7+/v//v7+///////s6+r/iIF7/zIlG/8oGhD/NSgf/zQnHf8yJRv/Mycd/jAjGfwxJBn/TkI67ZGKhU1mXVcAW1NOA4qCfAOVjYcArKejAePh3wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHtzbQH18vEAeG9oAT80LAR2bWYAbWRdL0A0K90zJhz/MSQa/TMmHP4yJRv/NCcd/zQnHf8lGA3/RTox/7izsP/+/v7//v7+//z8/P/9/f3///////7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/+/v7//v7+//z8/P/9/f3///////f39v+ak4//NSkf/ygaEP81KR//MyYc/zIlG/80Jx3+LyIY/TUoH/9cUUnRzMnGJv///wBlXlgE////AQAAAAHRz80BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACyrKkAV01EATQnHQBNQjoDAAAAAr+9ugZHPDOkNikf/zEjGf0zJhz9MiUb/zMnHf81KB7/JhgN/0Q4L/+7t7P///////7+/v/8/Pz//v7+///////+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////f39//z8/P/+/v7/+vn5/5uVkP8zJhz/KRwR/zYpH/8zJhz/MyYc/zMmHP0tIBb9PzMp/3NqY5L///8CFgwEAoaAewN+dm8AsKunAc/OzQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH11bgH///8Ae3JqAUE2LgRQRTwAW1BITzsuJfYxIxn/MyYc/DMmHP8zJhz/Nikf/ykbEP85LCP/rqmm///////+/v7//Pz7//7+/v///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/f3//Pz8//7+/v/4+Pj/jYaA/yweFP8tIBb/NSkf/zIlG/8zJhz/MiUb/C8hF/9QRDzup6KeQbi1sQBxamUE////AQAAAAHh390AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACwqaYAaWBYAU5COQBVSkEDAAAAArq2tAlHOzK5NCcd/zIkGvwzJhz/MiUb/zUoHv8vIRf/Kx4T/5GKhf/8/Pz//v7+//z8/P/+/v7///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////39/f/8/Pz//////+/u7f9vZV7/JRgN/zMmHP80Jx3/MiUb/zQnHf4vIRf8OCwi/3VsZqr///8EHBEIA5qUjwOrpaAAxMC9AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJOKgQA5LCMBAAAAAEtAOARcUUkAXlRMRDsvJfcwIxn+MyYc/TIlG/8zJhz/NSge/yUXDP9mXVX/7ezr///////8/Pz//v7+///////+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////f39//z8/P//////1dLQ/0k+Nf8nGQ//Nikf/zMmHP8zJhz/MyYc/C0gFv9SRz/vtbCtNe7s6wCGgHwEAAAAAIqDfQHk4+MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfXVvAbSupABmXFQBMyYeBAAAAABNQjqbNCcd/zEkGvwzJhz/MiUb/zYpH/8rHRP/Oi4k/8XBv////////Pz8//39/f///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////8/Pz//f39//////+gmpb/Kx4T/zAjGf80KB7/MiUb/zQnHf8uIRf8PDAn/4eAeowAAAAAZ19ZBOvo5gEAAAAA3tzbAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAByaWIBXFJKAFxSSgMAAAABhHx2F0I2LN0xJBr/MyYc/DMmHP8zJhz/NSge/yUXDP9+dm///Pv7//39/f/8/Pz///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+//z8/P//////6+rp/1pQR/8mGA7/Nikf/zIlG/8zJhz/MiUb/C8iGP9oXlfS////DgAAAAKrpaECycXCANTRzwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmJOOAGBWTgE/NC0AUkhBBGRaUgBbUUlHOSwi/jEjGfwzJhz+MiUb/zUoHv8tIBX/OS0j/87Lyf///////Pz7//7+/v///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/f3//Pz8//////+nop3/KhwS/zIlG/80Jx3/MiUb/zQnHf4sHhT9T0Q7+Laxrjf///8AmpSPA4qDfQC6trMBy8vLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACWko8ARjoxAQAAAABGOzIFJRYMAFNIP4M0Jx3/MiUb+zMmHP8yJRv/Nikg/yUXDP9vZl//+vr6//39/f/9/Pz///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////z8/P//////5+Xk/0tAN/8pHBH/Nikf/zIlG/80Jx3/LiEX+z8yKf+Yko10kouFAIuFgAVJQTsAmJKNAcPDwwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGhgWgAWCgIBxrqyATovJwUAAAAASDw0tDIkGv8zJhz8MyUb/zMmHP80Jx3/KRwR/7Crp///////+/v7//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/f3//Pz8//////+FfXf/JBYM/zYpH/8yJRv/MyYc/zIkGvwzJhz/f3dwpB0PAwB2bWcFAAAAAG1jXAHk4+IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf3dxAAAAAAF8c2wBIRQKA6GalwlANCvVMCMZ/zMmHP0yJRv/NCge/y4gFv9ANCr/4uDe///////8/Pz///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+//v7+///////vrq3/yweFP8zJhz/MyYc/zIlG/80Jx39LSAW/2thWsT///8BS0M8BP///wEzKyUB6+noAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABkW1QAoZiSAF1SSgEAAAABc2ljGj0xJ+wxIxn+MyYc/jIlG/82KR//JxkP/2VbVP/8+/v//Pz8//39/f///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/Pz//////+fl5P9CNi3/LiAW/zQnHv8yJRv/NCcd/iweFP9fVU3g////DwAAAAPw7OkBAAAAAc7MyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHpvaAGSh4AAYFVNAv///wBlW1QoOy4k+DEkGvwzJhz/MiUb/zYqIP8kFgv/j4iD///////7+/v//v7+//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////v7+//z8/P/8+/v/YlhR/ygbEP81KR//MiUb/zQnHf8sHhT9VktD8Ovq6BgAAAAC0s/MAQAAAAHd2tkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeW9oAZOIfgBeU0sCnZGKAFRJQTM3KiD/MSQa+zMmHP8yJRv/Nikf/yYYDv+zr6v///////z7+////////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//7+/v/7+/v//////4R8dv8lFwz/Nikg/zIlG/80Jx3/LB8V/FBFPPbRzsshAAAAAcnGwwH///8A3NrZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABoYFgAgHlzAF9VTQKYkowAXVJKOzYpH/8yJRv7MyYc/zIlG/80KB7/LB8U/87Lyf///////Pz8///////+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////+/v7//////+hm5b/JBcM/zYqIP8yJRv/NCcd/y0gFvxLQDf7ysbEKf///wDY1NEBAAAAAdXT0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHlxbAD05dkAY1hQAp+XkABdU0s7Nyoh/zIlG/szJhz/MyYc/zMmHP8zJh3/4N/d///////9/f3///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////z8/P//////t7Kv/yUXDf82KSD/MiUb/zMmHf8uIBb7TEE4/8jEwir///8A3tzaARMFAAHq6ugAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZVxXAAAAAAFkW1MBmZSOAFVKQjU2KR//MiUb+zMmHP8zJhz/MiUb/zouJP/q6Of//v7+//7+/v///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/Pz//////8XBvv8nGg//Nikf/zIlG/8zJhz/LSAW+0xBOPvX1dMgAAAAAv///wFANjEB8fHwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACal5QAKRsSAXpybAH///8AX1VNKzYpIP8yJRv7MyYc/zMmHP8yJBr/PzIp//Dv7//9/f3//v7+//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////f39///////Nycf/KRsR/zYpH/8yJRv/Mycd/y0gFfxRRj728/PzGAAAAAP///8BenVwAZeXlwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPf29gBCNi4B////AQAAAAJsYVsbOi0k+TIkGvwzJhz/MyYc/zIlG/8/Myn/8vHx//z8/P/+/v7//v7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////39/f//////z8zJ/ykbEP82KR//MiUb/zQnHf8sHxT9V0xE7////w8EAAAEFw0IAJmTjwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVJQQEvIxsAKRwSBJaPigs7LyXsMSQa/TMmHP8zJhz/MyYc/zsvJf/x8O///Pz8//7+/v/+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/f3//////8zJxv8nGg//Nikg/zIlG/80Jx3/LB4U/19VTdsAAAAAW1FJBYN7dgC8uLUBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACvr68AZVxUAU1DPAA6LyYFAAAAAD0xJ9QxJBr/MyYc/zIlG/80Jx7/NCcd/+rp6P/9/f3//v7+//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////f39///////Dv7z/JRcN/zYqIP8yJRv/NCcd/y0fFf9rYVq+FAUAAH93cASspqIA1dPRAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsY1wBWE1FAEY6MQQjFQoAQzcusjEkGv8zJhz/MiUb/zYpH/8tIBb/4d/d//7+/v/+/v7//v7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////39/f//////s6+r/yQXDP82KR//MiUb/zQnHf4vIhf/fnZwmnNqYwCclpID8+/rAOjm5QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHRqZQD///8AVUpCA1FFPABKPjWDMiUb/zMmHP0yJRv/Niog/ycZD//PzMr///////7+/v/+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////8/Pz//////5yWkf8lGA3/NSgf/zIlG/8zJhz9NSkf/5mSjWu/u7gAwLy5Ak9FPAHn5uUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmJWRAEI2LQFoX1cBZlxVAFBFPUw0Jx3/MyYc/DIlG/82KR//JBYM/7Wwrf///////f39//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////Pz7//////9+dm//KRsR/zQnHf8yJRv/MSQa+0E0K/++urcz////AP///wGYkY0BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACZmZkAWE1FAQUAAAAAAAACaV9YHDcqIP8yJRv8MiUb/zUoHv8nGQ7/kouG///////8/Pz////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////v7+///////XVNL/y4hF/8zJhz/MyYc/y4hFvxRRj3y////CyYZEASSjYkAzMnHAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABpYFgBT0Q8ADcrIQQAAAAAPDAn2zEkGv8zJhz/MyYc/y0fFf9pYFj///////v7+////////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////7+/v/+vr5/z4yKP80Jx3/MiUb/zQnHf8sHxT/a2FayAAAAAB+dnAE49/cAO3s6wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH13cwAAAAABTUI6Az4yKQBEOC+bMSQa/zMmHP4yJRv/MyYc/0Q4L//+/v7/+/v7///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////+/v7//v7+//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/+/v7//v7+/+Hf3f8qHRL/Nikf/zIlG/80Jx3+MSQZ/4uEf4Ghm5YAubSwAnJsaAFpaGgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEtAOAFwZ2ABZ15WAE5DOko0Jx3/MyYc/DIlG/82KR//Kx4U/+Tj4v/+/f3///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/f3//v7+//7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+//////+0sKz/JRcM/zUpH/8yJRv/MiUb/D8zKv/Fwr8y////AP///wHBvrsBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZ11WAUc7MwAhEwgDioN9DTgsIvgyJRv8MiUb/zUoH/8lFwz/s66q///////+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////V09H/+Pf3//7+/v/+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z8/P//////enJs/ysdE/8zJh3/MyYc/y0gFv1YTUXo////AUtAOATEwL4A6OXlAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACOiIEAAAAAAUg9NAQvIRcAQDQruTEkGv8zJhz/MyYc/yweFP91bGX///////z8/P///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////AvLn/0s/N///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//7+/v/+/v7//f39//z8+//9/f3///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////7+/v//////0U6MP8zJhz/MiUb/zQnHf8tIBb/fnZwoXZtZgCnoZ0Dg313AeXl4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABKPzUBbGJcAWBVTgBNQjlXMyYc/zMmHP0yJRv/NCcd/z4yKf/9/f3//Pv7///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////Rzsv/hn54///////9/f3////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////38/P/7+/v//Pz8//39/f/+/v3//v7+//7+/v/+/v7//v7+//7+/v/+/v7//v7+//7+/v/+/v7//v7+//7+/v/+/v7//v7+//7+/v/+/v7//v7+//7+/v/+/v7//f39//39/f/8/Pz/+/v7//v7+//8+/v//v7+///////+/v7//v7+///////6+vr//v7+//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/+/v7//////93b2f8oGhD/Nikf/zIlG/8zJhz8PDAm/725tj////8A////AcG9ugEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHRrZABKPzYAJBYMA5aRiwo4KyH3MiUb/DIlG/82KR//JhgO/9HOzP///////v7+//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//39/f/y8vH/QDQr///////8+/v//v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////fz8///////+/v7////////////////////////////+/v7///////7+/v/9/f3//f39//39/f/9/f3//f39//39/f/+/f3//v7+/////////////////////////////////////////////v7+///////8/Pz/5ePi/8zJx/+vqqb/hn54/1NJQP+4tLD///////7+/f/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//f39//////+blZD/JxkP/zQnHf8zJhz/LSAW/ldMROYAAAAAWU9GBPDv7gD49/cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXkdHADktIwFKPzYDNyshAEA0KqgxJBr/MyYc/zMmHf8qHBL/hX13///////9/f3//v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+//z7+///////Kx4T/9fU0v///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//7+/v/7+/v//////3RrZP9EOC//ZlxU/4V9d/+clpH/r6qm/8G9uv/Rzsz/3tva/+fm5P/s6ur/7u3s/+/u7f/v7u3/7+3t/+3s6//q6ej/5OPh/9vZ1//Qzcv/wb67/7Ovq/+jnZn/lI2I/393cf9nXVX/UEU8/0E1LP8zJhz/JxoP/yUXDP8oGhD/IRMI/8TAvf///////v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////UUY9/zIlGv8yJRv/NCcd/i8iGP+AeHKIkYmDALOtqQKdmZcBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXlJMAYN4bwGOhH0AUkc+ODQnHv8zJhz8MiUb/zQnHf9ANCv///////z7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////ST00/3VsZf///////f38//7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+//z8+//6+vr/WE5F/yocEv80KB7/LyIY/ysdE/8nGg//JRgN/yQWC/8lFwz/JhgO/ygaD/8pHBL/Kx0T/yweFP8sHhT/Kx4T/yodEv8pGxH/JxkP/yYYDf8kFgz/JBYL/yUXDf8nGQ7/KBsQ/yseFP8vIhj/MiUb/zQnHf81KR//Nikg/zUoHv81KB7/3dva///////9/f3///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////+/v7/4d/e/ykbEf82KR//MiUb/zEkGvxEOC//7OvqJAAAAAH///8B5uXlAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/encAAAAAATgsIgQAAAAAOy4l3DEkGv8zJhz/NSkf/yUXDf/Kx8T///////7+/v/+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////39/P//////fnZw/ygaEP/y8vH//f38//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////+/v7//f39/+/u7f9CNi3/LyIX/zQnHf8yJRv/MyYc/zMmHP80Jx3/NCcd/zUoHv81KB7/NSkf/zYpH/82KR//Nikf/zYpH/82KR//Nikf/zYpH/82KR//Nikf/zUpH/81KB7/NSge/zQnHf80Jx3/MyYc/zMmHP8zJhz/MyYc/zIlG/80Jx3/LyEX/0M4Lv/w7+7//f39//7+/v///////v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/9/f3//////5KLhf8pGxD/NCcd/zMmHP8sHxT/Z11WwzEjGQCEfHYElI2IAYmJiQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABWTEMBWU5GAU5COQBGOzJoMiUb/zMmHP4zJhz/LSAW/29mX////////Pz8//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////rqml/xwNAv+Vj4r///////39/f/+/v7////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////39/f//////29nX/zIlG/8zJhz/MyYc/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zUoHv8qHRL/WU5G//z8+//8/Pv//v7+//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////Pv7//////9BNSv/NCcd/zIlG/8zJhz9OCsh/6mjn0n///8A9fX0AdbT0QEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI2FfwBmW1IAJRcMA8nFwwY3KyH2MiUb/TIlG/82KR//LyIY//Dv7//9/f3///////7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/+/v7/5OLh/yocEv84LCL/+/r6//z8/P/+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////Pz8///////EwL3/KBoP/zUoH/8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/Nikf/yYYDv90a2T///////v7+//+/v7//v7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+///////Ewb7/JRcN/zUoHv8zJhz/LiAW/ldNROIAAAAAXlRMBFxTSwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFNIQAFTSD8CQzcuAEM3LosyJBr/MyYc/jQnHf8nGg//nJWQ///////+/v3//v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/7+/v//////0Q4L/8pHBH/mJGM///////+/f3//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////7+/v//////6iinv8kFgv/Niog/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/82KiD/JBYL/5GKhf//////+/v7///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//z8/P//////YlhQ/y8iGP8zJhz/NCcd/jIlG/+UjYdtvrq3AM3KxwHCvrsBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYl1aAP///wEJAAADd25nETcqIP8yJRv8MiUb/zQnHf9ANCr///////z7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9/f3//////4B4cf8uIRf/MiUb//X19P/8/Pz////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////v7+///////iYJ8/yQWC/82KiD/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zYpIP8kFgv/rqik///////8+/v///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//7+///+/v7/4uDf/ykbEP82KR//MyYc/y8hF/1TSD/0////AjksIgR2bGQB29vbAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAT0dBAVBFPAI/MigAQTUsmTEkGv8zJhz/NSge/yUXDf+3s6////////7+/v/+/v7////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//////8/Nyv8lGA3/LiAW/393cP///////f39//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/+/v7/+/v7//////9tZFz/JxkP/zYpH/8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/NSge/ykcEf/JxsP///////z8/P///////v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/9/f3//////3x0bv8sHhT/MyYc/zQnHf4wIxn/h395d6GblgC3s68C2NbUAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8eWcA////AQAAAAJzamMTNikg/zIlG/wyJRv/MyYc/0xBOP///////Pv7//7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7/+/v7//////9BNSz/Nysh/ycZDv/a2Nb///////7+/v/+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/8/Pz/+fj4/1NIQP8rHhP/NSge/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zMmHP8yJRv/NCcd/+De3P///////f39///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////f39/+/u7v8tIBX/Nikf/zMmHP8vIhj9UEU89v///wQoGhAEgYB/AXFTUwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABWS0IBUEQ8Aj8zKgBBNSyYMSQa/zMmHP81KB7/JRgN/8PAvf///////v7+//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////f39//////+UjYj/KBsQ/zMmHP9PQzv///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////f39//7+/v/r6un/PjEo/zAjGf80Jx3/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/NCcd/y4hF/9FOTD/8fDv//39/f/+/v7///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//f39//////+Kg33/Kh0S/zMmHP80Jx3+MCIY/42GgXusp6MAxsLAAtbU0QEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALGxZABCNjMBDgAAA4N7dQ43KiD/MiUb/DIlG/8yJRv/T0Q8///////8+/v//v7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////y8vH/7ezr//7//v/v7u3/LB8U/zcrIf8nGQ//mJGM///////9/f3//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/f3//////9fV0/8vIhj/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/81KB7/KhwS/1xSSv/8/Pz//Pv7//7+/v/+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////38/P/y8fD/LiEX/zYpH/8zJhz/LiEX/VRKQfMAAAAAQjYtBMTAvgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFxTTAFTSD8CRDgvAEM3LoEyJRr/MyYc/jUoHv8lFw3/wb67///////+/v7//v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+//39/P/09PP/n5mU////////////dGtk/y0fFf82KiD/JxkP/9nX1f///////v7+//7+/v/////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////z8/P//////vrq2/ycZDv81KR//MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zYpH/8mGA3/dm5n///////7+/v///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//39/f//////h395/yodEv8zJhz/NCcd/jMmHP+WkItjycbEAMvIxQHp6OgBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZGRkAEY5LwEsHhQEAAAAADgrIvIyJRv9MiUb/zMmHP9IPDP///////z7+//+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////UEU9///////8+/v/4uDf/ygaD/82KR//NCcd/z8yKf/8/Pz/+/v7///////+/v7///////////////////////////////////////////////////////////////////////////////////////7+/v//////+/v7//////+hm5f/IxUL/zYqIP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/Nyog/yMVC/+TjYf///////v7+////////v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/9/f3/6+rp/yseE/82KR//MyYc/y4gFv9bUUndAAAAAGxiWwTQzs0BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoZmTAGBWTgFUSUEASD00XjIlG/8zJhz9NCcd/yYYDf+xrKj///////7+/v/+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z8/P//////ZFpT/6Galv///////////3FoYv8tIBb/MyYc/y0gFv9nXVb///////v7+////////v7+/////////////////////////////////////////////////////////////////////////////v7+///////7+/v//////4R9dv8kFwz/Niog/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/82KSD/JBYM/7GsqP///////Pz7///////+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/9/fz//////3VtZv8tHxX/MyYc/zMmHP05LCL/t7OvQv///wDj4eAB/v7+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVUtCAT8zKgQcDgMAPTEn1jEkGv8zJhz/NSge/zotI//+/v7//Pz7//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////oJqV/y0gFv/9/f3/+/v6/+ro5/8qHRL/Nikf/zQoHv8nGQ7/j4iD///////8/Pz///////7+/v/////////////////////////////////////////////////////////////////+/v7//v7+//v7+///////Z11W/ygaEP81KR//MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zUoHv8qHBL/y8jG///////8/Pz///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//////9vZ1/8nGQ7/NSkf/zMmHP8sHxT/cGdgv1JHPwCak44DxMC9AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABiYmIAdGxkAcG9uQBVSkEtNCcd/zMmHPwzJhz/KRsR/5GLhf///////f39//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////19XT/xsNAv+TjIf///////////+MhX//KRsR/zMmHP82KR//JBYL/7Cqp////////f39///////+/v7////////////////////////////////////////////////////////////+/v7//Pz8//b29f9OQzr/LB8V/zQoHv8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/8zJhz/MiUb/zYpH//h397///////39/f///////v7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//Pz8//////9ZT0f/MSQa/zMmHP8xJBr8RTkw/////xYAAAACt7KuAXR0dAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABnXFQBTUE5Az4yKABANCqfMSQa/zMmHP82KR//Kx0T/+rp6P/+/v3//v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/8/Pv//v7+/zsuJf8tIBX/6Ofm//v6+v/+/v7/PDAm/zUoHv8yJRv/Niog/yUXDP/EwL3///////39/f///////v7+///////////////////////////////////////+/v7///////39/f/+/v7/5+Xk/zsvJf8wIxn/NCcd/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zQnHf8uIBb/Rzwz//Ly8f/9/f3//v7+///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+5tbL/JRcN/zQoHv80Jx3+LyIY/4N7dX2gm5UAu7ezAvj49wAAAAAAAAAAAAAAAAAAAAAAAAAAAOPj3gBFOTEBLB8UBP///wI4KyL3MiUb/TMmHP8vIhj/ZFtT///////8/Pz//v7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8/Pz//////21kXf8rHhP/X1VO////////////xMC9/yQWC/82KR//MiUb/zYpIP8nGQ7/y8fF///////9/f3///////7+/v////////////////////////////7+/v///////f38///////Sz83/LSAW/zQnHf8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/NSgf/ykcEf9eVEz//f39//v7+//+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//z8+//+/v7/OSwi/zUoHv8zJhz/LiAW/ltQSecAAAAAZFlSBNfW1QEAAAAAAAAAAAAAAAAAAAAAAAAAAGFhYQBeVEwBW1FJAEk+NVIyJRv/MyYc/TUoHv8lGA3/wr67///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7////////+/v7//////8C8uf8nGQ7/JxkP/66ppf///////////3VtZv8sHhT/MyYc/zIlG/82KSD/JxkP/8vHxf///////f39///////+/v7//////////////////v7+///////8/Pz//////7m0sf8mGA3/Nikf/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/82KR//JRcN/3lxav//////+/v7///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//39/f//////iIB7/yodEv8zJhz/MyYc/DsvJf/JxsM6////AOXk4wF9fX0AAAAAAAAAAAAAAAAAAAAAAFxQRwFIPDMDNikfAD4yKLwxJBr/MyYc/zUoHv85LSP///////z8+//+/v7////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7/+/v7//////84KyH/OSwi/y0gFf/r6un/+vr6//39/f89MCf/NCge/zIlG/8yJRv/Nikg/yYZDv/Cvrv///////z8/P///////v7+///////+/v7///////v7+///////m5WQ/yQWC/82KiD/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zcqIP8jFQv/l5CL///////7+/v///////7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////29nX/ycZDv81KR//NCcd/y0gFv96cWqggXlyAK+rpgPx8e8AAAAAAAAAAAAAAAAAAAAAAF5SSwEYCgADk42ICjYqIP8yJRv8MyYc/ysdE/+BeXP///////39/f/+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////V1fb/+fn8//////+Ffnj/Kh0S/zIlG/9SRz7///////z8/P/W1NL/JhgN/zYqIP8yJRv/MiUb/zYpIP8kFgz/rqil///////7+/v///////7+/v///////Pv7//////9+dm//JRcM/zYpIP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/Nikf/yUXDP+zrqr///////z8+////////v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/8+/v//////0xBOP8zJhz/MyYc/y8hF/1TSEDyAAAAAEk+NQTRzswBAAAAAAAAAAAAAAAA4+PjAF5UTAFVSkIASDwzWjIlG/8zJhz9NSge/yYYDv/T0c////////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+enuv/wMDy///////m5eT/KRsR/zcqIf8pGxD/h395////////////o52Z/yUXDP81KB//MiUb/zIlG/82KiD/JBYL/46Hgf//////+/v7//7+/v/9/f3//v7+/2NZUv8oGxD/NSkf/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP80Jx3/Kx4T/83KyP///////fz8///////+/v7////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//////5yWkf8oGhD/NCcd/zMmHPw5LCP/u7ayO////wDu7esBAAAAAAAAAAAAAAAAal9YAUo/NgM2KSAAPzMquTEkGv8zJhz/NCcd/z8zKv///////Pv7//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+lpe3/SUna////////////bWNc/y4hFv82KR//JBYL/7eyr////////////3VsZf8qHRL/NCcd/zMmHP8yJRv/Nikf/ycZD/9nXlb//f39//v6+v//////iYJ8/yASB/83KiH/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/MyYc/zEkGv83KiH/4+Hg///////9/f3///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+/+Pi4P8oGxD/Nikf/zQnHf8tIBb/f3dxnoiBewC5tLED7eXkAAAAAAAAAAAATT42ASseFAT///8CNysh+zIlG/wzJhz/Kx0T/4J6dP///////f39/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+wsO//AADI//Ly/P/9/f7/3tza/ycZDv82KR//Nikg/ygbEP/a2Nb//Pv7//////9TSED/LyIY/zMmHP8zJhz/MiUb/zUoHv8tIBb/QTUr/+Pi4P/+/v7//////352b/8mGA3/Nikf/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/80Jx3/LSAW/0k9NP/z8vL//f39//7+/v///////v7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//Pv7//////9NQjn/MyYc/zMmHP8tIBb+W1BI7AAAAABgVk4EzcvJAQAAAACnp6cAYldQAWdcVQBLPzdBMyYc/zMmHP01KB7/JRcN/8zIxv///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+tre7/AADH/3h44////////////3FoYf8tIBb/MiUb/zUoHv80Jx3/7+7t//r5+f/4+Pj/PzMp/zMmHP8zJhz/MyYc/zIlG/8zJhz/Mycd/ykbEf+vqqb///////////+PiIL/IxUL/zcqIP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zUoH/8pGxH/YFdP//39/f/7+/v//v7+//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////f39//////+Si4X/KRsR/zMmHP8yJRv8PjEo/+Xk4iX///8A8O/uAQAAAAAAAAAAUEQ8AkI1LABCNSyVMiUa/zMmHP81KB//NSge//z8/P/8/Pz//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADK/wQEzP/x8fz/+/r9/+zr6v8rHhT/Nikf/zIlG/8yJRv/QjYt//r5+f/6+vr/7ezr/zQoHv80Jx3/MiUb/zMmHP8zJhz/MiUb/zYpIP8lFwz/Z15W//Pz8v//////pqCc/yMVC/82KSD/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/Nikg/yUXDf98dG3///////v7+////////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////W09L/JRcN/zUoH/80Jx3+MSQa/4uEfnSvqqcAy8fFAQAAAABnXlkBPTEnBB0PAwA7LiXdMiQa/zMmHP8vIRf/aF9X///////8/Pz//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wAAy/9kZN////////////+Vjon/KBoP/zQnHf8zJhz/MCIY/1BFPP//////+/v6/+Xj4v8wIxj/NSge/zIlG/8zJhz/MyYc/zIlG/81KB7/LiEX/zIlGv+1sa3//////8bCwP8pGxH/NCcd/zMmHP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/82KiD/IxUK/5mSjf//////+/v7///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//z7+///////Oy8l/zUoHv8zJhz/LR8V/2pgWcRRRj0AlY6JBP///wB0cWsBBgAAA3BmYBE1KB//MiUb/DQnHf8mGQ7/qqWh///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wUFzv8AAMn/0tL2//z8+///////RDgv/zQnHf8yJRv/Mycd/y4gFv9YTUX///////v7+//g3tz/LyEX/zUoHv8yJRv/MyYc/zMmHP8yJRv/MyYc/zYpH/8lFwz/WlBH/+fl5P/t7Ov/PTEn/ywfFP81KB7/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zYpH/8lGA3/trGt///////8/Pz///////7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z8/P//////b2Zf/y4gFv8zJhz/LyIY/FBFPf3///8EFwkABObl5AFlW1QBW1FJAEk9NFEyJRv/MyYc/TUpH/8oGhD/4d/e///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAMz/KirT///////8/P//1NHP/yUXDP82KSD/MiUb/zQnHf8tHxX/W1BJ///////8/Pz/4+Hf/zIlG/80Jx3/MyYc/zMmHP8zJhz/MyYc/zIlG/81KB7/MCMZ/yYZDv+De3X/+/v7/3JpY/8iFAr/NSge/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/NCcd/ywfFP/PzMr///////38/P///////v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////rKej/yYYDv80Jx3/MyYc/DotJP/KxsQz////APf29gFOQzoCQDQrAEA0K5kyJRv/MyYc/zUoHv88Lyb///////v7+//+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8BAc3/AADJ/4iI5////////////4uEfv8oGhD/NCcd/zIlG/80Jx3/LR8V/1dNRP/+/v7/+/v7/+no5/84KyL/MiUb/zMmHP8yJRv/MyYc/zMmHP8zJhz/MyYc/zYpH/8rHRP/LB8V/6KdmP+emJP/MiUb/zIlG/8zJhz/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zMmHf8xJBr/OCwi/+Ti4f///////f39///////+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////4uDe/ycZD/82KR//NCcd/jEkGv+Gf3lzq6aiAMTAvQFANCoEKhwSADsvJdUyJBr/MyYc/y4hF/9rYlv///////z8/P///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAMz/AwPN/wAAyv/b2/j/+/v7//////9PQzv/MiUb/zIlG/8yJRv/NCcd/y4gFv9QRTz/+vr5//v7+//z8vL/Rjox/y4gFv80Jx3/MiUb/zMmHP8zJhz/MyYc/zIlG/8zJhz/Nikf/yUXDP89MSf/bmRe/zksIv8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/NCce/y0gFf9LQDf/9PTz//39/P/+/v7//////////v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/7+/v//////zwwJv81KB7/MyYc/y0fFf9tZF26YFZOAJyWkQMjFAkE////AzcqIf0yJRv8NCcd/ycZD/+inJf///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADM/wAAzP8mJtP///////n5/P/r6uj/LSAW/zYpH/8yJRv/MiUb/zMnHf8wIhj/Qzct//Hw8P/8/Pv//Pz8/19VTf8oGxD/Nikf/zIlG/8zJhz/MyYc/zMmHP8zJhz/MiUb/zQnHf80Jx3/Kx4T/zMmHP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/81KR//KBsQ/2NZUf/+/v7/+/v7//7+/v/+/v7////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8/Pz//////2heV/8vIhf/MyYc/y4gFv1YTkbwAAAAAFlPRwTBvrsAVktDLjQnHf8zJhz8NSge/yYYDf/Sz83///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wEBzf8AAMr/bm7h////////////w7+9/yQWC/82KiD/MiUb/zMmHP8zJhz/MiUb/zUoH//i4N7//v79//////+De3X/IxYL/zYqIP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/MyYc/zMmHP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zYpIP8lFwz/fnZw///////7+/v///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9/f3//////5mSjf8oGhD/NCcd/zEkGvxFOTD/////GQAAAAJSRj4ARzsyZDIlG/8zJhz9NSkf/y8hF//z8/L//f38//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzP8DA83/AADJ/7S08P////7//////5iSjf8lFw3/NSge/zIlG/8zJhz/MyYc/zUoHv8qHRL/yMXC////////////sayo/ycZDv80Jx3/MyYc/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/Niog/yMWC/+clpH///////v7+////////v7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//////8fDwf8lFw3/NSge/zMmHP03KyH/tK+rRf///wBBNSwAQDQrmzEkGv8zJhz/NCcd/0U5MP//////+/v7//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAMz/AwPN/wICy//m5vr/+vr7//////91bGX/KhwS/zQnHf8yJRv/MyYc/zIlG/82KSD/JBYL/6Semf///////////93b2f88MCb/LR8V/zUoHv8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/82KR//JRgN/7izsP///////Pz8///////+/v7////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v39/+vq6f8qHBL/Nikf/zQnHf4wIxn/i4R+eq6ppQAwIxkAPC8myzEkGv8zJhz/LiEX/2tiW////////Pz8/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADM/wAAzP8hIdL///////f3+v//////XFFJ/y4gFv8zJhz/MyYc/zMmHP8yJRv/Niog/yUXDP94b2j///////z8+//7+/r/bmVe/yQWC/82KSD/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zQnHf8tIBX/0c7M///////9/fz///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7/+/v7//////88MCb/NSge/zMmHf8tHxX/dGxlsHNrZAAOAAAAOSwi8DIlG/4zJhz/KRsQ/5OMh////////f39/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMv/Skra///////39/r//v7+/0xAOP8wIxn/MyYc/zMmHP8zJhz/MiUb/zUoHv8rHRP/TUE5/+/u7f/9/f3//////7Ouqv8sHhT/MCMZ/zUoHv8yJRv/MyYc/zMmHP8zJhz/MyYc/zIlG/8zJx3/MSQa/zouJP/m5eT//v7+//39/f///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////Pz7//////9aT0f/MSQa/zMmHP8sHxX/ZVtU3xQFAACMhH8MNikf/zIlG/w0Jx7/JRcN/7izsP///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8BAc3/AADK/3Fx4v//////+fn7//j4+P9CNi3/MSQa/zMmHP8zJhz/MyYc/zIlG/80Jx3/MiUb/y4hF//Gw8D///////7+/v/u7ez/WlBI/yUXDP82KR//MyYc/zIlG/8zJhz/MiUb/zQoHv8tHxX/TEE4//b19P/9/Pz//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////f39//////98dG7/LB4U/zMmHP8uIRf8VUpC/QAAAABRRj0oNCcd/zMmHPw1KB//JhgN/9fU0v///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AgLN/wAAyf+Tk+n///////r6/P/09PP/QDQq/zEkGv8zJhz/MyYc/zMmHP8zJhz/MiUb/zYpH/8kFgv/ioN9///////7+/v//////66opP8uIRf/LiAW/zYpH/8yJRv/NSkf/ygbEP9lXFT///////v7+//+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+fmZT/JxoP/zQnHf8xJBr7RTox/////xJMQDdKMyYc/zMmHP02KR//Kx4U/+7t7P/9/f3//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wMDzf8AAMn/ra3u///////7+vz/9PTz/0E1K/8xJBr/MyYc/zIlG/8zJhz/MyYc/zIlG/82KR//KRsQ/09EO//q6ef//v7+//7+/v/z8vH/bmVe/yQWC/81KB7/JRcM/4F5c///////+/v7///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////++urb/JRcM/zUoHv8zJhz8PDAn/9XS0C9KPjZtMiUb/zMmHP41KB7/Nikf//7+/v/8/Pv//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8EBM3/AADJ/7298v//////+/v8//b29f9HOzL/LyIY/zQnHf8yJRv/MyYc/zMmHP8yJRv/NCcd/zIlG/8rHRP/sKun///////6+vr//////9HOzP9DNy7/m5WQ///////7+/v///////7+/v/////////////////////////////////////////////////////////////////+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////X1dP/JRgN/zUoH/8zJhz9Nyog/6qloUxHOzKMMSQa/zMmHP8zJx3/Rjox///////7+/v//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/BATN/wAAyv/GxvP///////r6+//8+/v/U0lA/yweFP81KB7/MiUb/zMmHP8zJhz/MyYc/zIlG/82KSD/JRcM/2RbU//z8/L//f39//38/P/+/v7//v7+//39/f///////v7+//////////////////////////////////////////////////////////////////7+/v///////f38///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//39/f/s6+r/Kh0S/zYpH/80Jx3+MiUb/5mSjXNCNi2pMSQa/zMmHP8xJBr/W1BI///////8/Pv//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wQEzf8AAMr/x8f0///////6+fv//////2ddVv8oGhD/Nikf/zIlG/8zJhz/MyYc/zMmHP8yJRv/NSge/y8hF/8wIxn/uLOw///////6+fn//Pz8///////+/v7////////////////////////////////////////////////////////////////////////////7+/r/+vn5//39/f///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//z8/P/6+fn/MiUb/zUpH/80Jx3/LyEX/4qDfY09MCe9MSQa/zMmHP8uIRf/a2Jb///////8/Pz//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAMz/AQHM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8EBM3/AADK/8LC8///////+fn6//////+BeXP/JBYL/zYqIP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP82KR//JBYM/2NZUv/v7u7///////z8/P/+/v7//v7+/////////////////////////////////////////////////////////////v7+//39/f/w7+7/XVJL///////7+/v///////7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////PzMp/zQnHf80Jx3/LR8V/352cKQ8MCfPMSQa/zMmHP8rHhT/gHhx///////9/f3//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wMDzf8DA83/ICDR/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/BATN/wAAyf+1tfD///////n5+///////o56Z/yQWC/82KSD/MiUb/zMmHP8zJhz/MyYc/zMmHP8yJRv/NSge/y8iGP8sHxX/pqGd///////9/Pz//fz8///////+/v7//////////////////////////////////////////////////v7+//39/f/y8fH/JRcM/2FXUP//////+/v7///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//v7+///////Sj82/zMmHP8zJhz/LB8V/3FoYbg8LybgMSQa/zMmHP8qHBL/jIR////////9/f3//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wMDzf8AAMr/XV3e/xcXz/8BAc3/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wQEzf8AAMn/oaHs///////5+fv//////8jFwv8sHhT/MyYc/zMmHP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP82KR//JhgO/05DOv/b2df///////z8/P/+/v3///////7+/v////////////////////////////////////////////39/f/u7ez/LB8V/y8iGP9cUUn///////v7+////////v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z7+///////WE1F/zEkGv8zJhz/LB4U/29lX800KB7nMiUb/zQnHf8nGg//npiU///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8DA83/AQHM/7a28P8AAMj/BATO/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8DA87/AADJ/4SE5v//////+fn8///////p6Of/RDgv/ywfFP81KB7/MiUb/zMmHP8zJhz/MyYc/zMmHP8yJRv/NCcd/zIlG/8lFw3/fXVu//f29v/+/v7//Pz7//7+/v/+/v7//v7+/////////////////////////////v7+//7+/f/r6ej/KRwR/zcqIf8sHxX/Wk9H///////7+/v///////7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z8/P//////X1RN/zAjGf8zJhz/Kx0T/25kXd04LCLuMiUb/zQnHf8nGQ//oJuW///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADL/2Zm3/+iouz/AADI/wICzf8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AwPN/wAAyf9gYN////////r5/f/8/Pz//f39/29mX/8lFwz/Niog/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/82KR//Kx4U/zIlG/+qpKD///////39/f/8/Pz///////7+/v///////////////////////v7+//7+/v/m5eP/KBoQ/zYpH/80Jx3/LR8V/1lPR///////+/v7///////+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z8/P//////bWRd/y4hF/8zJhz/LSAV/11TS+E4LCL0MiUb/zQnHf8mGQ7/qqWh///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAMz/AwPN/wAAyf/b2/f/Zmbg/wAAyv8BAc3/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wICzf8AAMr/ODjX//v7/v/7+/7/+vr7//////+oo57/JhgO/zQnHf8zJhz/MiUb/zMmHP8zJhz/MyYc/zMmHP8yJRv/MyYc/zYpH/8mGA3/SDwz/8zIxv///////f39//z8/P///////v7+/////////////v7+///////j4eD/JxoP/zYpH/8yJRv/NCcd/y0fFf9aT0f///////v7+////////v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z8/P//////dGtl/y0gFf8zJhz/LSAW/1pQSOQ3KiD7MiUb/zQnHf8mGA3/sq2q///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADM/wAAzP8oKNP//////z092P8AAMv/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8BAc3/AADL/xUVz//h4fn///////r6+///////3tzb/0A0Kv8rHhT/Nikf/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/80Jx3/MyYc/yQWC/9gVk7/4d/e///////9/fz//f39///////+/v7//v7+///////g3tz/JxkP/zUpH/8zJhz/MiUb/zQnHf8sHxX/XFFJ///////7+/v///////7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////38/P//////dWxm/y0gFf8zJhz/LSAW/1pPR+Y2KR/9MiUb/zQnHv8lFw3/trKu///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wEBzf8AAMn/jo7o//////8mJtP/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AADN/wMDzf8AAMr/sLDv///////6+fz//Pz8//39/f95cGr/JBYL/zYpH/8zJhz/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zUoH/8wIxn/JhgO/3VsZv/t7Ov///////z8/P/9/f3////////////c2tn/JhgO/zUpH/8zJhz/MyYc/zIlG/80Jx3/LB4U/19VTf//////+/v7///////+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////38/P//////dWxl/y0gFf8zJhz/LiAW/1pPR+k2KR/9MiUb/zQnHv8lFw3/trKu///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzP8DA83/AADL/+Pj+f/29v3/GRnQ/wEBzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8DA83/AADJ/29v4v//////+/v+//v6+///////wb25/zEkGv8uIRf/NSge/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/Nikf/y0fFf8qHBL/hHx3//Py8v///////Pz8//7+/v/Z19X/JRcN/zUpH/8zJhz/MyYc/zMmHP8yJRv/NCcd/yseE/9jWVL///////v7+////////v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////38/P//////dWxl/y0gFf8zJhz/LiAW/1pQSOk3KiD7MiUb/zQnHf8mGA3/sq2q///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAMz/AADM/zMz1f//////6ur7/w8Pzv8CAs3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AgLN/wAAyv8sLNT/7u77//7+///6+vz//v7+//X08/9nXlf/JBYL/zYpH/8zJhz/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zMmHP82KR//Kx0T/y4gFv+MhH//9fT0///////S0M7/JRcM/zUoH/8zJhz/MyYc/zMmHP8zJhz/MiUb/zQnHv8qHRL/a2Jb///////7+/v///////7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////38/P//////dWxm/y0gFf8zJhz/LSAW/1pPR+Y4LCL0MiUb/zQnHf8mGQ7/qqWh///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AQHN/wAAyv99feX//////+Xl+v8MDM3/AgLN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wEBzf8CAsz/AwPL/7Gx7///////+vr9//v7+///////ubWx/zEkGv8tIBb/NSkf/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/MyYc/zYpH/8qHBL/LyIX/4+Igv/EwL7/JRcM/zUoHv8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/81KB7/KRsQ/3ZtZ///////+/v7///////+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z8/P//////dGxl/y0gFf8zJhz/LSAW/1pQSOM4KyHtMiUb/zQnHf8nGQ//oJuW///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADM/wMDzf8AAMn/wcHy///////m5vr/DQ3N/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AwPN/wAAyf9aWt7//f3+//z8/v/6+vv//v7+//X09P9wZ2D/JBYL/zQoHv80Jx3/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/8zJhz/Nikf/ykbEf8tIBb/MyYc/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/NSge/ycZDv+BenP///////z7+////////v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z8/P//////bWRd/y4hF/8zJhz/LSAV/11SS+A0Jx3mMiUb/zQnHf8nGQ//n5iU///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8DA83/BgbM/+vr+//6+v7/6ur6/xISz/8CAsz/AADN/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wICzf8AAMv/EhLP/8rK9P//////+vr9//z7/P//////ycbD/z4yKP8pGxD/Nikf/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zMmHP81KB7/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zYpH/8lFw3/kouG///////8/Pz///////7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z8/P//////X1RN/zAjGf8zJhz/Kx4T/21kXd07LybgMSQa/zMmHP8qHBL/jIV////////9/f3//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/yUl0v//////+Pj9//Pz/P8dHdH/AADM/wEBzf8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8BAc3/AwPN/wAAyf9nZ+H//f3+//39/v/6+vz//f39//39/f+QiYT/KBsQ/zAiGP81KB7/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/82KR//JBYL/6OdmP///////fz8///////+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z7+///////WE1F/zEkGv8zJhz/Kx4U/29mX808MCfQMSQa/zMmHP8rHhP/gHhy///////9/f3//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAy/9FRdn///////f3/f/7+/7/MjLV/wAAyv8CAs3/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wMDzf8AAMr/ExPP/8LC8///////+/v9//v7+///////6Ofm/2FXUP8kFgv/NCcd/zQnHf8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/Niog/yQWC/+1sKz///////39/f///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//v7+///////Sj82/zMmHP8zJhz/LB8V/3FoYbg9MCe9MSQa/zMmHP8uIRf/bGJb///////8/Pz//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wEBzf8AAMr/YWHf///////39/3//////1JS3P8AAMn/AwPN/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8BAc3/AwPN/wAAyf9TU93/9PT8//7+///6+vz//Pz8///////Gw8D/Qzcu/yYYDv82KR//MyYc/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zcqIP8lFw3/ycXD///////+/v7//v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////PzMp/zQnHf80Jx3/LR8V/352cKVCNi2pMSQa/zMmHP8xJBr/W1FJ///////8/Pv//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8CAs3/AADJ/3R04///////9/f9//////9/f+X/AADJ/wQEzf8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wICzf8BAcv/BQXM/5yc6////////Pz+//n5+//+/f3//////6Semv8yJRv/KhwS/zYpH/8zJhz/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/82KSD/KhwS/93b2f///////v7+//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//z8/P/6+vn/MiUb/zUpH/80Jx3/LyEX/4qDfY5HOzKMMSQa/zMmHP8zJx3/Rjox///////7+/v//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AgLN/wAAyf9+fuX///////j4/f//////tLTw/wAAy/8DA83/AQHN/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8AAM3/AwPN/wAAyf8mJtT/0dH1///////7+/7/+vr7/////v/39/f/iYF8/yodEv8tHxX/Nikf/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/NSge/zMmHP/u7ez//f39///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//39/f/s6+r/Kh0S/zYpH/80Jx3+MiUb/5iSjXNKPjZuMiUb/zMmHP41KB7/Nikf//7+/v/8/Pv//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wMDzf8AAMn/eXnk///////4+P3//////+Tk+f8eHtH/AADK/wICzf8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wICzf8CAsz/AADJ/1FR3P/u7vv///////r6/f/7+/z//////+3s6/92bmf/JxkP/y4hF/82KR//MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlHP9CNi3/+/v6//z7+////////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////Y1dP/JRgN/zUoH/8zJhz9Nyog/6qkoExLQDdLMyYc/zMmHP02KR//Kx4U/+7t7P/9/f3//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8DA83/AADJ/2lp4f//////+fn9//v7/v//////XFze/wAAyf8DA83/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AwPN/wEBy/8BAcv/enrl//r6/v/+/v//+fn8//z8/P//////5OLh/2tiW/8mGA3/LyIX/zYpH/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8vIRf/WE1F///////7+/v///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////++urf/JRcM/zUoHv8zJhz8PDAm/9LQzi1RRj4oNCcd/zMmHPw1KB//JhgN/9fU0//+///////+//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AgLN/wAAyv9PT9z///////r6/v/6+v7//////6+v7/8EBMz/AQHM/wICzf8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wAAzf8DA83/AADK/wsLzv+Zmer///////7+/v/5+fv//f39///////f3dz/Z15X/yYYDf8uIRf/Nikf/zMmHP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/80Jx3/KhwS/3VsZf///////Pv7///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+fmZT/JxoP/zQnHf8xJBr7RTow/////xKMg34MNikf/zIlG/w0Jx3/KRsN/5uXq///////+/v+///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wEBzf8AAMv/MDDV//j4/f/8/P7//Pz+//7+/v/w8Pz/OzvY/wAAyf8DA83/AADN/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AQHN/wICzf8AAMn/FhbQ/6ur7v///////v7+//j4+//9/f3//////9/d3P9qYVr/JxkP/y0gFv82KR//MyYc/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/NSge/yYYDf+UjYj///////38/P///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////f39//////98dG7/LB4U/zMmHP8uIRf8VUpB/QAAAAAOAAAAOCwi8TIlG/4yJRz/NikT/xUObv9+fu////////v7/v///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8BAc3/AQHM/xERzv/a2vf///////39/v/7+/7//////6Cg7P8EBMv/AQHL/wICzf8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8CAs3/AgLN/wAAyf8dHdL/srLv///////+/v7/+Pj7//39/f//////4+Hg/3NqY/8pHBH/Kx0T/zYpH/80Jx3/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zYpH/8kFgv/uLOw///////+/v3//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////Pz7//////9aUEj/MSQa/zMmHP8sHxX/ZFtT3hUHAAAwIxkAPC8mzDEkGv8zJhz/MiUX/zAmUP8AANb/Z2fe///////6+v7///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wUFzf8EBMv//Pz+//v7/v//////+/v+//7+/v/x8fz/Skrb/wAAyf8CAs3/AQHN/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wICzf8BAc3/AADJ/x8f0v+wsO////////7+/v/5+Pv//f39///////s6+r/gnp0/y8iGP8oGhD/NSge/zQnHv8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlG/82KiD/JxkP/9fV0////////v7+//7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7/+/v7//////88MCb/NSge/zMmHf8tHxX/dGtksHNqYwBBNCsAQDQrmzEkGv8zJhz/MiUc/zQoLf8DBNb/AADH/05O2///////+vr+///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8CAs3/+fn9//v7/v/+/v////////39/v/7+/7//////7+/8v8XF9D/AADK/wMDzf8AAM3/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AgLN/wEBzf8AAMn/HBzS/6en7f///////v7///n5+//7+/3///////X19P+Zko7/Oy4l/yUXDP8yJRv/NSgf/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/NSge/zMmHP/w7+7//Pz8///////+/v7////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//f39/+vq6f8qHBL/Nikf/zQnHf4wIxn/ioJ8eqynowBRRj0ARjsyZTIlG/8zJhz+MiUe/zYoGP8HB8X/AQHL/wAAyv81Ndb//f3+//v7/v/+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v////////7+/v///////Pz+//39/v//////iIjn/wMDy/8AAMv/AwPN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8CAs3/AQHN/wAAyf8SEtD/kpLp//r6/v/+/v//+/v8//r6/P/+/v7//f39/7axrv9PRDv/JRcM/y4hFv82KR//MyYd/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zIkGv9KPzb///////v7+////////v7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//////8fEwf8lFw3/NSge/zMmHP03KyH/s66rRf///wC8tbIAVkpCLzQnHf8zJhz8MiUe/zYoEP8RD6f/AADO/wEBzf8AAMv/Hx/S//Pz/P/8/P7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v/////////////+/v///v7///7+/v/7+/7///////Ly/P9eXt//AADK/wEBy/8DA83/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wICzf8CAs3/AADJ/wgIzf91deP/7u77///////9/f3/+Pj7//7+/v//////1dLQ/25lXv8rHhT/KBoQ/zQnHv81KB7/MyYc/zMmHP8zJhz/MyYc/zMmHf8sHxT/a2Fa///////8+/v///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/f3//////5mTjv8oGhD/NCcd/zEkGvxFOTD/////GQAAAAIhEwgE////BDcqIf0yJRv8MiUd/zUnEf8dGH7/AADU/wAAzP8AAM3/AQHM/xERzv/k5Pn//v7+//39/v///////v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v////////////////////////7+/v///////f3+//z8/v//////4eH5/0ZG2v8AAMn/AQHM/wMDzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AQHN/wICzf8AAMr/AADL/1JS3P/V1fb///////7+/v/4+Pr//f3+///////x8O//l5GM/0A0Kv8kFgz/LyIY/zYpH/80Jx3/MiUb/zIlG/81KB7/JhgO/5OMh////////f38///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8/Pz//////2hfWP8vIRf/MyYc/y4hFv1YTUXxAAAAAFdNRQRANCoEKRwRADsvJdUyJBr/MyYc/zMlGP8rIk7/AADZ/wAAy/8AAM3/AADN/wMDzf8FBcz/0dH2///////9/f7///////7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v///////////////////////////////////v7+///////8/P7//Pz+///////W1vb/PDzY/wAAyf8BAcz/AwPN/wAAzf8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8BAc3/AwPN/wAAy/8AAMn/KyvV/6ur7v/9/f7//v7///v7/P/6+vz//v7+///////Hw8H/ZlxV/yseE/8oGg//NCcd/zUoH/8zJhz/Nikf/yQWC/+8uLT///////7+/v/+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/7+/v//////zwwJv81KB7/MyYc/y0fFf9tZF28X1VNAJyWkQNOQzoCQDQrAEA0K5oyJRr/MyYc/zIlHf80JyT/AQLS/wAAyv8AAMz/AADN/wAAzP8EBM3/AADK/7y88v///////Pz+///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v/////////////////////////////////////////////+/v7///////z8/v/9/f7//////9PT9v8+Ptn/AADJ/wAAy/8DA83/AADN/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wAAzf8DA83/AADM/wAAyf8MDM7/dHTj/+bm+v///////v7+//j4+v/+/v7///////Dv7v+clZH/Rjsy/yUXDP8sHhT/NSge/zgsIv8pHBH/4N7c//7+/v/+/v7//v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////4uDf/ycZD/82KR//NCcd/jEkGf+HgHp1q6aiAMTBvgFlW1QBW1FJAEk+NVIyJRv/MyYc/TIlHv82KBL/DQu1/wAAzP8AAMz/AADN/wAAzf8AAMz/BATN/wAAyf+kpO3///////v7/v///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v////////////////////////////////////////////////////////7+/v//////+/v+//39/v//////2tr3/0xM2/8AAMr/AADL/wMDzf8BAc3/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wICzf8CAs3/AADK/wAAyv84ONf/srLv//z8/v/+/v///Pz8//r5/P/+/v7//////9bT0f98dG3/Nyog/yQWC/8wIxn/PjIo//j4+P/8/Pz///////7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////raik/yYYDv80Jx3/MyYc/DotI//Kx8Q1////APf29gGAfXcBAAAAA3JoYxI1KB7/MiUb/DIlHf81JxD/HBeG/wAA0/8AAMz/AADN/wAAzf8AAM3/AADM/wQEzv8AAMn/iYnn///////7+/7///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v///////////////////////////////////////////////////////////////////v7+//7+///7+/7//f3+///////m5vr/ZWXg/wMDzP8AAMr/AQHN/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AQHN/wMDzf8AAMz/AADJ/wwMzv9ra+H/2tr3///////+/v7/+fn7//z8/v////7/+/v6/8C8uf9oX1j/LB4U/0tAN////////Pz8//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z8/P//////cGdg/y4gFv8zJhz/LyIY/FFGPf7///8GDAAABOXk4wFnX1kBPTEnBBwNAwA7LiXeMiQa/zMmHP8yJRj/LCJM/wAA2f8AAMr/AADM/wAAzf8AAM3/AADN/wAAzP8DA83/AADJ/2xs4f//////+vr+///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v/////////////////////////////////////////////////////////////////////////////+/v7///////z8/v/9/f7///////b2/f+Jief/ExPQ/wAAyf8AAMz/AwPN/wAAzf8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AgLN/wICzf8AAMr/AADJ/yQk1P+Rken/8PD8///////+/v7/+fn7//7+////////+Pj4/6iinv+sp6P///////39/f///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//z7+///////PC8m/zUoHv8zJhz/LB8V/2phWsZOQzoAlY6JBP///wAAAAAAT0Q8AkE1KwBBNSyWMiQa/zMmHP8yJR7/NSge/wMDzf8AAMr/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AgLN/wAAyf9TU9z///////r6/v///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v////////////////////////////////////////////////////////////////////////////////////////7+/v///////Pz+//z8/v/+/v7//////7a28P81Ndf/AADK/wAAyv8CAs3/AgLN/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8AAM3/AwPN/wAAzP8AAMn/AADL/zw82P+qqu7/+Pj9//7+///+/v3/+fn8///////+/v7//v7+//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////X1NL/JRgN/zUoH/80Jx3+MSQZ/4uEfnWvqqYAysfEAgAAAACnp6cAYVdQAWVcVQBLPzdCMyYc/zMmHP0yJR7/NigP/xMPo/8AAM//AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wICzf8AAMr/PDzX//7+/v/7+/7//v7+//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v///////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/f7/+/v+//7+/v//////4eH5/2tr4f8JCc7/AADJ/wAAzP8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8BAc3/AwPN/wAAzP8AAMn/BATM/01N2/+1tfD/+/v+//7+//////7/+/v+//z8/v/+/v7///////7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////f39//////+Si4b/KRsR/zMmHP8yJRv8PTEo/+Ph4CX///8A7u3tAQAAAAAAAAAASz81ASseEwT///8CNyog+zIlG/wyJhz/MyYU/yYeY/8AANj/AADL/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8BAc3/AADL/yYm0//19f3//Pz+//7+/v/+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v///v7///7+/v/7+/7//f3+//7+/v/5+f3/trbw/wUFzf8BAc3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8CAs3/AwPN/wAAy/8AAMn/BgbN/1BQ3P+3t/D/+vr+//7+/v///////Pz+//v7/v/+/v7///////7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//Pv7//////9OQjr/MiUb/zMmHP8uIBb+WlBI7AAAAABfVU0EzcnHAQAAAAAAAAAAaGBZAUo+NQM2KR8APzMquTEkGv8zJhz/MiUd/zMnJ/8BAtL/AADK/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AADN/wEBzP8UFM//6Oj6//39/v/+/v7///////7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////n5/f//////YmLf/wAAy/8BAc3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wAAzf8CAs3/AwPN/wAAy/8AAMn/BgbN/0pK2/+rq+7/9vb9/////////////f3+//r6/v/9/f7//v7+//7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+/+Ti4f8oGxD/Nikf/zQnHf8tIBb/fnVvnYZ/eQC3sq8D5OPjAAAAAAAAAAAA4+PjAF1SSgFUSUAARzwyWzIlG/8zJhz9MiUe/zYoEP8QDqr/AADO/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8DA83/CAjM/9XV9v///////f3+///////+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/+/v7/+vr+//////9AQNj/AADK/wEBzf8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8CAs3/AgLN/wAAy/8AAMn/AADM/zo62P+Wlur/5+f6///////+/v7//v7+//v7/v/9/f7///////7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//////52Xkv8oGg//NCcd/zMmHPw5LCL/t7OwOv///wDr6ukBAAAAAAAAAAAAAAAAAAAAAFhNQAEZCwADioJ9CzYpH/8yJRv8MiYc/zMmFP8mHmP/AADY/wAAy/8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AwPN/wAAyv+/v/L///////z8/v///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//7+/v/7+/7/9/f9/ykp1P8AAMv/AQHN/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8CAs3/AwPN/wAAzP8AAMn/AADK/yMj0/97e+T/0ND1///////+/v7//v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/8+/v//////01COf8zJhz/MyYc/y8hF/1SRz/xAAAAAEk9NATOy8kBAAAAAAAAAAAAAAAAAAAAAFpORgFGOjEDNSgfAD0xJ7wxJBr/MyYc/zIlHv80KCH/AwPP/wAAyv8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wQEzf8AAMn/qKju///////8/P7///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v////////////////////////////////////////////////////////////////////////////////////////////////////////7+/////////v7+//39/v/p6fr/FhbP/wEBzP8AAM3/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wEBzf8CAs3/AwPN/wMDzf8AAM3/AADM/wAAyf8AAMf/AADJ/ysr1f+xse////////39/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////3NrY/ycZDv81KR//NCcd/y4gFv93bmeefnZvAKumogL29PMAAAAAAAAAAAAAAAAAAAAAAGFhYQBbUUkBWE5GAEg8M1MyJRv/MyYc/TIlHf81KA//FhKc/wAA0P8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8EBM3/AADJ/46O6P//////+/v+///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v///////////////////////////////////////////////////////////////////////////////////////////////////v7////////9/f7//////9fX9/8ICMz/AwPN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AADN/wAAzf8AAM3/AQHN/wICzf8DA83/BATN/wICzf8AAM3/AADL/wAAyv8AAMn/AADK/wMDzf8pKdT/WVne/5iY6v/Q0PX/+vr+///////+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//39/f//////iYJ8/yodEv8zJhz/MyYc/DsuJf/Fwb45////AOLg3wF9fX0AAAAAAAAAAAAAAAAAAAAAAOPexwA/MyoBLR8VBP///wI4KyH3MiUb/TMmHP8yJRj/LCNJ/wAA2f8AAMr/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AwPN/wAAyf90dOP///////r6/v///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////w8Pz/wAAyv8FBc3/AQHN/wEBzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8BAc3/AQHN/wEBzf8BAc3/AgLN/wMDzf8DA83/AwPN/wMDzf8CAs3/AADM/wAAzP8AAMv/AADK/wAAyf8AAMn/AADK/woKzv8jI9P/UFDc/4KC5v+wsO//4eH5//z8/v///////v7+//7+/v//////+/v+//v7/v/9/f7///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//z8+///////Oi0j/zUoHv8zJhz/LiAW/llPR+YAAAAAZFpSBLSysQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABjWFABTEA3Az4xKAA/MymgMSQa/zMmHP8yJR7/NigU/woIvv8AAMv/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wMDzf8AAMn/WFjd///////6+v7///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v///////////////////////////////////////////////////////////////////////////////////////////////////f3+//////+UlOr/AADF/wEByv8AAMn/AADK/wAAyv8AAMr/AADL/wAAy/8AAMv/AADL/wAAy/8AAMv/AADL/wAAy/8AAMv/AADL/wAAyv8AAMr/AADK/wAAyv8AAMn/AADJ/wAAyf8AAMr/AADL/wAAzP8MDM//JSXU/z8/2P9aWt7/goLm/6ys7v/Ly/T/6+v7///////+/v7///////7+/////////v7+//v7/v/7+/7//Pz+//7+/v/+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+6trP/JRcN/zQoHv80Jx3+MCIY/4B4cn2dlpIAt7KvAvf39gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABjVVUAb2ZgAbCsqQBSRz8uNCcd/zMmHPwyJRz/NCYT/yMccf8AANb/AADM/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8CAs3/AADK/0BA2P//////+vr+//7+/v/+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMz/+fn9//v7/v/+/v///////////////////////////////////////////////////////////////////////////////////////////////////v7+//7+/v+7u/H/srLv/5mZ6v+Njej/f3/l/3V14/9sbOL/Y2Pg/1pa3v9UVN3/UFDc/05O3P9NTdz/T0/c/1NT3f9ZWd7/YWHf/2xs4v90dOP/f3/l/42N6P+amuv/sLDv/8nJ9P/e3vj/6ur6//j4/f///////v7+//////////////////7+/v///////f3+//v7/v/7+/7//Pz+//39/v/+/v7//v7///7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//Pz8//////9aUEj/MSQa/zMmHP8xJBr8RDgv/////xYAAAACubSwAXNzcwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVUpBAT8zKQQcDQIAPTAn1zEkGv8zJhz/MiUe/zQnIv8DA9D/AADK/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AQHN/wAAy/8sLNT/9vb9//z8/v/+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+srO7/AADJ/wICzf8AAMz/AADM/wAAzP8AAMz/AADM/wAAzP8AAMz/AADM/wAAzP8AAMz/AADM/wAAzP8AAMz/AADM/wAAzP8AAMz/AADM/wMDzf8AAMz/+fn9//v7/v/+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//f3+//v7/v/7+/7/+/v+//v7/v/8/P7//f3+//7+/v/+/v7//v7////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//////9za2P8nGQ7/Nikf/zMmHP8sHxX/b2Vev1FFPQCXkYwDwr67AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmpONAF5VTQFSRz8ASDwzXzIlG/8zJhz9MiUd/zUnEP8bFo3/AADS/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wEBzf8AAMz/GRnQ/+vr+//9/f7//v7+///////+/v///////////////////////////////////////////////////////////////////////////////////////////////////v7+//////+8vPH/IyPT/zMz1v8xMdb/MTHW/zEx1v8xMdb/MTHW/zEx1v8xMdb/MTHW/zEx1v8xMdb/MTHW/zEx1v8xMdb/MTHW/zEx1v8xMdb/MTHW/zQ01v8wMNb/+vr+//z8/v/+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+//7+/v/+/v7//f3+//39/v/9/f7//f3+//z8/v/8/P7//Pz+//z8/v/8/P7//Pz+//z8/v/8/P7//Pz+//39/v/9/f7//f3+//7+/v/+/v7//v7+//7+/v/+/v7//v7///7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/9/fz//////3duaP8tHxX/MyYc/zMmHP04KyL/s6+rQf///wDh394B////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjY2NAEQ3LQEsHhQEAAAAADgrIfIyJRv9MyYb/zIlHP8yJi//AAHV/wAAyv8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AgLM/woKzf/b2/f///////39/v///////v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/9/f3/7Ovq/yweFP82KR//MyYc/y4gFv9aT0fdAAAAAGpgWQTPzMsBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAF1SSwFRRj4CQjYtAEI2LIIyJRr/MyYc/jIlHv81KA//FhKc/wAA0P8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wMDzf8AAMv/xcXz///////8/P7///////7+/////////////////////////////////////////////////////////////////////////////////////////v7////////9/f7/+/v+//v7/v/7+/7/+/v+//v7/v/7+/7/+/v+//v7/v/7+/7/+/v+//v7/v/7+/7/+/v+//v7/v/7+/7/+/v+//v7/v/7+/7/+/v+//v7/v/7+/7//v7+//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//39/f//////iIF7/yodEv8zJhz/NCcd/TMmHP+RioRgw7+8AMXBvgHn5uUBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGRkZAA+NjIBDwEAA3xzbQ83KiD/MiUb/DMmG/8yJRv/MCU2/wAA1/8AAMr/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8EBM3/AADJ/6ys7v///////Pz+///////+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////38/P/z8vH/LyIX/zYpH/8zJhz/LyEX/VNIP/EAAAAARDguBKajoQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVSUEBTkI5Aj0xJwBANCuZMSQa/zMmHP8yJR7/NSgP/xUSn/8AAND/AADM/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/BATN/wAAyf+UlOr///////v7/v///////v7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//f39//////+MhH//KhwS/zMmHP80Jx3+MCMZ/4d/eXaknpoAvrq3AtHNygEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABuamUA3uHdAQAAAAJuZF0UNikf/zIlG/wzJhv/MiUc/zElM/8AANf/AADK/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wMDzf8AAMn/eXnk///////6+v7///////7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////f39//Dv7/8uIBb/Nikf/zIlG/8vIhj9TkI69P///wMrHRMEY2FgAVNTUwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATUQ+AU5COQI+MSgAQDQrmzEkGv8zJhz/MiUd/zUnD/8ZFZT/AADR/wAAzP8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8DA83/AADJ/15e3///////+vr+///////+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/9/f3//////352b/8rHhT/MyYc/zQnHf4wIxn/g3t1d5yXkgCyrqoC0M3LAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAX1tXAP///wEGAAACc2liEjYqIP8yJRv8MyYb/zIlHf8zJyf/AgLT/wAAyf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AgLN/wAAyv9ERNn///////r6/v/+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////+/v7/4+Lg/ykbEf82KR//MyYc/y8iF/1RRj70////AjYqIAR5b2oBwsK7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFBFPQFSRz4CQjYtAEM3LY0yJBr/MyYc/zIlHf80JxH/IBp6/wAA1f8AAMz/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wEBzf8AAMv/Li7V//r6/v/7+/7//v7+//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//z8/P//////Y1pS/y8iGP8zJhz/NCcd/jIlG/+Si4Zvu7e0AMvHxQG9urcBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKJhABmXlcAIxUKA7u2sgc3KyH2MiUb/TMlG/8yJR7/NSgY/wgHxv8AAMr/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8BAc3/AADM/xwc0f/u7vv//f3+//7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+///////GwsD/JRcN/zUoHv8zJhz/LiEW/lZLQ+IAAAAAXFJKBFhLRAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVS0IBWE1GAUxBOABGOjFrMiUb/zMmHP4zJhz/MyUX/yohU/8AANn/AADK/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wICzP8ODs7/39/4//7+/v/9/f7///////7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////Pv7//////9CNi3/NCcd/zIlG/8zJhz9Nysh/6Wfm0n///8A9PT0AdTRzwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACVgX4AAAAAATgrIQQAAAAAOy4k3jEkGv8zJhz/MiUe/zYoD/8UEaX/AADP/wAAzP8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8DA83/AgLL/83N9f///////f3+///////+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/9/f3//////5ONh/8oGxD/NCcd/zMmHP8sHxT/Zl1VxisdEwCCe3UEkImEAYGBgQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAX1RMAXxxZwGGfXYAUUY+OjQnHf8zJhz8MyYb/zIlHf8zJyj/AgLT/wAAyf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/BATN/wAAyf+1tfD///////z8/v///////v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////+/v7/4uHf/ykbEf82KR//MiUb/zEkGvxEOC//6OfmJ////wD///8B4+LhAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATEtLADcqIAFKPjUDNyogAEAzKqoxJBr/MyYc/zImHP80JhP/Jh5n/wAA2P8AAMv/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wQEzf8AAMn/mZnq///////7+/7///////7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z7+///////Ukc//zEkGv8yJRv/NCcd/i8iGP9+dW+Ji4N9AK2nowKinpwBnH9/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHZtZgBFOTAAIBMHA5KKhws4KyH4MiUb/DMmG/8yJR//NigQ/xEPq/8AAM7/AADM/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8DA83/AADJ/4CA5v//////+/v+/////v/+/v7////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//f39//////+dl5L/JxkP/zQnHf8zJhz/LiAW/lVLQucAAAAAVElABO7t7QD49/cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABJPjUBaF5XAVxRSgBLQDdaMyYc/zMmHP0zJhv/MiUd/zQnJv8DA9H/AADJ/wAAzf8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AwPN/wAAyf9lZeD///////v7/v///////v7+//7+/v/+/v7//v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/+/v7//v7+/9/d2/8oGxD/Nikf/zIlG/8zJhz8PC8m/7q1sj////8A////Ab24tQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACOhoIAAAAAAUc7MgQvIRYAPzMpuzEkGv8zJhz/MyYc/zMmFf8pIFf/AADZ/wAAyv8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wICzf8AAMr/R0fZ/////v/19fj//f39///////+/v7//v7+//7+/v/+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////7+/v//////0c7Mv8zJhz/MiUb/zQnHf8tIBb/e3NtoXBmYACinZgDf3dwAc7NzQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZVxVAT4xKAAbDQEDhn55DjgrIvkyJRv8MyYb/zIlHv81KA//GhWQ/wAA0/8AAMz/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8BAc3/AADL/y8v1P/6+vf/5OPk/+vq6f/z8/L/+/v6///////+/v7///////7+/v/+/v7//v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////z8/P//////fXRu/yodEv8zJx3/MyYc/y0gFv1WS0Pp////AUk+NgTBvboA4+LhAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEg8NAFvZ2ABZFpTAE1COUwzJhz/MyYc/DMlG/8yJR//NigV/wwKvP8AAM7/AADK/wAAyv8AAMz/AADM/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAMz/AQHN/wAAzP8dHdH/7u30/+jn5P/m5eT/5uXk/+no5//w8O//+fj4//7+/v/+/v7///////7+/v/+/v7//v7+//7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7//v7+//////+3sq//JRcM/zUpH/8yJRv/MiUb/D8yKf/AvLky////AP///wG9ubYBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIJ8ZwAAAAABTEA4AzouJQBDOC+eMSQa/zMmHP8zJhv/MiUb/zImLv8ODLn/AgLO/wAA2f8AANX/AADO/wAAyv8AAMr/AADM/wAAzP8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wAAzf8CAsz/DxDP/9vb7//r6uX/5uXm/+jn5v/n5uX/5uXk/+jn5v/u7u3/9/b2//39/f///////v7+//7+/v/+/v7//v7+//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v/+/v7//v7+/+Lh3/8rHRP/Nikf/zIlG/80Jx3+MSQa/4mBe4KclZAAtK+rAm5oZAGampoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABpX1kBTEE5ADQnHgQAAAAAPDAm3TEkGv8zJhz/MyYc/zIlGv88Lhf/NCgi/y0jSv8eGXz/EA2q/wQEy/8AANn/AADW/wAAz/8AAMv/AADK/wAAy/8AAMz/AADM/wAAzP8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AwPN/wUFzf/Ew+j/8O/m/+Xk5f/o5+b/6Ofm/+jn5v/n5uX/5uXk/+fm5f/s6+r/9PTz//z8+////////v7+//7+/v/+/v7//v7+//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////7+/v/+/v7/0A0Kv8zJh3/MiUb/zQnHf8sHxX/aF5XyAAAAAB6cWsE2NTRAOrp6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACZmZkAVUtCAQAAAAAAAAACY1pSHTYpIP8yJRv7MiUc/zMmHP8xJB3/OCsl/zIkGP81JxL/NigQ/zUoHP8vJED/IRtx/xQQoP8GBsX/AADY/wAA1/8AANH/AADL/wAAyv8AAMv/AADM/wAAzP8AAMz/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzf8AAM3/AADM/wMDzf8AAMv/paXe//Tz5//k4+X/6Ofm/+fm5f/o5+b/6Ofm/+jn5v/n5uX/5uXk/+bl5P/q6ej/8vHx//r6+v/+/v7//v7+///////+/v7//v7+//7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////v7+///////X1VO/y4hF/8zJhz/MyYc/y4hF/xPRDvz////CyMWDQSNiIQAyMTCAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApqKgAD4xKAFkWlQBYlhQAE5DOk40Jx3/MyYc/DIlG/8zJhz/MiUb/zksIv8xJBv/MiUe/zIlHv8yJRr/NCYT/zYoD/82KBf/MSY2/yQdZf8WEpb/CQi+/wAB1f8AANj/AADS/wAAzP8AAMr/AADL/wAAzP8AAMz/AADM/wAAzf8AAM3/AADN/wAAzf8AAM3/AADN/wAAzP8EBM3/AADK/4yL2//39uf/4+Ll/+jn5v/n5ub/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/5uXk/+bl5P/o5+b/7+/u//j39//+/v7////////////+/v7//v7+//7+/v/+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////Pz8//////+BeXL/KBsQ/zQnHf8yJRv/MSQa+0A0Kv+5tLEz////AP///wGTjIcBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGxjXgD///8AU0g/A01BOABIPDSFMiUb/zMmHP0yJRv/MyUb/zMmHP84KyL/MSQa/zMmHP8yJRz/MiUc/zIlHv8yJR7/MiUb/zQmFP81KBD/NigU/zMnLf8oH1r/GRWL/wsKtv8BAtL/AADZ/wAA1P8AAM3/AADK/wAAyv8AAMz/AADM/wAAzP8AAM3/AADN/wAAzf8AAMz/AwPN/wAAy/9yctj/+Pfn/+Pi5f/o5+b/5+bl/+jn5v/o5+b/6Ofm/+jn5v/n5uX/6Ofm/+jn5v/o5+b/5+bl/+bl5P/n5uX/7ezs//b19f/9/fz///////7+/v/+/v7//v7+//7+/v/+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/Pz//////5+ZlP8lFw3/NSkf/zIlG/8zJhz9NSge/5WPimy5tLEAvLi1AkY8MwHV1NMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABnXVYBVElBAEQ4LgQhEwcAQTUstDEkGv8zJhz/MiUb/zIlG/80Jx3/Nysh/zIlGv8zJhz/MiUb/zMmHP8yJRz/MyYc/zImHP8yJR3/MiUe/zIlHP8zJhb/NScQ/zYoEv80Jyb/KyFQ/x4YgP8PDa3/AwPO/wAA2f8AANX/AADP/wAAyv8AAMr/AADL/wAAzP8AAM3/AADM/wMDzf8AAMv/WVnW//f25//j4uX/6Ofm/+fm5f/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/n5uX/6Ofm/+jn5v/o5+b/5+bl/+bl5P/m5eT/6+rp//Pz8v/7+/v///////7+/v///////v7+//7+/v/+/v7////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////39/f//////trKu/yUXDP82KR//MiUb/zQnHf4vIhf/fHNtm29lXgCYko4D7enlAOTi4gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACwsLAAY1lRAUtAOQA4LCMFAAAAADwwJ9YxJBr/MyYc/zMmHP8yJRv/NSge/zYpIP8yJRv/MyYc/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zImG/8yJhz/MiUd/zIlHv8yJR3/MyUX/zUnEf82KBD/NSgf/y0jRf8gGnX/Eg+k/wYFyf8AANj/AADX/wAA0P8AAMv/AADK/wAAy/8CAs3/AADL/0ND0//z8ub/5OPl/+jn5v/n5uX/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/5+bl/+bl5P/m5eT/6eno//Hw8P/5+fj//v7+//7+/v///////v7+//7+/v/+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////f39///////GwsD/JhgN/zYqIP8yJRv/NCcd/y0fFf9oX1e/FQcAAHx0bgWoop4A1NHPAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFBFPAEoGxEAIhUKBI+Iggw6LiTtMSQa/TMmHP8zJhz/MiUb/zYpH/82KiD/MiUb/zMmHP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRz/MiYc/zIlHf8yJR7/MiUe/zIlGf80JhL/NigP/zYpGf8vJTv/Ixtq/xURmv8IB8P/AADW/wAA2P8AANL/AQHM/wAAyf8vL8//7Ovl/+bl5f/n5uX/5+bl/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+fm5f/m5eT/6Ofm/+7u7f/39vb//v39/////////////v7+//7+/v/+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/f3//////87Lyf8oGhD/Nikg/zIlG/80Jx3/LB4U/15UTN3///8BWU9HBYB4cgC4tLEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPX09AA9MScB5uXkAQAAAAJrYlsdOS0j+jIlGvwzJhz/MyYc/zIlG/82KSD/Niog/zIlG/8zJhz/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zMmHP8yJRz/MiUe/zIlHv8yJRr/NCYU/zYoD/82KRb/MSYy/yceXv8YFI//Cgm6/wEB1f8AANj/GhrW/+Df5f/p6OP/5eTj/+fm5f/n5uX/5+bl/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+fm5f/m5eT/5+bl/+zr6//09PP//Pz8///////+/v7//v7+//7+/v/+/v7//v7+///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////39/f//////0s/N/ykcEf82KR//MiUb/zMnHf8tHxX9VUpC8P///xAAAAADBQAAAJaRjQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACbmJYAIRMHAXFoYgH///8AWE5GLTYpH/8yJRv7MyYc/zMmHP8yJRv/Nikg/zYqIP8yJRv/MyYc/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlHP8zJhz/MiUc/zIlHf8yJR7/MiUc/zMmFf81JxD/NikS/zMnKv8qIVT/GhWE/xgWs//S0ej/9fXz//Dw7//p6Of/5eTj/+Xk4//m5eT/5+bl/+fm5f/n5uX/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/5+bl/+jn5v/o5+b/6Ofm/+fm5f/m5eT/5uXk/+vq6f/y8vH/+vr6///////+/v7///////7+/v/+/v7//v7+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////f39///////PzMr/KhwS/zYpH/8yJRv/MyYc/y4gFvxPRDv27ezrGQAAAAL///8BenRvAb29vQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAb2hhAAAAAAFjWVIBi4N/AFRJQTc2KR//MiUb+zMmHP8zJhz/MiUb/zYpH/82KSD/MiQa/zMmHP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRz/MyYc/zImHP8yJR3/MiUe/zIlHf8zJhf/NScR/zYoEP8xJCP/YlhP/5GLhv/Cvrv/5+bl//Pz8//y8fH/6+rp/+Xk4//l5OP/5uXk/+fm5f/o5+b/5+bl/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+fn5v/m5eT/5uXk/+no5//w7+//+Pj3//7+/v/+/v7///////7+/v/+/v7//v7+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/fz//////8jEwv8oGhD/Nikf/zIlG/8zJhz/LiEW+0o+NfvOysgiAAAAAf///wEzLCgB7+7sAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGleWQC5q6EAYVdPApaOhwBdU0w+Nyog/zIlG/szJhz/MyYc/zIlG/81KB7/Nysh/zEkGv8zJhz/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zIlHP8yJhz/MiUd/zIlHv80Jx7/LyIY/ykbEf8mGA3/Mycd/1ZMRP+Gfnj/uLSw/+Hg3//y8vH/8/Ly/+zs6//m5eT/5ePi/+bl5P/n5uX/5+bl/+fm5f/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/n5uX/5uXk/+jn5v/u7ez/9vX1//39/f///////v7+//7+/v/+/v7//v7+//7+/v/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////z8/P//////uraz/yYYDf82KR//MiUb/zMmHP8uIRb7Sj42/8G+uyr///8A19TSAQAAAAHu7ewAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABvZl8Bg3pzAGBWTwKUjYcAXlNMPjYpIP8yJRv7MyYc/zMmHP8yJRv/NCcd/zgrIv8xJBr/MyYc/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8yJRv/MyYc/zMnHf81KB7/NSge/zEkGv8qHRL/JhgN/y8iF/9NQjr/enJs/62opP/c29n/8vLx//Pz8v/t7ez/5+bl/+Xj4v/m5OP/5+bl/+jn5v/n5uX/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+fm5f/o5+b/6Ofm/+jn5v/n5uX/5uXk/+fm5f/s6+r/8/Py//z7+////////v7+//7+/v/+/v7//v7+//7+/v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v//////+/v7//////+ln5r/JRcM/zYpIP8yJRv/Mycd/y4gFvxJPjX8wr27Kv///wDNyMUBAAAAAc/KyQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfXVvAY2CegBeVE0CkYiCAFRKQjY2KSD/MSQa+zMmHP8zJhz/MiUb/zMmHP85LCL/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MiUb/zMmHP8zJhz/NSge/zUpH/8yJRv/LB4U/yYYDf8sHhT/Sj41/3VtZv+moZz/1dLQ/+/u7v/09PT/7+7u/+fm5f/l5OL/5eTj/+fm5f/n5uX/5+fm/+fm5f/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+fn5f/o5+b/6Ofm/+jn5v/n5uX/5uXk/+bl5P/q6ej/8fHw//r5+f///////v7+///////+/v7//v7+//7+/v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+//7+/v/7+/v//////4d/ev8lFwz/Nikg/zIlG/80Jx3/LB8V/E9EO/jHxMEkAAAAAcTAvQH///8A3NrYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH93cQGMhH0AYVdPAvfz8gBjWVIsOy4l+zEkGvwzJhz/MiUb/zMmHP8yJRv/OSwi/zMmHP8yJRv/MyYc/zIlG/8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zQnHf81KR//MyYc/ywfFf8nGQ7/KRsR/0A0K/9qYFn/nZiT/8/Myv/q6ej/8/Pz//Hx8P/p6Of/5eTi/+Xk4//m5eT/5+bl/+jn5v/n5uX/6Ofm/+jn5v/o5+b/6Ofm/+fn5v/o5+b/6Ofm/+jn5v/o5+b/5+Xk/+bl5P/o5+f/7+7u//f39//+/v7////////////+/v7//v7+//7+/v/+//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7+/v///////v7+//z8/P/9/f3/ZVxU/ygaEP82KR//MiUb/zQnHf8rHhT9VktD9Ofm5BwAAAAC0MvIAQAAAADY1tUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABtZF0AjoeCAF5UTAEAAAABcWliHT0wJ+8xJBn9MyYc/jIlG/8zJhz/MiUb/zgrIf81KB7/MiUb/zMmHP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP80Jx3/NSkf/zQnHf8uIRf/JxoP/ygaD/84LCL/W1FJ/4uEfv/Ewb7/6Ofm//Pz8v/y8vL/6+rq/+Xk4//l5OP/5uXk/+fm5f/o5+b/5+bl/+jn5v/o5+b/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/5+bl/+bl5P/n5uX/7ezr//X09P/9/f3///////7+/v/+/v7//v7+//7+/v/+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/Pz//////+nn5v9EOC//LSAW/zQoHv8yJRv/NCcd/iweFP9fVU3k////EwAAAAPi3tsBAAAAAcrGxQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeG1nAP///wB3bWYBEwUAA5yWkAs/MyrZMCMZ/zMmHP0yJRv/MyYc/zIlGv82KR//Nyoh/zEkGv8zJhz/MiUb/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/NCcd/zUoH/81KB7/MCMZ/ykcEf8mGA3/NSge/1ZMQ/+BeXP/tbCt/+Lh3//x8fD/8/Pz/+3t7P/m5eT/5eTi/+bk4//n5uX/5+bl/+fm5f/o5+b/6Ofm/+jn5v/n5uX/6Ofm/+jn5v/o5+b/5+bl/+bl5P/m5eT/6+rp//Py8v/7+/v///////7+/v///////v7+//7+/v/+/v7////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+/v7///////v7+///////wb26/y0fFf8zJhz/MyYc/zIlG/80Jx39LSAW/2lfWMj///8DSD84BP///wEMAwAB6unpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAG9oYgAMAAABppyUATQpIAQAAAAARjoxtzEkGv8zJhz8MyYc/zMmHP8yJRv/NCcd/zksIv8yJRv/MiUb/zMmHP8yJRv/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP8zJhz/MyYc/zMmHP81KB7/NSge/zEkGv8rHRP/JRgN/y8hF/9MQDj/dGtl/6einv/X1dP/7e3s//T08//v7u7/6Ofm/+Xk4//l5OP/5+bl/+fm5f/n5uX/6Ofm/+jn5v/o5+b/6Ofm/+jn5v/o5+b/5+bl/+bl5P/m5eT/6ejn//Dv7//5+fj//v7+//7+/v///////v7+//7+/v/+/v7//////////////////////////////////////////////////////////////////////////////////////////////////////////////////v7+///////9/f3//Pz7//////+IgXv/JBcM/zYpH/8yJRv/MyYc/zIlG/wzJhz/e3JspQ8AAAB0a2QF////AWFY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AAAAAAAUP///////////////////6AAAAAAAAAAAF///////////////////QgAAAAAAAAAAQP/////////////////9EAAAAAAAAAAACL/////////////////0QAAAAAAAAAAAAi/////////////////SAAAAAAAAAAAAAAv///////////////9IAAAAAAAAAAAAAAL///////////////0gAAAAAAAAAAAAAAC///////////////gAAAAAAAAAAAAAAABf/////////////+kAAAAAAAAAAAAAAACX/////////////6QAAAAAAAAAAAAAAAAh/////////////0AAAAAAAAAAAAAAAAAC/////////////SAAAAAAAAAAAAAAAAAEf///////////+gAAAAAAAAAAAAAAAAAAX///////////9QAAAAAAAAAAAAAAAAAAr///////////0gAAAAAAAAAAAAAAAAAAT///////////oAAAAAAAAAAAAAAAAAAABf//////////UAAAAAAAAAAAAAAAAAAACv/////////+oAAAAAAAAAAAAAAAAAAABX/////////8QAAAAAAAAAAAAAAAAAAAAr/////////4AAAAAAAAAAAAAAAAAAAAAB/////////4AAAAAAAAAAAAAAAAAAAAAA/////////UAAAAAAAAAAAAAAAAAAAAAAf///////+oAAAAAAAAAAAAAAAAAAAAAAf////////QAAAAAAAAAAAAAAAAAAAAAAn///////+gAAAAAAAAAAAAAAAAAAAAAAT///////5AAAAAAAAAAAAAAAAAAAAAAAB///////yAAAAAAAAAAAAAAAAAAAAAAAA///////gAAAAAAAAAAAAAAAAAAAAAAABf//////QAAAAAAAAAAAAAAAAAAAAAAACv/////+oAAAAAAAAAAAAAAAAAAAAAAABX/////9QAAAAAAAAAAAAAAAAAAAAAAAAv/////+gAAAAAAAAAAAAAAAAAAAAAAAAT/////5AAAAAAAAAAAAAAAAAAAAAAAAAJ/////0AAAAAAAAAAAAAAAAAAAAAAAAAC/////qAAAAAAAAAAAAAAAAAAAAAAAAAF/////kAAAAAAAAAAAAAAAAAAAAAAAAACf////IAAAAAAAAAAAAAAAAAAAAAAAAABP///+gAAAAAAAAAAAAAAAAAAAAAAAAAAX///+QAAAAAAAAAAAAAAAAAAAAAAAAAAn///8gAAAAAAAAAAAAAAAAAAAAAAAAAAT///+AAAAAAAAAAAAAAAAAAAAAAAAAAAX///5AAAAAAAAAAAAAAAAAAAAAAAAAAAJ///yAAAAAAAAAAAAAAAAAAAAAAAAAAAA///yAAAAAAAAAAAAAAAAAAAAAAAAAAAE///kAAAAAAAAAAAAAAAAAAAAAAAAAAACf//wAAAAAAAAAAAAAAAAAAAAAAAAAAACf//IAAAAAAAAAAAAAAAAAAAAAAAAAAABP//AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/+QAAAAAAAAAAAAAAAAAAAAAAAAAAAAn/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAT/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAT/5AAAAAAAAAAAAAAAAAAAAAAAAAAAAAJ/5AAAAAAAAAAAAAAAAAAAAAAAAAAAAAJ/6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAF/yAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE/0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/kAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAACfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAABfIAAAAAAAAAAAAAAAAAAAAAAAAAAAAABfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABPQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAuQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAuAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABPIAAAAAAAAAAAAAAAAAAAAAAAAAAAAABfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAABfgAAAAAAAAAAAAAAAAAAAAAAAAAAAAACfkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC/0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/yAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE/6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAF/5AAAAAAAAAAAAAAAAAAAAAAAAAAAAAJ/5AAAAAAAAAAAAAAAAAAAAAAAAAAAAAJ/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAT/8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAT/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/+QAAAAAAAAAAAAAAAAAAAAAAAAAAAAn//AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//IAAAAAAAAAAAAAAAAAAAAAAAAAAABP//wAAAAAAAAAAAAAAAAAAAAAAAAAAACf//kAAAAAAAAAAAAAAAAAAAAAAAAAAACf//yAAAAAAAAAAAAAAAAAAAAAAAAAAAE///yAAAAAAAAAAAAAAAAAAAAAAAAAAAE///5AAAAAAAAAAAAAAAAAAAAAAAAAAAJ///+AAAAAAAAAAAAAAAAAAAAAAAAAAAX///8gAAAAAAAAAAAAAAAAAAAAAAAAAAT///+QAAAAAAAAAAAAAAAAAAAAAAAAAAn///+gAAAAAAAAAAAAAAAAAAAAAAAAAAX////IAAAAAAAAAAAAAAAAAAAAAAAAABP////kAAAAAAAAAAAAAAAAAAAAAAAAACf////qAAAAAAAAAAAAAAAAAAAAAAAAAF/////0AAAAAAAAAAAAAAAAAAAAAAAAAC/////5AAAAAAAAAAAAAAAAAAAAAAAAAJ/////+gAAAAAAAAAAAAAAAAAAAAAAAAT/////9QAAAAAAAAAAAAAAAAAAAAAAAAv/////+oAAAAAAAAAAAAAAAAAAAAAAABX//////QAAAAAAAAAAAAAAAAAAAAAAAAv//////gAAAAAAAAAAAAAAAAAAAAAAABf//////yAAAAAAAAAAAAAAAAAAAAAAAA///////5AAAAAAAAAAAAAAAAAAAAAAAB///////+gAAAAAAAAAAAAAAAAAAAAAAT///////9QAAAAAAAAAAAAAAAAAAAAAAn///////+oAAAAAAAAAAAAAAAAAAAAAAf////////UAAAAAAAAAAAAAAAAAAAAAA/////////4AAAAAAAAAAAAAAAAAAAAAA/////////8AAAAAAAAAAAAAAAAAAAAAB/////////8QAAAAAAAAAAAAAAAAAAAAj/////////+oAAAAAAAAAAAAAAAAAAABX//////////UAAAAAAAAAAAAAAAAAAACv//////////qAAAAAAAAAAAAAAAAAAABf//////////0gAAAAAAAAAAAAAAAAAAT///////////9QAAAAAAAAAAAAAAAAAAr///////////+gAAAAAAAAAAAAAAAAAAX////////////SAAAAAAAAAAAAAAAAAEf////////////0AAAAAAAAAAAAAAAAAC/////////////6QAAAAAAAAAAAAAAAAh/////////////+kAAAAAAAAAAAAAAACX//////////////gAAAAAAAAAAAAAAABf//////////////0gAAAAAAAAAAAAAAC///////////////9IAAAAAAAAAAAAAAL////////////////SAAAAAAAAAAAAAAv////////////////0QAAAAAAAAAAAAi/////////////////9EAAAAAAAAAAACL//////////////////QAAAAAAAAAAAQP//////////////////6QAAAAAAAAAAF///////////////////+iAAAAAAAAAUH////////////////////0EAAAAAAACA//////////////////////BAAAAAABIP//////////////////////6CQAAAAED///////////8=" style={{width:38,height:38,borderRadius:7,objectFit:"contain"}}/>
          <div style={{minWidth:0,overflow:"hidden"}}>
            <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:13,fontWeight:800,color:T.textBright,letterSpacing:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>KITON ENGENHARIA INTEGRADA</div>
            <div style={{fontSize:11,color:T.textMuted,letterSpacing:3,textTransform:"uppercase",fontFamily:"'Rajdhani',sans-serif",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Termografia Industrial</div>
          </div>
        </div>
        <nav className="topnav" style={{display:"flex",gap:4,overflowX:"auto",flexShrink:0,maxWidth:"100%"}}>
          {[["dash","📊","Relatórios"],["form","📝","Novo Relatório"],["cadastros","🗂️","Cadastros"]].map(([v,icon,label])=>(
            <button key={v} onClick={()=>{ if(v==="form") setEditRel(null); setView(v); }}
              style={{padding:"7px 14px",borderRadius:6,border:view===v?"1px solid "+T.accent:"1px solid "+T.borderMuted,cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"'Barlow',sans-serif",
                background:view===v?T.accent:"transparent",color:view===v?T.white:T.textDim,whiteSpace:"nowrap"}}>
              <span>{icon}</span>
              <span style={{marginLeft:4,display:"inline"}} className="hide-mobile">{label}</span>
            </button>
          ))}
          <div style={{width:1,alignSelf:"stretch",background:T.borderMuted,margin:"0 2px"}}/>
          <button onClick={handleExportBackup} title="Baixar backup completo (relatórios + cadastros) em .json"
            style={{padding:"7px 14px",borderRadius:6,border:"1px solid "+T.borderMuted,cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"'Barlow',sans-serif",background:"transparent",color:T.textDim,whiteSpace:"nowrap"}}>
            <span>💾</span>
            <span style={{marginLeft:4,display:"inline"}} className="hide-mobile">Backup</span>
          </button>
          <button onClick={()=>backupInputRef.current?.click()} title="Restaurar dados a partir de um arquivo de backup .json"
            style={{padding:"7px 14px",borderRadius:6,border:"1px solid "+T.borderMuted,cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"'Barlow',sans-serif",background:"transparent",color:T.textDim,whiteSpace:"nowrap"}}>
            <span>📤</span>
            <span style={{marginLeft:4,display:"inline"}} className="hide-mobile">Restaurar</span>
          </button>
          <input ref={backupInputRef} type="file" accept="application/json,.json" onChange={handleImportBackup}
            style={{position:"absolute",opacity:0,width:1,height:1,pointerEvents:"none"}}/>
          <div style={{width:1,alignSelf:"stretch",background:T.borderMuted,margin:"0 2px"}}/>
          <button onClick={()=>syncDrive({silent:false})} disabled={driveSyncing}
            title={driveMeta.lastSyncedAt ? `Última sincronização: ${new Date(driveMeta.lastSyncedAt).toLocaleString("pt-BR")}` : "Ainda não sincronizado neste dispositivo"}
            style={{position:"relative",padding:"7px 14px",borderRadius:6,border:"1px solid "+T.borderMuted,cursor:driveSyncing?"default":"pointer",fontWeight:600,fontSize:13,fontFamily:"'Barlow',sans-serif",background:"transparent",color:driveSyncing?T.textFaint:T.textDim,whiteSpace:"nowrap",opacity:driveSyncing?0.7:1}}>
            <span style={{position:"relative"}}>
              {driveSyncing ? "⏳" : "🔄"}
              <span style={{position:"absolute",top:-2,right:-2,width:7,height:7,borderRadius:"50%",background:driveDotColor,border:"1px solid "+T.panel}}/>
            </span>
            <span style={{marginLeft:4,display:"inline"}} className="hide-mobile">{driveLabel}</span>
          </button>
          <button onClick={handleTrocarContaDrive} disabled={driveSyncing}
            title="Trocar a conta do Google Drive usada neste dispositivo"
            style={{padding:"7px 10px",borderRadius:6,border:"1px solid "+T.borderMuted,cursor:driveSyncing?"default":"pointer",fontWeight:700,fontSize:15,fontFamily:"'Barlow',sans-serif",background:"transparent",color:T.textFaint,opacity:driveSyncing?0.7:1}}>
            ⇄
          </button>
        </nav>
      </header>

      {toast && (
        <div style={{position:"fixed",top:70,right:20,zIndex:9999,background:toast.t==="ok"?T.greenStrong:toast.t==="erro"?T.redDeep:T.blueStrong,
          color:"#fff",padding:"10px 20px",borderRadius:8,fontWeight:600,fontSize:14,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
          {toast.msg}
        </div>
      )}

      {showFirstSyncModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:T.panel,border:"1px solid "+T.borderMuted,borderRadius:10,padding:24,maxWidth:420,width:"100%",boxShadow:"0 12px 40px rgba(0,0,0,.5)"}}>
            <div style={{fontSize:17,fontWeight:800,marginBottom:8,color:T.textBright,fontFamily:"'Rajdhani',sans-serif"}}>🔄 Sincronizar este dispositivo com o Drive?</div>
            <div style={{fontSize:13,color:T.textDim,marginBottom:20,lineHeight:1.6}}>
              Este dispositivo ainda não está conectado ao Google Drive. Sincronizando agora, os relatórios e cadastros salvos na nuvem (ou os daqui, você escolhe qual versão vale) ficam disponíveis aqui, e as próximas atualizações passam a acontecer sozinhas.
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setShowFirstSyncModal(false)}
                style={{padding:"9px 16px",borderRadius:6,border:"1px solid "+T.borderMuted,background:"transparent",color:T.textDim,cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"'Barlow',sans-serif"}}>
                Agora não
              </button>
              <button onClick={()=>{ setShowFirstSyncModal(false); syncDrive({silent:false}); }}
                style={{padding:"9px 16px",borderRadius:6,border:"none",background:T.accent,color:T.white,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"'Barlow',sans-serif"}}>
                Sincronizar agora
              </button>
            </div>
          </div>
        </div>
      )}

      <main style={{maxWidth:1120,margin:"0 auto",padding:"20px 16px 54px"}}>
        {view==="dash" && <Dashboard data={data} onNew={()=>{setEditRel(null);setView("form");}} onEdit={r=>{setEditRel(r);setView("form");}} onDelete={handleDelete} onClone={handleClone} onCompar={c=>{setComparCli(c);setView("comp");}} onPdf={r=>exportPDF(r,data.relatorios)} onJpg={r=>exportJPG(r,data.relatorios)} />}
        {view==="form" && <FormRel initial={editRel} onSave={handleSave} onCancel={()=>setView("dash")} cadastros={data.cadastros} relatorios={data.relatorios} />}
        {view==="comp" && <Comparativo cliente={comparCli} relatorios={data.relatorios} onBack={()=>setView("dash")} />}
        {view==="cadastros" && <Cadastros cadastros={data.cadastros} onSave={handleSaveCadastro} onDelete={handleDeleteCadastro} tab={cadTab} setTab={setCadTab}/>}
      </main>

      <footer style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:T.panel,borderTop:"1px solid "+T.borderMuted,padding:"5px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
        <span style={{fontSize:11,color:T.textMuted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0}}
          title={driveMeta.ownerEmail ? `Banco de dados sincronizado com: ${driveMeta.ownerEmail}` : "Nenhuma conta do Drive sincronizada neste dispositivo"}>
          📁 {driveMeta.ownerEmail || "Nenhuma conta sincronizada"}
        </span>
        <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MENSAGEM)}`}
          target="_blank" rel="noopener noreferrer"
          style={{display:"flex",alignItems:"center",gap:4,padding:"7px 14px",borderRadius:6,background:T.greenStrong,color:T.white,fontWeight:600,fontSize:13,fontFamily:"'Barlow',sans-serif",textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>
          🆘 Ajuda
        </a>
        <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} title={theme==="dark"?"Tema claro":"Tema escuro"}
          style={{padding:"7px 14px",borderRadius:6,border:"1px solid "+T.borderMuted,background:"transparent",color:T.textDim,fontWeight:600,fontSize:13,fontFamily:"'Barlow',sans-serif",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
          {theme==="dark"?"☀️ Claro":"🌙 Escuro"}
        </button>
      </footer>

      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
        body{overflow-x:hidden;}
        input,select,textarea{background:${T.input}!important;border:1px solid ${T.border}!important;color:${T.text}!important;border-radius:7px!important;padding:9px 12px!important;width:100%;font-family:'Barlow',sans-serif;font-size:16px!important;outline:none;transition:border .15s;}
        input:focus,select:focus,textarea:focus{border-color:#CD0000!important;box-shadow:0 0 0 2px rgba(205,0,0,.15)!important;}
        select option{background:${T.input};}
        label{font-size:11px;font-weight:700;color:${T.textMuted};letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:5px;}
        button{font-family:'Barlow',sans-serif;}
        ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:${T.input}} ::-webkit-scrollbar-thumb{background:${T.borderMuted};border-radius:3px}
        .topnav{scrollbar-width:thin;}
        .topnav>*{flex-shrink:0;}
        .topnav::-webkit-scrollbar{height:3px;}
        .hide-desktop{display:none;}
        @media print{body{background:#fff!important;color:#000!important;}}
        @media(max-width:640px){
          .grid-3{grid-template-columns:1fr!important;}
          .grid-2{grid-template-columns:1fr!important;}
          .grid-4{grid-template-columns:1fr 1fr!important;}
          .grid-5{grid-template-columns:1fr 1fr!important;}
          .stats-grid{grid-template-columns:1fr 1fr!important;}
          .card-actions{flex-wrap:wrap!important;}
          .foto-grid{grid-template-columns:1fr!important;}
        }
        /* Cabeçalho: reage à largura real da tela (celular OU janela de navegador estreita), não só a "é celular?" */
        @media(max-width:1050px){
          .hide-mobile{display:none!important;}
          .hide-desktop{display:inline-block!important;}
          .topnav button{padding:7px 9px!important;}
          .topheader{flex-direction:column!important;height:auto!important;padding:10px 16px!important;gap:6px;}
          .topheader-brand{justify-content:center;}
          .topheader .topnav{width:100%;justify-content:center;}
        }
      `}</style>
    </div>
    </ThemeContext.Provider>
  );
}

// ─── EXPORT PDF ───────────────────────────────────────────────────────────────
// Paleta de severidade (5 níveis) para o PDF — sempre em fundo claro, validada para contraste.
const SEV_PDF = [
  { k:"iminente", l:"Falha Iminente", c:"#a21caf", bg:"#fdf4ff" },
  { k:"certa",    l:"Falha Certa",    c:"#dc2626", bg:"#fef2f2" },
  { k:"provavel", l:"Falha Provável", c:"#c2410c", bg:"#fff7ed" },
  { k:"suspeita", l:"Suspeita de Falha", c:"#b45309", bg:"#fffbeb" },
  { k:"normal",   l:"Normal",         c:"#16a34a", bg:"#f0fdf4" },
];
function buildPizzaSVG(counts,total) {
  if(!total||total===0) return "";
  const data=SEV_PDF.map(s=>({l:s.l,v:counts[s.k]||0,c:s.c})).filter(d=>d.v>0);
  const cx=100,cy=100,r=82;
  let svgPaths="";
  if(data.length===1) {
    // Círculo sólido para caso de 100%
    svgPaths='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+data[0].c+'"/>';
  } else {
    let cum=-Math.PI/2;
    svgPaths=data.map(function(d){
      const angle=(d.v/total)*2*Math.PI;
      const x1=cx+r*Math.cos(cum),y1=cy+r*Math.sin(cum);
      cum+=angle;
      const x2=cx+r*Math.cos(cum),y2=cy+r*Math.sin(cum);
      const large=angle>Math.PI?1:0;
      return '<path d="M'+cx+','+cy+' L'+x1+','+y1+' A'+r+','+r+' 0 '+large+',1 '+x2+','+y2+' Z" fill="'+d.c+'" stroke="#fff" stroke-width="2"/>';
    }).join("");
  }
  const svg='<svg viewBox="0 0 200 200" style="width:180px;height:180px;flex-shrink:0;">'+svgPaths+'<circle cx="'+cx+'" cy="'+cy+'" r="24" fill="#f8fafc"/><text x="'+cx+'" y="'+(cy-4)+'" text-anchor="middle" fill="#111" font-size="18" font-weight="800" font-family="Arial">'+total+'</text><text x="'+cx+'" y="'+(cy+10)+'" text-anchor="middle" fill="#6b7280" font-size="8" font-family="Arial">TOTAL</text></svg>';
  const rows=SEV_PDF.map(s=>({l:s.l,v:counts[s.k]||0,c:s.c})).filter(s=>s.v>0)
    .map(function(s){return '<div style="display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid #f0f0f0;"><div style="width:16px;height:16px;border-radius:50%;background:'+s.c+';flex-shrink:0;"></div><div style="flex:1;font-size:15px;color:#374151;font-weight:600;">'+s.l+'</div><div style="font-size:22px;font-weight:800;color:'+s.c+';">'+s.v+'</div><div style="font-size:14px;color:#9ca3af;width:44px;text-align:right;">'+Math.round(s.v/total*100)+'%</div></div>';}).join("");
  return '<div style="margin:16px 36px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:20px 28px;display:flex;align-items:center;gap:32px;flex-wrap:wrap;"><div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.8px;width:100%;margin-bottom:-4px;">Distribuição por Severidade</div>'+svg+'<div style="display:flex;flex-direction:column;gap:4px;flex:1;">'+rows+'</div></div>';
}


function buildReportHTML(rel, todosRelatorios) {
  const rels3 = [...(todosRelatorios||[])].filter(r=>r.cliente===rel.cliente).sort((a,b)=>new Date(b.dataRelatorio)-new Date(a.dataRelatorio)).slice(0,3);
  const fd = d => d ? new Date(d+"T12:00").toLocaleDateString("pt-BR") : "—";
  const sc = {normal:"#16a34a",suspeita:"#b45309",provavel:"#c2410c",certa:"#dc2626",iminente:"#a21caf"};
  const sb = {normal:"#f0fdf4",suspeita:"#fffbeb",provavel:"#fff7ed",certa:"#fef2f2",iminente:"#fdf4ff"};
  const sl = {normal:"🟢 NORMAL",suspeita:"🟡 SUSPEITA",provavel:"🟠 PROVÁVEL",certa:"🔴 CERTA",iminente:"🟣 IMINENTE"};
  const pontos = rel.pontos||[];
  const sevCounts = {
    normal:   pontos.filter(p=>p.severidade==="normal").length,
    suspeita: pontos.filter(p=>p.severidade==="suspeita").length,
    provavel: pontos.filter(p=>p.severidade==="provavel").length,
    certa:    pontos.filter(p=>p.severidade==="certa").length,
    iminente: pontos.filter(p=>p.severidade==="iminente").length,
  };
  // Mantidos para compatibilidade com o texto de alerta abaixo ("intervenção necessária" = certa+iminente)
  const criticos = sevCounts.certa + sevCounts.iminente;
  const alertas  = sevCounts.suspeita + sevCounts.provavel;
  const normais  = sevCounts.normal;
  // Critérios de aceitação — lê o critério CONGELADO no momento da medição (p.criterioSnapshot), não o cadastro
  // atual, para que uma edição futura no cadastro não altere retroativamente relatórios já emitidos.
  // Relatórios salvos antes deste recurso existir (sem criterioSnapshot) caem no fallback legado (objeto NBR).
  const tiposUsados = [...new Set(pontos.map(p=>p.tipoEquip).filter(Boolean))];
  const criteriosUsados = tiposUsados.map(t => {
    const pontoComCriterio = pontos.find(p=>p.tipoEquip===t && p.criterioSnapshot);
    if (pontoComCriterio) return pontoComCriterio.criterioSnapshot;
    const legado = NBR[t] || NBR["Outro"];
    return { nome:t, grupo:t, metodo:"comparativo", oQueComparado:legado.ref, toleranciaAlerta:legado.alerta, toleranciaCritico:legado.critico, mta:"", documentacaoNecessaria:"" };
  });
  const metodoLabel = m => m==="maa" ? "MAA/CFCA" : m==="qualitativo" ? "Qualitativo" : "Comparativo";
  const criterioResumo = c => {
    if (c.metodo==="maa") return `MTA = ${c.mta||"—"}°C · severidade pela razão (T.máx−T.amb)/MAA`;
    if (c.metodo==="qualitativo") return c.documentacaoNecessaria ? `Classificação manual · ${c.documentacaoNecessaria}` : "Classificação manual pelo técnico";
    return (c.toleranciaAlerta!==""&&c.toleranciaAlerta!=null&&c.toleranciaCritico!==""&&c.toleranciaCritico!=null)
      ? `🟡 Suspeita ≥${c.toleranciaAlerta}°C · 🔴 Certa ≥${c.toleranciaCritico}°C` : "Sem tolerância numérica — classificação manual";
  };
  // Numeração das seções da pág. 1: Identificação > Instrumentos (se houver) > Critérios (se houver) > Resumo
  const temInstrumentos = (rel.instrumentos||[]).length>0;
  let __secNum = 1;
  const numIdentificacao = __secNum++;
  const numInstrumentos = temInstrumentos ? __secNum++ : null;
  const numCriterios = criteriosUsados.length>0 ? __secNum++ : null;
  const numResumo = __secNum++;

  function header() { return `
  <div style="background:#ffffff;padding:16px 36px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #CD0000;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <img src="${LOGO_B64}" style="height:64px;object-fit:contain;" alt="Kiton"/>
    <div style="text-align:right;">
      <div style="font-family:'Oswald',sans-serif;font-size:14px;font-weight:700;letter-spacing:1px;color:#1C2633;">RELATÓRIO DE INSPEÇÃO TERMOGRÁFICA</div>
      <div style="font-size:10px;color:#64748b;margin-top:3px;">contato@kitonengenharia.com.br · www.kitonengenharia.com.br</div>
    </div>
  </div>
  <div style="background:#CD0000;padding:8px 36px;display:flex;justify-content:space-between;align-items:center;">
    <span style="color:#fff;font-weight:700;font-size:12px;">${rel.numRelatorio||rel.os||"S/N"} ${rel.os&&rel.numRelatorio?" · OS: "+rel.os:""} — ${rel.cliente||"Cliente"}</span>
    <span style="color:#fff;font-size:11px;">Data: ${fd(rel.dataRelatorio)}</span>
  </div>`; }

  function footer() { return footerPag(); }

  function sec(titulo) { return `<div style="font-family:'Oswald',sans-serif;font-size:13px;font-weight:700;color:#1C2633;margin:20px 36px 8px;padding-bottom:4px;border-bottom:2px solid #CD0000;text-transform:uppercase;letter-spacing:.8px;">${titulo}</div>`; }

  function infoRow(pairs) { return `<tr>${pairs.map(([k,v])=>`<td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:700;background:#f8fafc;width:150px;color:#374151;font-size:12px;">${k}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;font-size:12px;">${v||"—"}</td>`).join("")}</tr>`; }

  // Sub-cabeçalho dentro de uma tabela de infoRow, para separar grupos de campos (ex.: coletado em campo vs. calculado)
  function subRow(label,bg) { return `<tr><td colspan="4" style="padding:${bg?"7px 10px":"10px 10px 4px"};border:none;background:${bg||"transparent"};font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;">${label}</td></tr>`; }

  // Calcular total de páginas
  const numGruposIndice = Math.ceil(pontos.length / 20) || 1;
  const totalPaginas = 1 + numGruposIndice + (pontos.length * 2) + 1;
  // Página (absoluta, 1-indexada) onde começa a ficha do ponto i: capa + páginas de índice + fichas anteriores (2 cada) + 1
  const paginaFichaDoPonto = i => 1 + numGruposIndice + i*2 + 1;
  let paginaAtual = 0;
  function footerPag() {
    paginaAtual++;
    return '<div class="page-footer" style="background:#1C2633;padding:12px 36px;display:flex;align-items:center;justify-content:space-between;">'
      + '<div>'
      + '<div style="font-weight:700;color:#fff;font-size:11px;">KITON ENGENHARIA INTEGRADA LTDA <span style="font-style:italic;font-weight:400;color:#e2e8f0;"> — Inúmeras soluções, uma única empresa</span></div>'
      + '<div style="font-size:10px;color:#e2e8f0;margin-top:2px;">CNPJ 29.234.872/0001-04 · CREA-PR 76327 · Av. Dr. Mario Clapier Urbinati, 1434, Jd. Canadá, 87080-120, Maringá-PR<br/>(44) 4141-0714 · (44) 99731-1914 · contato@kitonengenharia.com.br · www.kitonengenharia.com.br</div>'
      + '</div>'
      + '<div style="font-weight:700;color:#fff;font-size:11px;white-space:nowrap;margin-left:24px;">Página ' + paginaAtual + ' de ' + totalPaginas + '</div>'
      + '</div>';
  }


  // ── PÁGINA 1 ──────────────────────────────────────────────────────────────
  const page1 = `
<div class="page">
  ${header()}
  ${sec(`${numIdentificacao}. Identificação do Relatório`)}
  <div style="padding:0 36px;">
    <table style="width:100%;border-collapse:collapse;">
      ${infoRow([["Cliente",rel.cliente],["Nº Relatório",rel.numRelatorio||"—"]])}
      ${infoRow([["Nº OS",rel.os||"—"],["Data do Relatório",fd(rel.dataRelatorio)]])}
      ${infoRow([["Local / Unidade",rel.local||"—"],["Responsável Cliente",rel.responsavel||"—"]])}
      ${infoRow([["Técnico Responsável",rel.tecnico||"—"],["Nº ART",rel.numArt||"—"]]) }
    </table>
  </div>
  ${temInstrumentos?`
  ${sec(`${numInstrumentos}. Instrumentos de Ensaio Utilizados`)}
  <div style="padding:0 36px;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#1C2633;">
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">Tipo</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">Fabricante / Modelo</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">Nº de Série</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">TAG</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">Calibração</th>
      </tr></thead>
      <tbody>${(rel.instrumentos||[]).map((inst,ii)=>`
        <tr style="background:${ii%2===0?"#fff":"#f9fafb"};">
          <td style="padding:7px 10px;border:1px solid #e5e7eb;">${inst.tipo||"—"}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;font-weight:600;">${inst.fabricante||""} ${inst.modelo||""}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;">${inst.serie||"—"}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;">${inst.tag||"—"}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;">${inst.calibracao?fd(inst.calibracao):"—"}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`:""}
  ${criteriosUsados.length>0?`
  ${sec(`${numCriterios}. Critérios de Aceitação`)}
  <div style="padding:0 36px;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#1C2633;">
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">Tipo de Equipamento</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">Método</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">Critério</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">Referência de Comparação</th>
      </tr></thead>
      <tbody>${criteriosUsados.map((c,ci)=>`
        <tr style="background:${ci%2===0?"#fff":"#f9fafb"};">
          <td style="padding:7px 10px;border:1px solid #e5e7eb;font-weight:600;">${c.nome}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;">${metodoLabel(c.metodo)}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;">${criterioResumo(c)}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;">${c.oQueComparado||"—"}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`:""}
  ${sec(`${numResumo}. Resumo dos Resultados`)}
  <div style="padding:0 36px;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><tbody><tr>
      <td style="padding:12px 6px;border:1px solid #e5e7eb;text-align:center;background:#f8fafc;"><div style="font-size:24px;font-weight:800;color:#1C2633;">${pontos.length}</div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;">Medições</div></td>
      ${SEV_PDF.slice().reverse().map(s=>`
      <td style="padding:12px 6px;border:1px solid #e5e7eb;text-align:center;background:${s.bg};"><div style="font-size:24px;font-weight:800;color:${s.c};">${sevCounts[s.k]}</div><div style="font-size:10px;color:${s.c};text-transform:uppercase;">${s.l}</div></td>`).join("")}
    </tr></tbody></table>
  </div>
  ${buildPizzaSVG(sevCounts,pontos.length)}
  <div style="flex:1;min-height:20px;"></div>
  ${footerPag()}
</div>`;

  // ── ÍNDICE (com quebra de página automática) ────────────────────────────
  // Dividir pontos em grupos de 20 por página
  const PONTOS_POR_PAGINA_INDICE = 20;
  const gruposIndice = [];
  for(let gi=0; gi<pontos.length; gi+=PONTOS_POR_PAGINA_INDICE) {
    gruposIndice.push(pontos.slice(gi, gi+PONTOS_POR_PAGINA_INDICE));
  }
  if(gruposIndice.length===0) gruposIndice.push([]);

  const pageIndice = gruposIndice.map((grupo, gi) => `
<div class="page">
  ${header()}
  ${sec("Índice de Medições"+(gi>0?" (continuação)":""))}
  <div style="padding:0 36px;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#1C2633;">
        <th style="padding:8px 10px;color:#fff;text-align:center;font-size:11px;width:28px;">#</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">TAG</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">Identificação</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">Tipo</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;font-size:11px;">Localização</th>
        <th style="padding:8px 10px;color:#fff;text-align:center;font-size:11px;">Tmáx.</th>
        <th style="padding:8px 10px;color:#fff;text-align:center;font-size:11px;">Severidade</th>
        <th style="padding:8px 10px;color:#fff;text-align:center;font-size:11px;width:36px;">Pág.</th>
      </tr></thead>
      <tbody>${grupo.map((p,li)=>{
        const pi = gi*PONTOS_POR_PAGINA_INDICE + li;
        return `
        <tr style="background:${li%2===0?"#fff":"#f9fafb"};">
          <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;">${pi+1}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;font-weight:600;color:#b45309;">${p.tag||"—"}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;font-weight:600;">${p.equipamento||"—"}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;">${p.tipoEquip||"—"}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;">${p.localizacao||"—"}</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:${sc[p.severidade]||"#16a34a"};">${p.tempMax||"—"}°C</td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;"><span style="background:${sb[p.severidade]||"#f0fdf4"};color:${sc[p.severidade]||"#16a34a"};padding:2px 8px;border-radius:10px;font-weight:700;font-size:10px;">${sl[p.severidade]||"🟢 NORMAL"}</span></td>
          <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;"><a href="#ficha-${pi}" style="color:#1C2633;text-decoration:underline;">${paginaFichaDoPonto(pi)}</a></td>
        </tr>`;
      }).join("")}
      </tbody>
    </table>
  </div>
  ${footerPag()}
</div>`).join("\n");


  // ── PÁGINAS DE MEDIÇÃO ────────────────────────────────────────────────────
  const pagesMedicao = pontos.map((p,i)=>{
    const scolor = sc[p.severidade]||"#16a34a";
    const sbg    = sb[p.severidade]||"#f0fdf4";
    const slabel = sl[p.severidade]||"🟢 NORMAL";
    const hist = rels3
      .filter(r => r.id !== rel.id)
      .map(r => {
        const pp = (r.pontos||[]).find(x => {
          const matchTag = p.tag && x.tag && x.tag === p.tag;
          const matchEqLoc = p.equipamento && x.equipamento === p.equipamento
                          && p.localizacao && x.localizacao === p.localizacao;
          return matchTag || matchEqLoc;
        });
        return pp ? {data:r.dataRelatorio,dt:pp.deltaT,sev:pp.severidade} : null;
      }).filter(Boolean);

    // ── PÁGINA A: Identificação + Dados + Fotos ──────────────────────────────
    const pageA = `
<div class="page" id="ficha-${i}">
  ${header()}
  <div style="padding:14px 36px 0;">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div>
        <div style="font-family:'Oswald',sans-serif;font-size:18px;font-weight:700;color:#1C2633;">Medição #${i+1}${p.equipamento?" — "+p.equipamento:""}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">${[p.tipoEquip,p.localizacao,p.dataMedicao?("Medição: "+fd(p.dataMedicao)+(p.horaMedicao?" às "+p.horaMedicao:"")):null].filter(Boolean).join(" · ")}</div>
      </div>
      <span style="background:${sbg};color:${scolor};border:2px solid ${scolor};padding:5px 16px;border-radius:20px;font-weight:800;font-size:13px;font-family:'Oswald',sans-serif;">${slabel}</span>
    </div>
  </div>
  ${sec("Dados da Medição")}
  <div style="padding:0 36px;">
    <table style="width:100%;border-collapse:collapse;">
      ${subRow("Identificação")}
      ${infoRow([["TAG",p.tag||"—"],["Código de Área",p.codigoArea||"—"]])}
      ${subRow("Condições da Medição")}
      ${infoRow([["Status Operacional",p.statusOperacao||"—"],["Tipo de Instalação",p.tipoInstalacao||"—"]])}
      ${infoRow([["Fator de Carga",p.fatorCarga?(p.fatorCarga+"%"):"—"],["Emissividade ε / Transmissão τ",((p.emissividade||"0.95")+" / "+(p.transmissao||"1.00"))]])}
      ${infoRow([["Temp. Ambiente",p.tempAmb?(p.tempAmb+"°C"):"—"],["Umidade",p.umidade?(p.umidade+"%"):"—"]])}
      ${subRow("Dados Coletados em Campo")}
      ${infoRow([["Temp. Máxima","<b>"+(p.tempMax||"—")+"°C</b>"],["Temp. Mínima",(p.tempMin||"—")+"°C"]])}
      ${infoRow([["Temp. Referência",(p.tempRef||"—")+"°C"],["",""]])}
      ${subRow("Dados Calculados",'#f0fdf4')}
      <tr>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:700;background:#f8fafc;width:150px;color:#374151;font-size:12px;">Temp. Média</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:700;font-size:12px;">${p.tempMedia||"—"}°C</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:700;background:#f8fafc;width:150px;color:#374151;font-size:12px;">ΔT</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:800;font-size:16px;color:${scolor};">${p.deltaT||"—"}°C</td>
      </tr>
      <tr>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:700;background:#f8fafc;width:150px;color:#374151;font-size:12px;">Severidade</td>
        <td colspan="3" style="padding:6px 10px;border:1px solid #e5e7eb;"><span style="background:${sbg};color:${scolor};padding:3px 12px;border-radius:12px;font-weight:800;font-size:13px;">${slabel}</span></td>
      </tr>
    </table>
  </div>
  ${sec("Registros Fotográficos")}
  <div style="padding:0 36px;display:flex;gap:20px;justify-content:center;align-items:flex-start;flex:1;">
    <div style="flex:1;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">📷 Imagem Termográfica</div>
      ${p.fotoTermicaPreview
        ? `<img src="${p.fotoTermicaPreview}" style="width:100%;max-height:340px;object-fit:contain;border-radius:6px;border:2px solid #e5e7eb;"/>`
        : `<div style="border:2px dashed #e5e7eb;border-radius:8px;padding:60px 20px;color:#9ca3af;font-size:12px;">Sem foto termográfica</div>`}
    </div>
    <div style="flex:1;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">📸 Foto Real do Equipamento</div>
      ${p.fotoRealPreview
        ? `<img src="${p.fotoRealPreview}" style="width:100%;max-height:340px;object-fit:contain;border-radius:6px;border:2px solid #e5e7eb;"/>`
        : `<div style="border:2px dashed #e5e7eb;border-radius:8px;padding:60px 20px;color:#9ca3af;font-size:12px;">Sem foto real</div>`}
    </div>
  </div>
${footerPag()}
</div>`;

    // ── PÁGINA B: Diagnóstico + Observações + Histórico ──────────────────────
    const pageB = `
<div class="page">
  ${header()}
  <div style="padding:14px 36px 0;">
    <div style="font-family:'Oswald',sans-serif;font-size:16px;font-weight:700;color:#1C2633;">Medição #${i+1}${p.equipamento?" — "+p.equipamento:""} <span style="font-size:12px;font-weight:400;color:#6b7280;">(continuação)</span></div>
  </div>
  ${sec("Diagnóstico e Ações")}
  <div style="padding:0 36px;display:flex;flex-direction:column;gap:10px;">
    <div>
      <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;margin-bottom:4px;letter-spacing:.5px;">🔍 Defeito Encontrado</div>
      <div style="background:#fef2f2;border-left:3px solid #CD0000;padding:10px 14px;border-radius:4px;font-size:12px;min-height:40px;">${p.defeito||"Nenhum defeito identificado."}</div>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;margin-bottom:4px;letter-spacing:.5px;">📋 Recomendação</div>
      <div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:4px;font-size:12px;min-height:40px;">${p.recomendacao||"Manter monitoramento conforme periodicidade estabelecida."}</div>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;margin-bottom:4px;letter-spacing:.5px;">✅ Ação Executada</div>
      <div style="background:#f0fdf4;border-left:3px solid #16a34a;padding:10px 14px;border-radius:4px;font-size:12px;min-height:40px;">${p.acaoExecutada||"Nenhuma ação executada até o momento."}</div>
    </div>
  </div>
  ${p.observacoes?`
  ${sec("Observações")}
  <div style="padding:0 36px;"><div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px 14px;font-size:12px;color:#374151;">${p.observacoes}</div></div>`:""}
  ${hist.length>0?`
  ${sec("Histórico deste Equipamento")}
  <div style="padding:0 36px;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#1C2633;"><th style="padding:8px 10px;color:#fff;text-align:left;">Inspeção</th><th style="padding:8px 10px;color:#fff;text-align:left;">Data</th><th style="padding:8px 10px;color:#fff;text-align:center;">ΔT</th><th style="padding:8px 10px;color:#fff;text-align:center;">Severidade</th></tr></thead>
      <tbody>
        <tr style="background:#fff7ed;"><td style="padding:7px 10px;border:1px solid #e5e7eb;font-weight:700;">Atual</td><td style="padding:7px 10px;border:1px solid #e5e7eb;">${fd(rel.dataRelatorio)}</td><td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:${scolor};">${p.deltaT||"—"}°C</td><td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;"><span style="background:${sbg};color:${scolor};padding:2px 8px;border-radius:10px;font-weight:700;font-size:10px;">${slabel}</span></td></tr>
        ${hist.map((h,hi)=>`<tr style="background:${hi%2===0?"#fff":"#f9fafb"};"><td style="padding:7px 10px;border:1px solid #e5e7eb;font-weight:700;">${hi+1}ª Anterior</td><td style="padding:7px 10px;border:1px solid #e5e7eb;">${fd(h.data)}</td><td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:${sc[h.sev]||"#16a34a"};">${h.dt||"—"}°C</td><td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;"><span style="background:${sb[h.sev]||"#f0fdf4"};color:${sc[h.sev]||"#16a34a"};padding:2px 8px;border-radius:10px;font-weight:700;font-size:10px;">${sl[h.sev]||"🟢 NORMAL"}</span></td></tr>`).join("")}
      </tbody>
    </table>
  </div>`:""}
${footerPag()}
</div>`;

    return pageA + pageB;
  }).join("\n");
  // ── ÚLTIMA PÁGINA: CONCLUSÕES ─────────────────────────────────────────────
  const compRows = rels3.map((r,i)=>{
    const pts=r.pontos||[];
    const maxDt=Math.max(0,...pts.map(p=>parseFloat(p.deltaT)||0));
    return `<tr style="background:${i===0?"#fff7ed":"#fff"};">
      <td style="padding:7px 10px;border:1px solid #e5e7eb;font-weight:700;">${i===0?"Mais Recente":i+"ª Anterior"}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;">${fd(r.dataRelatorio)}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;">${pts.length}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:#16a34a;">${pts.filter(p=>p.severidade==="normal").length}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:#b45309;">${pts.filter(p=>p.severidade==="suspeita").length}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:#c2410c;">${pts.filter(p=>p.severidade==="provavel").length}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:#dc2626;">${pts.filter(p=>p.severidade==="certa").length}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:#a21caf;">${pts.filter(p=>p.severidade==="iminente").length}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:${maxDt>=20?"#dc2626":maxDt>=10?"#b45309":"#16a34a"};">${maxDt>0?maxDt.toFixed(1)+"°C":"—"}</td>
    </tr>`;
  }).join("");

  const pageUltima = `
<div class="page">
  ${header()}
  ${sec("Conclusões e Análise de Tendência")}
  <div style="padding:0 36px;">
    ${sevCounts.iminente>0?`<div style="background:#fdf4ff;border:1px solid #f0abfc;border-left:4px solid #a21caf;border-radius:6px;padding:12px 16px;margin-bottom:10px;font-size:12px;color:#374151;"><b style="color:#a21caf;">🟣 FALHA IMINENTE — AÇÃO IMEDIATA</b><br/>Foram identificadas ${sevCounts.iminente} medição(ões) em Falha Iminente. Recomenda-se intervenção imediata, antes de qualquer outra prioridade deste relatório.</div>`:""}
    ${sevCounts.certa>0?`<div style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:6px;padding:12px 16px;margin-bottom:10px;font-size:12px;color:#374151;"><b style="color:#dc2626;">⚠️ INTERVENÇÃO NECESSÁRIA</b><br/>Foram identificadas ${sevCounts.certa} medição(ões) em Falha Certa. Recomenda-se ação corretiva prioritária.</div>`:""}
    ${sevCounts.provavel>0?`<div style="background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #c2410c;border-radius:6px;padding:12px 16px;margin-bottom:10px;font-size:12px;color:#374151;"><b style="color:#c2410c;">🟠 INTERVENÇÃO PROGRAMADA</b><br/>Foram identificadas ${sevCounts.provavel} medição(ões) em Falha Provável. Recomenda-se programar a intervenção.</div>`:""}
    ${sevCounts.suspeita>0?`<div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #b45309;border-radius:6px;padding:12px 16px;margin-bottom:10px;font-size:12px;color:#374151;"><b style="color:#b45309;">🟡 OBSERVAÇÃO RECOMENDADA</b><br/>Foram identificadas ${sevCounts.suspeita} medição(ões) com suspeita de falha. Recomenda-se nova medição em curto prazo.</div>`:""}
    ${(sevCounts.iminente+sevCounts.certa+sevCounts.provavel+sevCounts.suspeita)===0?`<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;border-radius:6px;padding:12px 16px;margin-bottom:10px;font-size:12px;color:#374151;"><b style="color:#16a34a;">✅ INSTALAÇÃO EM CONDIÇÕES NORMAIS</b><br/>Nenhuma anomalia identificada. Manter monitoramento conforme periodicidade estabelecida.</div>`:""}
  </div>
  ${rels3.length>=2?`
  ${sec("Comparativo — Últimas "+rels3.length+" Inspeções")}
  <div style="padding:0 36px;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#1C2633;">
        <th style="padding:8px 10px;color:#fff;text-align:left;">Inspeção</th>
        <th style="padding:8px 10px;color:#fff;text-align:left;">Data</th>
        <th style="padding:8px 10px;color:#fff;text-align:center;">Medições</th>
        <th style="padding:8px 10px;color:#fff;text-align:center;">🟢</th>
        <th style="padding:8px 10px;color:#fff;text-align:center;">🟡</th>
        <th style="padding:8px 10px;color:#fff;text-align:center;">🟠</th>
        <th style="padding:8px 10px;color:#fff;text-align:center;">🔴</th>
        <th style="padding:8px 10px;color:#fff;text-align:center;">🟣</th>
        <th style="padding:8px 10px;color:#fff;text-align:center;">Maior ΔT</th>
      </tr></thead>
      <tbody>${compRows}</tbody>
    </table>
  </div>`:""}
  ${sec("Referências Normativas")}
  <div style="padding:0 36px 16px;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      ${[
        ["ABNT NBR 15763:2009","Termografia — Critérios de periodicidade de inspeção em sistemas elétricos de potência."],
        ["ABNT NBR 15866:2010","Termografia — Metodologia de avaliação de temperatura de trabalho em sistemas elétricos."],
        ["ABNT NBR 15572:2013","Termografia — Guia para inspeção de equipamentos elétricos e mecânicos."],
        ["ANSI/NETA MTS-2023","Standard for Maintenance Testing Specifications."]
      ].map(([norm,desc],ri)=>`
      <tr style="background:${ri%2===0?"#fff":"#f9fafb"};">
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:700;white-space:nowrap;width:180px;">${norm}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;">${desc}</td>
      </tr>`).join("")}
    </table>
  </div>
  ${sec("Assinaturas")}
  <div style="padding:0 36px 24px;">
    <div style="display:flex;gap:40px;margin-top:24px;flex-wrap:wrap;">
      <div style="flex:1;min-width:200px;text-align:center;">
        <div style="border:1px solid #d1d5db;border-radius:6px;padding:20px 16px;">
          <div style="height:70px;border-bottom:1px solid #374151;margin-bottom:12px;"></div>
          <div style="font-size:12px;color:#374151;line-height:1.6;"><b>${rel.tecnico||"Técnico Responsável"}</b><br/>Kiton Engenharia Integrada<br/>CREA-PR 76327</div>
        </div>
      </div>
      <div style="flex:1;min-width:200px;text-align:center;">
        <div style="border:1px solid #d1d5db;border-radius:6px;padding:20px 16px;">
          <div style="height:70px;border-bottom:1px solid #374151;margin-bottom:12px;"></div>
          <div style="font-size:12px;color:#374151;line-height:1.6;"><b>${rel.responsavel||"Responsável"}</b><br/>${rel.cliente||"Cliente"}</div>
        </div>
      </div>
    </div>
  </div>
  <div style="flex:1;min-height:20px;"></div>
  ${footerPag()}
</div>`;


  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Relatório Termografia — ${rel.cliente||""}</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:"Open Sans",Arial,sans-serif;background:#e5e7eb;color:#111;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:"Open Sans",Arial,sans-serif;background:#e5e7eb;color:#111;}
  .page{background:#fff;max-width:210mm;margin:24px auto;box-shadow:0 4px 24px rgba(0,0,0,.15);page-break-after:always;position:relative;padding-bottom:90px;min-height:297mm;display:flex;flex-direction:column;}
  .page-footer{position:absolute;bottom:0;left:0;right:0;}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;}
  @media print{
    html,body{background:#fff!important;margin:0;padding:0;}
    .page{margin:0!important;box-shadow:none!important;page-break-after:always;break-after:page;width:100%!important;max-width:100%!important;height:297mm!important;padding-bottom:90px!important;position:relative!important;box-sizing:border-box!important;}
    .page-footer{position:absolute!important;bottom:0!important;left:0!important;right:0!important;width:100%!important;}
    .page-num-display{display:inline!important;}
    @page{size:A4 portrait;margin:0;}
  }
  @media(max-width:600px){.page{margin:8px;}}
</style>
</head>
<body>
${page1}
${pageIndice}
${pagesMedicao}
${pageUltima}
</body>
</html>`;
}

function exportPDF(rel, todosRelatorios) {
  try {
    const htmlBase = buildReportHTML(rel, todosRelatorios);
    const ST  = "<"+"scr"+"ipt>";
    const SET = "<"+"/scr"+"ipt>";
    const printScript = ST+'window.addEventListener("load",function(){setTimeout(function(){window.print();},800);});'+SET;
    const html = htmlBase.replace("</body>", printScript+"\n</body>");
    const blob = new Blob([html], {type:"text/html;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const num = (rel.numRelatorio||"RTK").replace(/[^a-zA-Z0-9-]/g,"_");
    const cli = (rel.cliente||"cliente").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9 ]/g,"").trim().replace(/ +/g,"_");
    const dt  = rel.dataRelatorio?rel.dataRelatorio.split("-").reverse().join("-"):"sem-data";
    const a = document.createElement("a");
    a.href = url;
    a.download = num+"_"+cli+"_"+dt+".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 15000);
  } catch(e) {
    alert("Erro ao gerar PDF: "+e.message);
  }
}

// ─── EXPORT JPG ───────────────────────────────────────────────────────────────
function exportJPG(rel, todosRelatorios) {
  try {
    const htmlBase = buildReportHTML(rel, todosRelatorios);
    const num = (rel.numRelatorio||"RTK").replace(/[^a-zA-Z0-9-]/g,"_");
    const cli = (rel.cliente||"cliente").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9 ]/g,"").trim().replace(/ +/g,"_");
    const dt  = rel.dataRelatorio?rel.dataRelatorio.split("-").reverse().join("-"):"sem-data";
    const nomeArq = num+"_"+cli+"_"+dt;

    const S  = "<"+"scr"+"ipt";
    const ES = "<"+"/scr"+"ipt>";
    const jpgScript = [
      '<style>',
      '.page-footer{position:absolute!important;bottom:0!important;left:0!important;right:0!important;width:100%!important;}',
      '.page{position:relative!important;width:794px!important;min-height:1123px!important;margin:0 auto!important;box-sizing:border-box!important;padding-bottom:80px!important;display:flex!important;flex-direction:column!important;}',
      'body{background:#fff!important;margin:0!important;padding:20px 0!important;}',
      '#kb-status{position:fixed;top:0;left:0;right:0;background:#1C2633;color:#fff;padding:12px 20px;font-family:Arial;font-size:14px;z-index:9999;text-align:center;}',
      '</style>',
      '<div id="kb-status">Preparando exportação JPG...</div>',
      S+' src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js">'+ES,
      S+'>',
      'var NOME="'+nomeArq+'";',
      'window.addEventListener("load",function(){setTimeout(function(){',
      '  var pages=Array.from(document.querySelectorAll(".page"));',
      '  if(!pages.length){document.getElementById("kb-status").textContent="Nenhuma página encontrada.";return;}',
      '  var idx=0;',
      '  function next(){',
      '    if(idx>=pages.length){document.getElementById("kb-status").textContent="Concluído! "+pages.length+" imagem(ns) salva(s)!";document.getElementById("kb-status").style.background="#16a34a";return;}',
      '    document.getElementById("kb-status").textContent="Exportando página "+(idx+1)+" de "+pages.length+"...";',
      '    html2canvas(pages[idx],{scale:2,useCORS:true,allowTaint:true,backgroundColor:"#ffffff",logging:false,width:794,height:1123,windowWidth:834,scrollX:0,scrollY:-window.scrollY})',
      '    .then(function(c){var a=document.createElement("a");a.href=c.toDataURL("image/jpeg",0.95);a.download=NOME+"_pag"+String(idx+1).padStart(2,"0")+".jpg";document.body.appendChild(a);a.click();document.body.removeChild(a);idx++;setTimeout(next,1200);})',
      '    .catch(function(){idx++;setTimeout(next,500);});',
      '  }',
      '  setTimeout(next,800);',
      '},2000);});',
      ES,
      '</body>'
    ].join("\n");

    const htmlComCaptura = htmlBase.replace("</body>", jpgScript);
    const blob = new Blob([htmlComCaptura],{type:"text/html;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = nomeArq+"_EXPORTAR_JPG.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  } catch(e) {
    alert("Erro ao gerar JPG: "+e.message);
  }
}

// ─── PIZZA CHART ──────────────────────────────────────────────────────────────
function PizzaChart({ counts={}, total }) {
  if (!total || total === 0) return null;
  const SEV5 = [
    { key:"iminente", label:"Falha Iminente",    color:"#e879f9" },
    { key:"certa",    label:"Falha Certa",       color:"#ef4444" },
    { key:"provavel", label:"Falha Provável",    color:"#fb923c" },
    { key:"suspeita", label:"Suspeita de Falha", color:"#f59e0b" },
    { key:"normal",   label:"Normal",            color:"#22c55e" },
  ];
  const data = SEV5.map(s=>({label:s.label,val:counts[s.key]||0,color:s.color})).filter(d=>d.val>0);
  if (data.length===0) return null;

  const cx=80,cy=80,r=70;
  let cum=-Math.PI/2;
  const slices = data.map(d=>{
    const angle=(d.val/total)*2*Math.PI;
    const x1=cx+r*Math.cos(cum), y1=cy+r*Math.sin(cum);
    cum+=angle;
    const x2=cx+r*Math.cos(cum), y2=cy+r*Math.sin(cum);
    const large=angle>Math.PI?1:0;
    return {...d,path:`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`};
  });

  return (
    <div style={{background:"#0f1422",border:"1px solid #1f2937",borderRadius:12,padding:"16px 20px",display:"flex",alignItems:"center",gap:20,flexWrap:"wrap",marginBottom:16}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:.8,width:"100%",marginBottom:-8}}>
        Distribuição por Severidade
      </div>
      <svg viewBox="0 0 160 160" style={{width:140,height:140,flexShrink:0}}>
        {slices.map((s,i)=><path key={i} d={s.path} fill={s.color} stroke="#0f1422" strokeWidth="2"/>)}
        <circle cx={cx} cy={cy} r={26} fill="#0f1422"/>
        <text x={cx} y={cy-5} textAnchor="middle" fill="#f1f5f9" fontSize="14" fontWeight="800" fontFamily="'Barlow Condensed',sans-serif">{total}</text>
        <text x={cx} y={cy+9} textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="'Barlow',sans-serif">TOTAL</text>
      </svg>
      <div style={{display:"flex",flexDirection:"column",gap:10,flex:1,minWidth:120}}>
        {SEV5.map(s=>counts[s.key]>0 && (
          <div key={s.key} style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:11,height:11,borderRadius:"50%",background:s.color,flexShrink:0}}/>
            <div style={{flex:1,fontSize:13,color:"#94a3b8"}}>{s.label}</div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:700,color:s.color}}>{counts[s.key]}</div>
            <div style={{fontSize:12,color:"#4b5563",width:34,textAlign:"right"}}>{total>0?Math.round(counts[s.key]/total*100):0}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CADASTROS ────────────────────────────────────────────────────────────────
function Cadastros({ cadastros, onSave, onDelete, tab, setTab }) {
  const T = useContext(ThemeContext);
  return (
    <div>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:800,color:T.textBright,marginBottom:20}}>
        🗂️ Cadastros
      </div>
      <div style={{display:"flex",gap:0,marginBottom:24,borderRadius:10,overflow:"hidden",border:"1px solid "+T.border}}>
        {[["clientes","👥 Clientes"],["instrumentos","🔧 Instrumentos"],["tecnicos","👷 Técnicos"],["criterios","📐 Critérios"]].map(([k,l])=>(
          <div key={k} onClick={()=>setTab(k)}
            style={{flex:1,padding:"12px 16px",background:tab===k?T.accent:T.panel,cursor:"pointer",
              borderRight:k!=="criterios"?"1px solid "+T.border:"none",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:13,fontWeight:700,color:tab===k?T.white:T.textFaint}}>{l}</span>
          </div>
        ))}
      </div>
      {tab==="clientes"     && <CadClientes     items={cadastros.clientes||[]}     criterios={cadastros.criterios||[]} onSave={i=>onSave("clientes",i)}     onDelete={id=>onDelete("clientes",id)}/>}
      {tab==="instrumentos" && <CadInstrumentos items={cadastros.instrumentos||[]} onSave={i=>onSave("instrumentos",i)} onDelete={id=>onDelete("instrumentos",id)}/>}
      {tab==="tecnicos"     && <CadTecnicos     items={cadastros.tecnicos||[]}     onSave={i=>onSave("tecnicos",i)}     onDelete={id=>onDelete("tecnicos",id)}/>}
      {tab==="criterios"    && <CadCriterios    items={cadastros.criterios||[]}    onSave={i=>onSave("criterios",i)}    onDelete={id=>onDelete("criterios",id)}/>}
    </div>
  );
}

// ─── CADASTRO CLIENTES ───────────────────────────────────────────────────────
function CadClientes({ items, onSave, onDelete, criterios=[] }) {
  const T = useContext(ThemeContext);
  const empty = {id:"",nome:"",cnpj:"",ie:"",responsavel:"",cargo:"",telefone:"",email:"",site:"",cep:"",logradouro:"",numero:"",complemento:"",bairro:"",cidade:"",uf:"",obs:"",equipamentos:[]};
  const [form,setForm] = useState(null);
  const [expanded,setExpanded] = useState(null);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  function buscaCep(cep) {
    const c = cep.replace(/[^0-9]/g,"");
    if(c.length!==8) return;
    fetch("https://viacep.com.br/ws/"+c+"/json/").then(r=>r.json()).then(d=>{if(!d.erro){set("logradouro",d.logradouro||"");set("bairro",d.bairro||"");set("cidade",d.localidade||"");set("uf",d.uf||"");}}).catch(()=>{});
  }
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:700,color:T.textBright}}>{items.length} cliente(s)</div>
        <Btn primary onClick={()=>setForm({...empty,id:Date.now()+""})}>＋ Novo Cliente</Btn>
      </div>
      {form && (
        <div style={{background:T.panel,border:"1px solid "+T.accent,borderRadius:10,padding:20,marginBottom:20}}>
          <ST style={{marginBottom:16}}>Dados do Cliente</ST>
          <div style={{fontSize:11,fontWeight:700,color:T.accent,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>📋 Identificação</div>
          <G2 mb={12}><F l="Nome / Razão Social *" v={form.nome||""} s={v=>set("nome",v)} ph="Ex: Indústria Exemplo Ltda"/><F l="CNPJ / CPF *" v={form.cnpj||""} s={v=>set("cnpj",v)} ph="Ex: 00.000.000/0001-00"/></G2>
          <G3 mb={14}><F l="Inscrição Estadual" v={form.ie||""} s={v=>set("ie",v)} ph="Ex: 123456789"/><F l="Responsável / Contato" v={form.responsavel||""} s={v=>set("responsavel",v)} ph="Nome do contato"/><F l="Cargo / Função" v={form.cargo||""} s={v=>set("cargo",v)} ph="Ex: Gerente de Manutenção"/></G3>
          <G3 mb={14}><F l="Telefone / WhatsApp" v={form.telefone||""} s={v=>set("telefone",v)} ph="Ex: (44) 99999-9999"/><F l="E-mail" v={form.email||""} s={v=>set("email",v)} ph="Ex: contato@empresa.com.br"/><F l="Site" v={form.site||""} s={v=>set("site",v)} ph="Ex: www.empresa.com.br"/></G3>
          <div style={{fontSize:11,fontWeight:700,color:T.accent,textTransform:"uppercase",letterSpacing:.8,marginBottom:10,borderTop:"1px solid "+T.border,paddingTop:14}}>📍 Endereço</div>
          <div style={{display:"grid",gridTemplateColumns:"160px 1fr 80px",gap:10,marginBottom:10}}>
            <div><label>CEP *</label><input value={form.cep||""} placeholder="Ex: 87000-000" onChange={e=>set("cep",e.target.value)} onBlur={e=>buscaCep(e.target.value)}/></div>
            <F l="Logradouro *" v={form.logradouro||""} s={v=>set("logradouro",v)} ph="Rua, Av..."/>
            <F l="Número *" v={form.numero||""} s={v=>set("numero",v)} ph="100"/>
          </div>
          <G3 mb={14}><F l="Complemento" v={form.complemento||""} s={v=>set("complemento",v)} ph="Sala, Bloco..."/><F l="Bairro" v={form.bairro||""} s={v=>set("bairro",v)} ph="Ex: Jardim Canadá"/><div style={{display:"grid",gridTemplateColumns:"1fr 60px",gap:8}}><F l="Cidade" v={form.cidade||""} s={v=>set("cidade",v)} ph="Ex: Maringá"/><F l="UF" v={form.uf||""} s={v=>set("uf",v)} ph="PR"/></div></G3>
          <div style={{marginBottom:14}}><label>Observações</label><textarea rows={2} value={form.obs||""} onChange={e=>set("obs",e.target.value)} placeholder="Informações adicionais..." style={{resize:"vertical"}}/></div>
          <div style={{fontSize:11,fontWeight:700,color:T.accent,textTransform:"uppercase",letterSpacing:.8,marginBottom:10,borderTop:"1px solid "+T.border,paddingTop:14}}>⚙️ Equipamentos deste Cliente</div>
          <CadEquipamentos items={form.equipamentos||[]} criterios={criterios} onChange={eqs=>setForm(f=>({...f,equipamentos:eqs}))}/>
          <div style={{display:"flex",gap:8,marginTop:16}}>
            <Btn success onClick={()=>{if(!form.nome||!form.cnpj){alert("Nome e CNPJ são obrigatórios");return;}if(!form.logradouro||!form.numero){alert("Endereço é obrigatório");return;}onSave(form);setForm(null);}}>✅ Salvar</Btn>
            <Btn onClick={()=>setForm(null)}>Cancelar</Btn>
          </div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {[...items].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")).map(item=>(
          <div key={item.id} style={{background:T.panel,border:"1px solid "+T.border,borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",cursor:"pointer"}} onClick={()=>setExpanded(expanded===item.id?null:item.id)}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,color:T.textBright,fontSize:15}}>{item.nome}</div>
                <div style={{fontSize:12,color:T.textFaint,marginTop:2}}>{item.cnpj&&`CNPJ: ${item.cnpj} · `}{item.cidade&&`${item.cidade}${item.uf?"/"+item.uf:""} · `}{(item.equipamentos||[]).length} equip.</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:12,color:T.textFaint}}>{expanded===item.id?"▲":"▼"}</span>
                <Btn small style={{borderColor:T.blueBorder,color:T.blue}} onClick={e=>{e.stopPropagation();setExpanded(expanded===item.id?null:item.id);}}>📋 {(item.equipamentos||[]).length}</Btn>
                <Btn small onClick={e=>{e.stopPropagation();setForm({...item,equipamentos:item.equipamentos||[]})}}>✏️</Btn>
                <Btn small danger onClick={e=>{e.stopPropagation();onDelete(item.id)}}>🗑️</Btn>
              </div>
            </div>
            {expanded===item.id && (
              <div style={{padding:"12px 20px 16px",borderTop:"1px solid "+T.border,background:T.panelDeep}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8,fontSize:12,color:T.textMuted}}>
                  {item.responsavel&&<div><b style={{color:T.textDim}}>Responsável:</b> {item.responsavel}{item.cargo?" ("+item.cargo+")":""}</div>}
                  {item.telefone&&<div><b style={{color:T.textDim}}>Tel:</b> {item.telefone}</div>}
                  {item.email&&<div><b style={{color:T.textDim}}>E-mail:</b> {item.email}</div>}
                  {item.logradouro&&<div style={{gridColumn:"1/-1"}}><b style={{color:T.textDim}}>Endereço:</b> {[item.logradouro,item.numero,item.complemento,item.bairro,item.cidade&&(item.cidade+(item.uf?"/"+item.uf:""))].filter(Boolean).join(", ")}</div>}
                  {item.obs&&<div style={{gridColumn:"1/-1"}}><b style={{color:T.textDim}}>Obs:</b> {item.obs}</div>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CadEquipamentos({ items, onChange, criterios=[] }) {
  const T = useContext(ThemeContext);
  const emptyEq = () => ({id:Date.now()+"",tag:"",nome:"",tipo:"",periodicidade:"",localizacao:"",codigoArea:""});
  const [form,setForm] = useState(null);
  const setF = (k,v) => setForm(f=>({...f,[k]:v}));
  const periodOpts = ["Mensal","Bimestral","Trimestral","Semestral","Anual","Sob demanda"];
  return (
    <div style={{background:T.panelDeep,borderRadius:8,padding:16}}>
      {form && (
        <div style={{background:T.panel,border:"1px solid "+T.borderInfo,borderRadius:8,padding:14,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:10}}>
            <F l="TAG" v={form.tag} s={v=>setF("tag",v)} ph="Ex: QD-01"/>
            <F l="Identificação *" v={form.nome} s={v=>setF("nome",v)} ph="Ex: Quadro Geral"/>
            <TipoSelect l="Tipo" v={form.tipo} s={v=>setF("tipo",v)} criterios={criterios}/>
            <FS l="Periodicidade" v={form.periodicidade} s={v=>setF("periodicidade",v)} opts={periodOpts}/>
            <F l="Localização / Área *" v={form.localizacao} s={v=>setF("localizacao",v)} ph="Ex: Sala Elétrica"/>
            <F l="Nome / Código de Área" v={form.codigoArea} s={v=>setF("codigoArea",v)} ph="Ex: P1, Pintura"/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn success small onClick={()=>{if(!form.nome){alert("Informe a identificação");return;}
              if(!form.localizacao){alert("Localização / Área é obrigatória");return;}const exists=items.find(x=>x.id===form.id);onChange(exists?items.map(x=>x.id===form.id?form:x):[...items,form]);setForm(null);}}>✅ Salvar</Btn>
            <Btn small onClick={()=>setForm(null)}>Cancelar</Btn>
          </div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:12,color:T.textFaint}}>{items.length} equipamento(s)</span>
        <Btn small style={{borderColor:T.blueBorder,color:T.blue}} onClick={()=>setForm(emptyEq())}>＋ Equipamento</Btn>
      </div>
      {[...items].sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","pt-BR")).map(eq=>(
        <div key={eq.id} style={{background:T.panelInfo,borderRadius:6,padding:"8px 12px",marginBottom:6,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
          <div style={{flex:1,fontSize:12}}>
            {eq.tag&&<span style={{color:T.amber,fontWeight:700,marginRight:8}}>{eq.tag}</span>}
            <span style={{color:T.textBright,fontWeight:600}}>{eq.nome}</span>
            <span style={{color:T.textFaint,marginLeft:6}}>{[eq.tipo,eq.periodicidade,eq.localizacao,eq.codigoArea].filter(Boolean).join(" · ")}</span>
          </div>
          <div style={{display:"flex",gap:6}}>
            <Btn small style={{borderColor:T.indigoBorder,color:T.indigo}} onClick={()=>{
              const clone = {...eq, id:Date.now()+"", nome:(eq.nome||"")+" (cópia)"};
              onChange([...items, clone]);
            }}>⧉</Btn>
            <Btn small onClick={()=>setForm({...eq})}>✏️</Btn>
            <Btn small danger onClick={()=>onChange(items.filter(x=>x.id!==eq.id))}>🗑️</Btn>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── CADASTRO CRITÉRIOS DE ACEITAÇÃO ────────────────────────────────────────
const METODOS = [
  { v: "maa",         l: "MAA / CFCA — cálculo automático (elétrico, precisa de MTA)" },
  { v: "comparativo", l: "Comparativo — ΔT com tolerância (linha de base ou legado NBR)" },
  { v: "qualitativo", l: "Qualitativo — sem cálculo, técnico classifica manualmente" },
];
const STATUS_FONTE = [
  { v: "interno",      l: "Interno (ainda não auditado)" },
  { v: "a_confirmar",  l: "A confirmar" },
  { v: "verificado",   l: "Verificado / normativo" },
];
function CadCriterios({ items, onSave, onDelete }) {
  const T = useContext(ThemeContext);
  const empty = { id:"", nome:"", grupo:"", metodo:"comparativo", oQueComparado:"", condicoes:"",
    mta:"", toleranciaAlerta:"", toleranciaCritico:"", documentacaoNecessaria:"",
    fonteNormativa:"", statusFonte:"interno", ativo:true };
  const [form,setForm] = useState(null);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const grupos = {};
  items.forEach(c=>{ const g=c.grupo||"Outros"; (grupos[g]=grupos[g]||[]).push(c); });
  const nomesGrupo = Object.keys(grupos).sort((a,b)=>a.localeCompare(b,"pt-BR"));
  // Editando um item existente: o formulário aparece logo abaixo DELE na lista, não lá em cima.
  // Criando um novo (＋ Novo Critério): não há item para ancorar, então continua aparecendo no topo.
  const isEditingExisting = !!(form && items.some(i=>i.id===form.id));
  const formBlock = form && (
        <div style={{background:T.panel,border:"1px solid "+T.accent,borderRadius:10,padding:20,marginBottom:20,marginTop:isEditingExisting?10:0}}>
          <ST style={{marginBottom:16}}>Dados do Critério</ST>
          <G3 mb={12}>
            <F l="Nome / Ponto de Medição *" v={form.nome||""} s={v=>set("nome",v)} ph="Ex: Motor Elétrico — Conexões Elétricas"/>
            <F l="Grupo *" v={form.grupo||""} s={v=>set("grupo",v)} ph="Ex: Motor Elétrico"/>
            <FS l="Método de Avaliação *" v={METODOS.find(m=>m.v===form.metodo)?.l||""} s={l=>set("metodo",(METODOS.find(m=>m.l===l)||{}).v||"comparativo")} opts={METODOS.map(m=>m.l)}/>
          </G3>
          {form.metodo==="maa" && (
            <G3 mb={12}>
              <F l="MTA — Máxima Temperatura Admissível (°C) *" t="number" v={form.mta||""} s={v=>set("mta",v)} ph="Ex: 90"/>
              <div style={{gridColumn:"span 2",fontSize:12,color:T.textFaint,alignSelf:"end",paddingBottom:8}}>
                MAA = MTA − T. ambiente. Severidade calculada pela razão (T.máx − T.amb) / MAA, conforme CFCA (5 faixas → mapeadas para normal/alerta/crítico).
              </div>
            </G3>
          )}
          {form.metodo==="comparativo" && (
            <G3 mb={12}>
              <F l="ΔT Suspeita de Falha (°C) *" t="number" v={form.toleranciaAlerta||""} s={v=>set("toleranciaAlerta",v)} ph="Ex: 10"/>
              <F l="ΔT Falha Certa (°C) *" t="number" v={form.toleranciaCritico||""} s={v=>set("toleranciaCritico",v)} ph="Ex: 20"/>
              <F l="O que é comparado (referência)" v={form.oQueComparado||""} s={v=>set("oQueComparado",v)} ph="Ex: Fase adjacente / mancal similar / leitura anterior do mesmo ponto"/>
            </G3>
          )}
          {form.metodo==="qualitativo" && (
            <div style={{marginBottom:14}}>
              <label>Documentação necessária para classificação manual</label>
              <textarea rows={2} value={form.documentacaoNecessaria||""} onChange={e=>set("documentacaoNecessaria",e.target.value)}
                placeholder="Ex: registrar imagem térmica, condição de carga e observação visual do técnico" style={{resize:"vertical"}}/>
            </div>
          )}
          <div style={{marginBottom:14}}>
            <label>Condições de aplicação</label>
            <textarea rows={2} value={form.condicoes||""} onChange={e=>set("condicoes",e.target.value)}
              placeholder="Ex: válido apenas com carga acima de 40%; medir em regime permanente" style={{resize:"vertical"}}/>
          </div>
          <G3 mb={0}>
            <F l="Fonte / Referência Normativa" v={form.fonteNormativa||""} s={v=>set("fonteNormativa",v)} ph="Ex: Petrobras N-2475 / MIL-STD-2194 / critério interno"/>
            <FS l="Status da Fonte" v={STATUS_FONTE.find(s2=>s2.v===form.statusFonte)?.l||""} s={l=>set("statusFonte",(STATUS_FONTE.find(s2=>s2.l===l)||{}).v||"interno")} opts={STATUS_FONTE.map(s2=>s2.l)}/>
            <div style={{display:"flex",alignItems:"flex-end",paddingBottom:8}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                <input type="checkbox" checked={form.ativo!==false} onChange={e=>set("ativo",e.target.checked)}/>
                <span style={{fontSize:13,color:T.textDim}}>Ativo (aparece no seletor de Tipo)</span>
              </label>
            </div>
          </G3>
          <div style={{display:"flex",gap:8,marginTop:16}}>
            <Btn success onClick={()=>{
              if(!form.nome||!form.grupo){alert("Nome e Grupo são obrigatórios");return;}
              if(form.metodo==="maa" && !form.mta){alert("Informe o MTA para o método MAA/CFCA");return;}
              if(form.metodo==="comparativo" && (form.toleranciaAlerta===""||form.toleranciaCritico==="")){alert("Informe as tolerâncias de Suspeita de Falha e Falha Certa para o método Comparativo");return;}
              onSave(form);setForm(null);
            }}>✅ Salvar</Btn>
            <Btn onClick={()=>setForm(null)}>Cancelar</Btn>
          </div>
        </div>
  );
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:700,color:T.textBright}}>{items.length} critério(s) cadastrado(s)</div>
        <Btn primary onClick={()=>setForm({...empty,id:Date.now()+""})}>＋ Novo Critério</Btn>
      </div>
      <div style={{fontSize:12,color:T.textFaint,marginBottom:16,lineHeight:1.5}}>
        Cada critério corresponde a um <b>ponto de medição específico</b> (ex.: "Motor Elétrico — Conexões", "Motor Elétrico — Mancais"),
        não apenas ao tipo de equipamento. O "Grupo" agrupa critérios relacionados no seletor de Tipo da medição.
      </div>
      {!isEditingExisting && formBlock}
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        {nomesGrupo.map(g=>(
          <div key={g}>
            <div style={{fontSize:11,fontWeight:700,color:T.accent,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>{g}</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[...grupos[g]].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")).map(item=>(
                <div key={item.id}>
                  <div style={{background:T.panel,border:"1px solid "+T.border,borderRadius:10,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",opacity:item.ativo===false?.55:1}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                        <span style={{fontSize:11,background:T.badgeBlueBg,color:T.blue,padding:"2px 8px",borderRadius:12,fontWeight:700}}>
                          {(METODOS.find(m=>m.v===item.metodo)||{}).l?.split(" —")[0] || item.metodo}
                        </span>
                        {item.ativo===false && <Tag color={T.textFaint}>inativo</Tag>}
                        {item.statusFonte==="verificado" && <Tag color={T.green}>fonte verificada</Tag>}
                      </div>
                      <div style={{fontWeight:700,color:T.textBright}}>{item.nome}</div>
                      <div style={{fontSize:12,color:T.textFaint,marginTop:2}}>
                        {item.metodo==="maa" && `MTA: ${item.mta||"—"}°C`}
                        {item.metodo==="comparativo" && `Suspeita ≥ ${item.toleranciaAlerta||"—"}°C · Certa ≥ ${item.toleranciaCritico||"—"}°C`}
                        {item.metodo==="qualitativo" && "Classificação manual"}
                        {item.fonteNormativa && ` · ${item.fonteNormativa}`}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <Btn small onClick={()=>setForm({...empty,...item})}>✏️</Btn>
                      <Btn small danger onClick={()=>onDelete(item.id)}>🗑️</Btn>
                    </div>
                  </div>
                  {isEditingExisting && form.id===item.id && formBlock}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CadInstrumentos({ items, onSave, onDelete }) {
  const T = useContext(ThemeContext);
  const tiposInstr = ["Câmera Termográfica","Anemômetro","Termômetro","Medidor de Umidade","Termopar","Multímetro","Alicate Amperímetro","Outro"];
  const empty = {id:"",tipo:"",fabricante:"",modelo:"",serie:"",tag:"",calibracao:""};
  const [form,setForm] = useState(null);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:700,color:T.textBright}}>{items.length} instrumento(s)</div>
        <Btn primary onClick={()=>setForm({...empty,id:Date.now()+""})}>＋ Novo Instrumento</Btn>
      </div>
      {form && (
        <div style={{background:T.panel,border:"1px solid "+T.accent,borderRadius:10,padding:20,marginBottom:20}}>
          <ST style={{marginBottom:16}}>Dados do Instrumento</ST>
          <G3 mb={12}><FS l="Tipo *" v={form.tipo||""} s={v=>set("tipo",v)} opts={tiposInstr}/><F l="Fabricante *" v={form.fabricante||""} s={v=>set("fabricante",v)} ph="Ex: FLIR"/><F l="Modelo *" v={form.modelo||""} s={v=>set("modelo",v)} ph="Ex: E8-XT"/></G3>
          <G3 mb={0}><F l="Nº de Série" v={form.serie||""} s={v=>set("serie",v)} ph="Ex: 639114962XT"/><F l="TAG / Identificação" v={form.tag||""} s={v=>set("tag",v)} ph="Ex: CAM-01"/><F l="Data de Calibração" t="date" v={form.calibracao||""} s={v=>set("calibracao",v)}/></G3>
          <div style={{display:"flex",gap:8,marginTop:16}}>
            <Btn success onClick={()=>{if(!form.tipo||!form.fabricante||!form.modelo){alert("Preencha tipo, fabricante e modelo");return;}onSave(form);setForm(null);}}>✅ Salvar</Btn>
            <Btn onClick={()=>setForm(null)}>Cancelar</Btn>
          </div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {items.map(item=>(
          <div key={item.id} style={{background:T.panel,border:"1px solid "+T.border,borderRadius:10,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                <span style={{fontSize:11,background:T.badgeBlueBg,color:T.blue,padding:"2px 8px",borderRadius:12,fontWeight:700}}>{item.tipo||"Instrumento"}</span>
                {item.tag&&<span style={{fontSize:11,color:T.amber,fontWeight:700}}>{item.tag}</span>}
              </div>
              <div style={{fontWeight:700,color:T.textBright}}>{item.fabricante} {item.modelo}</div>
              <div style={{fontSize:12,color:T.textFaint,marginTop:2}}>{item.serie&&`Série: ${item.serie}`}{item.calibracao&&` · Calibração: ${fmtDate(item.calibracao)}`}</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn small onClick={()=>setForm({...item})}>✏️</Btn>
              <Btn small danger onClick={()=>onDelete(item.id)}>🗑️</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CadTecnicos({ items, onSave, onDelete }) {
  const T = useContext(ThemeContext);
  const empty = {id:"",nome:"",crea:""};
  const [form,setForm] = useState(null);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:700,color:T.textBright}}>{items.length} técnico(s)</div>
        <Btn primary onClick={()=>setForm({...empty,id:Date.now()+""})}>＋ Novo Técnico</Btn>
      </div>
      {form && (
        <div style={{background:T.panel,border:"1px solid "+T.accent,borderRadius:10,padding:20,marginBottom:20}}>
          <G2 mb={0}><F l="Nome Completo *" v={form.nome} s={v=>set("nome",v)} ph="Ex: Joaquim Bernardes"/><F l="CREA" v={form.crea||""} s={v=>set("crea",v)} ph="Ex: 153435/D"/></G2>
          <div style={{display:"flex",gap:8,marginTop:16}}>
            <Btn success onClick={()=>{if(!form.nome){alert("Informe o nome");return;}onSave(form);setForm(null);}}>✅ Salvar</Btn>
            <Btn onClick={()=>setForm(null)}>Cancelar</Btn>
          </div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {items.map(item=>(
          <div key={item.id} style={{background:T.panel,border:"1px solid "+T.border,borderRadius:10,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:T.textBright}}>{item.nome}</div>
              {item.crea&&<div style={{fontSize:12,color:T.textFaint,marginTop:2}}>CREA-PR {item.crea}</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn small onClick={()=>setForm({...item})}>✏️</Btn>
              <Btn small danger onClick={()=>onDelete(item.id)}>🗑️</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({ data={relatorios:[],cadastros:{clientes:[],cameras:[],tecnicos:[]}}, onNew, onEdit, onDelete, onClone, onCompar, onPdf, onJpg }) {
  const T = useContext(ThemeContext);
  const [filtro,setFiltro] = useState("todos");
  const [busca,setBusca]   = useState("");
  const rels = [...(data.relatorios||[])]
    .filter(r => filtro==="todos" || r.cliente===filtro)
    .filter(r => {
      if (!busca.trim()) return true;
      const q = busca.toLowerCase();
      return (r.numRelatorio||"").toLowerCase().includes(q) || (r.cliente||"").toLowerCase().includes(q) || (r.tecnico||"").toLowerCase().includes(q) || (r.os||"").toLowerCase().includes(q);
    })
    .sort((a,b)=>{ const d=new Date(b.dataRelatorio)-new Date(a.dataRelatorio); if(d!==0) return d; const ia=parseInt(String(a.id).replace(/[^0-9]/g,"")||0), ib=parseInt(String(b.id).replace(/[^0-9]/g,"")||0); return ib-ia; });
  const all  = data.relatorios || [];
  const st   = {
    total:    all.length,
    clientes: (data.cadastros?.clientes||[]).length,
    criticos: all.reduce((s,r)=>s+(r.pontos||[]).filter(p=>p.severidade==="certa"||p.severidade==="iminente").length,0),
    alertas:  all.reduce((s,r)=>s+(r.pontos||[]).filter(p=>p.severidade==="suspeita"||p.severidade==="provavel").length,0),
  };


  const tabelaClientes = (() => {
        // Qtd. de Relatórios = total histórico do cliente. Já os indicadores de severidade (🟢🟡🟠🔴🟣)
        // refletem só o ÚLTIMO relatório emitido para aquele cliente — um relatório antigo já resolvido
        // não deve continuar "pesando" no status atual do ativo. Mesmo critério de "mais recente" usado
        // na ordenação da lista de relatórios: data do relatório e, em empate, o id (mais recente por último).
        const clis = (data.cadastros?.clientes||[]).map(cli=>{
          const rs = (data.relatorios||[]).filter(r=>r.cliente===cli.nome);
          const ultimoRel = rs.length ? [...rs].sort((a,b)=>{
            const d = new Date(b.dataRelatorio)-new Date(a.dataRelatorio);
            if (d!==0) return d;
            const ia=parseInt(String(a.id).replace(/[^0-9]/g,"")||0), ib=parseInt(String(b.id).replace(/[^0-9]/g,"")||0);
            return ib-ia;
          })[0] : null;
          const ps = ultimoRel ? (ultimoRel.pontos||[]) : [];
          return {nome:cli.nome, total:rs.length,
            normal:ps.filter(p=>p.severidade==="normal").length,
            suspeita:ps.filter(p=>p.severidade==="suspeita").length,
            provavel:ps.filter(p=>p.severidade==="provavel").length,
            certa:ps.filter(p=>p.severidade==="certa").length,
            iminente:ps.filter(p=>p.severidade==="iminente").length};
        }).sort((a,b)=>{
          const aTemRel = a.total>0 ? 0 : 1;
          const bTemRel = b.total>0 ? 0 : 1;
          if(aTemRel !== bTemRel) return aTemRel - bTemRel;
          return (a.nome||"").localeCompare(b.nome||"","pt-BR");
        });
        if(!clis.length) return null;
    return (

          <div style={{background:T.panel,border:"1px solid "+T.border,borderRadius:10,overflow:"hidden",marginBottom:16}}>
            <div style={{padding:"10px 16px",borderBottom:"1px solid "+T.border}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:.8}}>📊 Resumo por Cliente</span>
                <span style={{fontSize:11,color:T.textDim}}>{clis.length} cliente(s)</span>
              </div>
              <div style={{fontSize:10,color:T.textFaint,marginTop:3,textTransform:"uppercase",letterSpacing:.5}}>🎯 Resultados de Severidade — Último Relatório</div>
            </div>
            <div style={{overflowY:"auto",maxHeight:205,scrollbarWidth:"thin",scrollbarColor:T.borderMuted+" "+T.panel}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:T.panelDeep,position:"sticky",top:0,zIndex:1}}>
                  {["Cliente","Qtd. de Relatórios","🟢","🟡","🟠","🔴","🟣"].map(h=>(
                    <th key={h} style={{padding:"8px 12px",textAlign:h==="Cliente"?"left":"center",fontSize:11,fontWeight:700,color:T.textBright,textTransform:"uppercase",letterSpacing:.5,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {clis.map(c=>(
                    <tr key={c.nome} onClick={()=>setFiltro(filtro===c.nome?"todos":c.nome)}
                      style={{borderTop:"1px solid "+T.border,cursor:"pointer",background:filtro===c.nome?"rgba(205,0,0,0.08)":"transparent"}}>
                      <td style={{padding:"9px 12px",fontWeight:600,color:filtro===c.nome?T.accent:T.textBright,fontSize:13}}>{c.nome}</td>
                      <td style={{padding:"9px 12px",textAlign:"center",fontWeight:700,color:c.total>0?T.blue:T.textDim,fontSize:13}}>{c.total}</td>
                      <td style={{padding:"9px 12px",textAlign:"center",fontWeight:700,color:c.normal>0?T.sev.normal.color:T.textDim,fontSize:13}}>{c.normal}</td>
                      <td style={{padding:"9px 12px",textAlign:"center",fontWeight:700,color:c.suspeita>0?T.sev.suspeita.color:T.textDim,fontSize:13}}>{c.suspeita}</td>
                      <td style={{padding:"9px 12px",textAlign:"center",fontWeight:700,color:c.provavel>0?T.sev.provavel.color:T.textDim,fontSize:13}}>{c.provavel}</td>
                      <td style={{padding:"9px 12px",textAlign:"center",fontWeight:700,color:c.certa>0?T.sev.certa.color:T.textDim,fontSize:13}}>{c.certa}</td>
                      <td style={{padding:"9px 12px",textAlign:"center",fontWeight:700,color:c.iminente>0?T.sev.iminente.color:T.textDim,fontSize:13}}>{c.iminente}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
    );
  })();

  return (
    <div>
      {/* Cards resumo */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        {[{l:"Relatórios",v:st.total,i:"📋",c:T.accent},{l:"Clientes Cadastrados",v:st.clientes,i:"🏭",c:T.blueBorder}].map(s=>(
          <div key={s.l} style={{background:T.panel,border:"1px solid "+T.border,borderTop:"3px solid "+s.c,borderRadius:10,padding:"16px 20px"}}>
            <div style={{fontSize:22,marginBottom:4}}>{s.i}</div>
            <div style={{fontSize:28,fontWeight:800,color:s.c,fontFamily:"'Barlow Condensed',sans-serif",lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:11,color:T.textDim,textTransform:"uppercase",letterSpacing:1,marginTop:4}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Tabela resumo por cliente */}
      {tabelaClientes}

      {rels.length===0 ? (
        <div style={{textAlign:"center",padding:"80px 20px",color:T.borderMuted}}>
          <div style={{fontSize:48,marginBottom:12}}>{busca?"🔍":"📋"}</div>
          <div style={{fontSize:17,fontWeight:600,color:T.textMuted}}>
            {busca ? ("Nenhum resultado para \""+busca+"\"") : "Nenhum relatório ainda"}
          </div>
          {busca && <div style={{fontSize:13,marginTop:8,color:T.textFaint}}>Tente buscar pelo código RTK, nome do cliente ou técnico responsável</div>}
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:0}}><div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
          <Btn onClick={onNew} primary style={{whiteSpace:"nowrap"}}>📝 Novo Relatório</Btn>
        </div>
        <div style={{background:T.panel,border:"1px solid "+T.border,borderRadius:10,overflow:"hidden"}}>
          <div style={{padding:"10px 16px",borderBottom:"1px solid "+T.border,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:.8}}>📋 Relatórios Gerados</span>
            <span style={{fontSize:11,color:T.borderMuted}}>{rels.length} relatório(s)</span>
          </div>
          <div style={{padding:"10px 16px",borderBottom:"1px solid "+T.border,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <select value={filtro} onChange={e=>setFiltro(e.target.value)} style={{width:160,fontSize:"13px!important"}}>
              <option value="todos">Todos os clientes</option>
              {(data.cadastros?.clientes||[]).map(c=><option key={c.id||c} value={c.nome||c}>{c.nome||c}</option>)}
            </select>
            <div style={{position:"relative",flex:1,minWidth:180}}>
              <input value={busca} onChange={e=>setBusca(e.target.value)}
                placeholder="🔍 Buscar por código, cliente ou técnico..."
              />
              {busca && <span onClick={()=>setBusca("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",cursor:"pointer",color:T.textMuted,fontSize:15}}>✕</span>}
            </div>
            {filtro!=="todos" && <Btn onClick={()=>onCompar(filtro)} style={{borderColor:T.blueBorder,color:T.blue}}>📊</Btn>}
          </div>
          <div style={{overflowY:"auto",maxHeight:390,display:"flex",flexDirection:"column",gap:0,scrollbarWidth:"thin",scrollbarColor:T.borderMuted+" "+T.panel}}>
            {rels.map((r,i)=>(
              <div key={r.id} style={{borderTop:i>0?"1px solid "+T.border:"none",padding:"14px 16px"}}>
                <CardRel r={r} onEdit={onEdit} onDelete={onDelete} onClone={onClone} onPdf={onPdf} onJpg={onJpg}/>
              </div>
            ))}
          </div>
        </div></div>
      )}
    </div>
  );
}

function CardRel({ r, onEdit, onDelete, onClone, onPdf, onJpg }) {
  const T = useContext(ThemeContext);
  const pts=r.pontos||[];
  const maxDt=Math.max(0,...pts.map(p=>parseFloat(p.deltaT)||0));
  const [h,setH]=useState(false);
  return (
    <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{background:T.panel,border:"1px solid "+(h?T.accent:T.border),borderRadius:10,padding:"18px 22px",
        display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap",transition:"border .15s"}}>
      <div style={{flex:1,minWidth:0,maxWidth:"100%"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
          <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:17,fontWeight:700,color:T.textBright}}>{r.cliente}</span>
          {r.numRelatorio && <Tag color={T.accent}>{r.numRelatorio}</Tag>}
          {r.os && <Tag>OS: {r.os}</Tag>}
          {r.status && <Tag color={r.status==="Rascunho"?T.blueBorder:r.status==="Preliminar"?T.amber:T.green}>{r.status==="Rascunho"?"📝 Rascunho":r.status==="Preliminar"?"📋 Preliminar":"✅ Final"}</Tag>}
          <span style={{fontSize:12,color:T.textDim}}>📅 {fmtDate(r.dataRelatorio)}</span>
        </div>
        <div style={{fontSize:12,color:T.textDim,marginBottom:10}}>{[r.local,r.tecnico].filter(Boolean).join(" · ")||"Sem detalhes"}</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {["iminente","certa","provavel","suspeita","normal"].map(s=>{
            const sv=T.sev[s]; const c=pts.filter(p=>p.severidade===s).length;
            if (c===0 && s!=="normal") return null;
            if (c===0 && s==="normal" && pts.length>0) return null;
            return <span key={s} style={{fontSize:11,background:sv.bg,color:sv.color,border:"1px solid "+sv.border,padding:"2px 10px",borderRadius:20,fontWeight:700}}>{sv.icon} {c}</span>;
          })}
          {maxDt>0 && <span style={{fontSize:11,color:T.textMuted}}>Maior ΔT: <b style={{color:maxDt>=20?T.red:maxDt>=10?T.amber:T.green}}>{maxDt}°C</b></span>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
        <Btn onClick={()=>onPdf(r)} style={{borderColor:T.violetBorder,color:T.violet}}>📄 PDF</Btn>
        <Btn onClick={()=>onJpg(r)} style={{borderColor:T.cyanBorder,color:T.cyan}}>🖼️ JPG</Btn>
        <Btn onClick={()=>onEdit(r)} small style={{borderColor:T.blueBorder,color:T.blue}}>✏️ Editar</Btn>
        <Btn onClick={()=>onClone(r)} small style={{borderColor:T.indigoBorder,color:T.indigo}}>⧉ Clonar</Btn>
        <Btn onClick={()=>onDelete(r.id)} small danger>🗑️</Btn>
      </div>
    </div>
  );
}

// ─── FORM RELATÓRIO ───────────────────────────────────────────────────────────
function FormRel({ initial, onSave, onCancel, cadastros={clientes:[],cameras:[],tecnicos:[]}, relatorios=[] }) {
  const T = useContext(ThemeContext);
  const [step,setStep] = useState(0);
  const numAuto = initial?.numRelatorio || gerarNumRelatorio(relatorios);
  // initial pode vir sem numRelatorio (ex.: relatório clonado) — nesse caso também precisa do
  // próximo número sequencial, não só quando não há "initial" nenhum (Novo Relatório do zero).
  const [form,setForm] = useState(()=>initial
    ? {...initial, numRelatorio: initial.numRelatorio || numAuto}
    : {
      id:Date.now(), numRelatorio:numAuto, os:"", numArt:"",
      cliente:"", responsavel:"", local:"",
      tecnico:"", instrumentos:[],
      status:"Rascunho", observacoes:"", pontos:[newPonto()],
      dataRelatorio: new Date().toISOString().slice(0,10),
    });

  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const addPonto = () => setForm(f=>({...f,pontos:[...f.pontos,newPonto()]}));
  const delPonto = id => setForm(f=>({...f,pontos:f.pontos.filter(p=>p.id!==id)}));

  // Campos cuja alteração dispara o recálculo automático de severidade.
  // Qualquer outro campo (observações, defeito, recomendação...) não deve tocar
  // na severidade — evita apagar uma classificação manual do técnico ao editar algo não relacionado.
  const SEVERIDADE_RECALC_FIELDS = ["tempMax","tempMin","tempRef","tempAmb","tipoEquip"];
  // Fator de carga: calculado automaticamente quando há corrente nominal + ao menos uma fase medida
  // (usa a MAIOR corrente de fase, não a média — é o cenário mais conservador para avaliação térmica).
  // Sem essas correntes (equipamentos que não são Subestação/Transformador), o técnico digita manualmente.
  const FATOR_CARGA_RECALC_FIELDS = ["corrNom","corrR","corrS","corrT"];
  const updPonto = (id,k,v) => setForm(f=>({
    ...f, pontos:(f.pontos||[]).map(p=>{
      if(p.id!==id) return p;
      let u={...p,[k]:v};
      u.tempMedia = calcMedia(u.tempMax,u.tempMin);
      u.deltaT    = calcDelta(u.tempMax,u.tempRef);
      if (k==="fatorCarga") {
        // Técnico digitou manualmente — respeita a escolha, não recalcula na próxima edição de corrente.
        u.fatorCargaAuto = false;
        return u;
      }
      if (FATOR_CARGA_RECALC_FIELDS.includes(k)) {
        const fc = calcFatorCarga(u);
        if (fc !== null) { u.fatorCarga = fc; u.fatorCargaAuto = true; }
        else { u.fatorCargaAuto = false; }
      }
      if (k==="severidade") {
        // Técnico está classificando manualmente — respeita a escolha, não recalcula.
        u.severidadeAuto = false;
        return u;
      }
      if (SEVERIDADE_RECALC_FIELDS.includes(k)) {
        const criterio = (cadastros.criterios||[]).find(c=>c.nome===u.tipoEquip && c.ativo!==false);
        const r = calcSeveridade(u, criterio);
        u.severidade = r.severidade;
        u.severidadeAuto = r.severidadeAuto;
        u.cfca = r.cfca;
        // "Congelamento": grava uma cópia do critério usado no momento da medição, para que
        // edições futuras no cadastro não alterem retroativamente relatórios já salvos.
        u.criterioSnapshot = criterio ? {...criterio} : null;
      }
      return u;
    })
  }));

  const handleFoto = (pontoId,tipo,file) => {
    if(!file) return;
    const r=new FileReader();
    r.onload=e=>updPonto(pontoId,tipo==="termica"?"fotoTermicaPreview":"fotoRealPreview",e.target.result);
    r.readAsDataURL(file);
  };

  const STEPS=["📋 Identificação","🔍 Medições"];

  return (
    <div>
      <div style={{display:"flex",marginBottom:24,borderRadius:10,overflow:"hidden",border:"1px solid "+T.border}}>
        {STEPS.map((s,i)=>(
          <div key={i} onClick={()=>setStep(i)} style={{flex:1,padding:"12px 16px",
            background:step===i?T.accent:T.panel,cursor:"pointer",
            borderRight:i<1?"1px solid "+T.border:"none",
            display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <span style={{fontSize:12,fontWeight:700,color:step===i?T.white:T.textFaint,textAlign:"center"}}>{s}</span>
            {i<step && <span style={{fontSize:12,color:T.green}}>✓</span>}
          </div>
        ))}
      </div>

      <div style={{background:T.panel,border:"1px solid "+T.border,borderRadius:12,padding:"20px 16px"}}>

        {step===0 && (
          <div>
            <ST>Identificação do Relatório</ST>
            <G3>
              <div>
                <label>Nº Relatório <span style={{color:T.green,fontWeight:400,textTransform:"none",letterSpacing:0}}>auto</span></label>
                <input readOnly value={form.numRelatorio} style={{cursor:"default",fontWeight:700,color:T.accent}}/>
              </div>
              <F l="Nº OS (Ordem de Serviço)" v={form.os||""} s={v=>set("os",v)} ph="Ex: OS-2024-047"/>
              <F l="Data do Relatório *" t="date" v={form.dataRelatorio} s={v=>set("dataRelatorio",v)}/>
            </G3>
            <div style={{marginTop:14}}>
              <label>Status do Relatório</label>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                {["Rascunho","Preliminar","Final"].map(s=>(
                  <div key={s} onClick={()=>set("status",s)}
                    style={{padding:"10px 24px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:14,
                      background:form.status===s?(s==="Rascunho"?T.badgeBlueBg:s==="Preliminar"?T.amberBadgeBg:T.greenBadgeBg):T.input,
                      color:form.status===s?(s==="Rascunho"?T.blue:s==="Preliminar"?T.amberBright:T.greenBright):T.textFaint,
                      border:"2px solid "+(form.status===s?(s==="Rascunho"?T.blueBorder:s==="Preliminar"?T.amber:T.green):T.border)}}>
                    {s==="Rascunho"?"📝 Rascunho":s==="Preliminar"?"📋 Preliminar":"✅ Final"}
                  </div>
                ))}
              </div>
            </div>
            <G3 mt={14}>
              <div>
                <label>Cliente / Empresa *</label>
                <select value={form.cliente} onChange={e=>{
                  const cli = cadastros.clientes.find(c=>c.nome===e.target.value);
                  set("cliente",e.target.value);
                  if(cli) set("responsavel", cli.responsavel||"");
                }}>
                  <option value="">Selecione ou cadastre...</option>
                  {(cadastros.clientes||[]).map(c=><option key={c.id} value={c.nome}>{c.nome}</option>)}
                </select>
              </div>
              <F l="Responsável (cliente)" v={form.responsavel||""} s={v=>set("responsavel",v)}/>
              <F l="Local / Unidade" v={form.local||""} s={v=>set("local",v)}/>
            </G3>
            <G3 mt={14}>
              <div>
                <label>Técnico Responsável</label>
                <select value={form.tecnico||""} onChange={e=>set("tecnico",e.target.value)}>
                  <option value="">Selecione ou cadastre...</option>
                  {(cadastros.tecnicos||[]).map(t=><option key={t.id} value={`${t.nome}${t.crea?" — CREA-PR "+t.crea:""}`}>{t.nome}{t.crea?" — CREA-PR "+t.crea:""}</option>)}
                </select>
              </div>
              <F l="Nº ART" v={form.numArt||""} s={v=>set("numArt",v)} ph="Ex: PR20260000000/0"/>
              <div>
                <label>Instrumentos Utilizados</label>
                <div style={{background:T.input,border:"1px solid "+T.border,borderRadius:7,padding:"8px 12px",maxHeight:160,overflowY:"auto"}}>
                  {(cadastros.instrumentos||[]).length === 0
                    ? <div style={{fontSize:12,color:T.textFaint,padding:"4px 0"}}>Nenhum instrumento cadastrado ainda</div>
                    : (cadastros.instrumentos||[]).map(inst=>{
                        const sel = (form.instrumentos||[]).some(x=>x.id===inst.id);
                        return (
                          <label key={inst.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",cursor:"pointer",fontSize:13,color:sel?T.textBright:T.textMuted,textTransform:"none",letterSpacing:0,fontWeight:sel?600:400}}>
                            <input type="checkbox" checked={sel}
                              onChange={e=>{
                                const atual = form.instrumentos||[];
                                set("instrumentos", e.target.checked ? [...atual,inst] : atual.filter(x=>x.id!==inst.id));
                              }}
                              style={{width:16,height:16,accentColor:T.accent,flexShrink:0}}/>
                            <span style={{fontSize:10,background:T.badgeBlueBg,color:T.blue,padding:"1px 6px",borderRadius:8}}>{inst.tipo}</span>
                            {inst.fabricante} {inst.modelo}
                            {inst.tag && <span style={{color:T.amber,fontSize:11}}>({inst.tag})</span>}
                          </label>
                        );
                      })
                  }
                </div>
              </div>
            </G3>
            <div style={{marginTop:20,background:T.panelInfo,border:"1px solid "+T.borderInfo,borderRadius:8,padding:"14px 16px"}}>
              <div style={{fontSize:12,fontWeight:700,color:T.blueBorder,marginBottom:10}}>📘 Referência — Critérios de Aceitação Cadastrados</div>
              {(cadastros.criterios||[]).filter(c=>c.ativo!==false).length===0 ? (
                <div style={{fontSize:12,color:T.textFaint}}>Nenhum critério ativo cadastrado. Cadastre em 🗂️ Cadastros → 📐 Critérios.</div>
              ) : (
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:6}}>
                  {(cadastros.criterios||[]).filter(c=>c.ativo!==false).map(c=>(
                    <div key={c.id} style={{fontSize:11,color:T.textMuted}}>
                      <b style={{color:T.gray9ca}}>{c.nome}:</b>{" "}
                      {c.metodo==="maa"
                        ? `MTA ${c.mta||"—"}°C (MAA/CFCA)`
                        : c.metodo==="qualitativo"
                        ? "qualitativo (manual)"
                        : (c.toleranciaAlerta!==""&&c.toleranciaCritico!=="") ? `🟡≥${c.toleranciaAlerta}°C · 🔴≥${c.toleranciaCritico}°C` : "sem tolerância (manual)"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step===1 && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
              <ST style={{margin:0}}>Medições ({form.pontos.length})</ST>
              <Btn onClick={addPonto} style={{borderColor:T.blueBorder,color:T.blue}}>＋ Adicionar Medição</Btn>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              {(form.pontos||[]).map((p,idx)=>(
                <PontoCard key={p.id} p={p} idx={idx}
                  onChange={(k,v)=>updPonto(p.id,k,v)}
                  onRemove={()=>delPonto(p.id)}
                  onFoto={(tipo,file)=>handleFoto(p.id,tipo,file)}
                  canRemove={(form.pontos||[]).length>1}
                  clienteNome={form.cliente}
                  cadastros={cadastros}/>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:20,gap:8}}>
        <Btn onClick={step===0?onCancel:()=>setStep(s=>s-1)}>{step===0?"Cancelar":"← Anterior"}</Btn>
        {step<1
          ? <>
              <Btn onClick={()=>onSave(form)} success>✅ Salvar Relatório</Btn>
              <Btn onClick={()=>setStep(s=>s+1)} primary>Próximo →</Btn>
            </>
          : <>
              <Btn onClick={()=>setForm(f=>({...f,pontos:[...f.pontos,newPonto()]}))} style={{borderColor:T.blueBorder,color:T.blue}}>＋ Adicionar Medição</Btn>
              <Btn onClick={()=>onSave(form)} success>✅ Salvar Relatório</Btn>
            </>
        }
      </div>
    </div>
  );
}

// ─── PONTO CARD ──────────────────────────────────────────────────────────────
function PontoCard({ p, idx, onChange, onRemove, onFoto, canRemove, clienteNome="", cadastros={clientes:[]} }) {
  const T = useContext(ThemeContext);
  const sev  = T.sev[p.severidade]||T.sev.normal;
  const criterios = cadastros.criterios||[];
  const crit = criterios.find(c=>c.nome===p.tipoEquip) || null;
  const dt   = parseFloat(p.deltaT);
  const isSubTrf = ["Subestação","Transformador"].includes(p.tipoEquip) || ["Subestação","Transformador"].includes(crit?.grupo);

  const cliCad = (cadastros.clientes||[]).find(c=>c.nome===clienteNome);
  const equipsCliente = cliCad?.equipamentos || [];
  const statusOpts = ["✅ Operação normal","⚠️ Operação parcial / carga reduzida","❌ Fora de operação / desligado"];
  const instalOpts = ["🏭 Interna / Área Fechada","🏠 Abrigada / Subestação Coberta","🌤️ Externa / Intempérie","⚡ Subestação Aérea","🔒 Subestação Blindada"];
  const periodOpts = ["Mensal","Bimestral","Trimestral","Semestral","Anual","Sob demanda"];
  const emissOpts  = ["0.01", "0.02", "0.03", "0.04", "0.05", "0.06", "0.07", "0.08", "0.09", "0.10", "0.11", "0.12", "0.13", "0.14", "0.15", "0.16", "0.17", "0.18", "0.19", "0.20", "0.21", "0.22", "0.23", "0.24", "0.25", "0.26", "0.27", "0.28", "0.29", "0.30", "0.31", "0.32", "0.33", "0.34", "0.35", "0.36", "0.37", "0.38", "0.39", "0.40", "0.41", "0.42", "0.43", "0.44", "0.45", "0.46", "0.47", "0.48", "0.49", "0.50", "0.51", "0.52", "0.53", "0.54", "0.55", "0.56", "0.57", "0.58", "0.59", "0.60", "0.61", "0.62", "0.63", "0.64", "0.65", "0.66", "0.67", "0.68", "0.69", "0.70", "0.71", "0.72", "0.73", "0.74", "0.75", "0.76", "0.77", "0.78", "0.79", "0.80", "0.81", "0.82", "0.83", "0.84", "0.85", "0.86", "0.87", "0.88", "0.89", "0.90", "0.91", "0.92", "0.93", "0.94", "0.95", "0.96", "0.97", "0.98", "0.99", "1.00"];

  return (
    <div style={{background:T.panelDeep,border:"1px solid "+sev.border,borderLeft:"4px solid "+sev.color,borderRadius:10,padding:20}}>

      {/* Título */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:15,fontWeight:700,color:T.textBright,wordBreak:"break-word"}}>
          Medição #{idx+1}{p.equipamento?` — ${p.equipamento}`:""}
        </span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:12,background:sev.bg,color:sev.color,border:"1px solid "+sev.border,padding:"3px 12px",borderRadius:20,fontWeight:700}}>
            {sev.icon} {sev.label} {!isNaN(dt)&&p.deltaT?`· ΔT ${p.deltaT}°C`:""}
          </span>
          {canRemove && <Btn onClick={onRemove} small danger>✕</Btn>}
        </div>
      </div>

      {/* Data + Hora */}
      <div style={{marginBottom:12,background:T.panelInfo,border:"1px solid "+T.borderInfo,borderRadius:7,padding:"10px 14px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:T.blue,fontWeight:700}}>📅 Data e Hora desta Medição</span>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",flex:1,minWidth:0}}>
          <div style={{minWidth:160,maxWidth:200}}><input type="date" value={p.dataMedicao} onChange={e=>onChange("dataMedicao",e.target.value)}/></div>
          <div style={{minWidth:120,maxWidth:150}}><input type="time" value={p.horaMedicao||""} onChange={e=>onChange("horaMedicao",e.target.value)} placeholder="Hora (opcional)"/></div>
        </div>
      </div>

      {/* Identificação — com lista do cliente se disponível */}
      {equipsCliente.length > 0 && (
        <div style={{marginBottom:12,background:T.panelInfo,border:"1px solid "+T.borderInfo,borderRadius:7,padding:"10px 14px"}}>
          <label style={{color:T.blue}}>🔗 Selecionar equipamento cadastrado</label>
          <select onChange={e=>{
            const eq = equipsCliente.find(x=>x.id===e.target.value);
            if(eq){
              onChange("tag", eq.tag||"");
              onChange("equipamento", eq.nome||"");
              onChange("tipoEquip", eq.tipo||"");
              onChange("periodicidade", eq.periodicidade||"");
              onChange("localizacao", eq.localizacao||"");
              onChange("codigoArea", eq.codigoArea||"");
            }
          }} defaultValue="">
            <option value="">— Selecione para preencher automaticamente —</option>
            {[...equipsCliente].sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","pt-BR")).map(eq=><option key={eq.id} value={eq.id}>{eq.tag?eq.tag+" — ":""}{eq.nome}{[eq.tipo,eq.periodicidade,eq.localizacao,eq.codigoArea].filter(Boolean).length?" · "+[eq.tipo,eq.periodicidade,eq.localizacao,eq.codigoArea].filter(Boolean).join(" · "):""}</option>)}
          </select>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
        <F l="TAG do Equipamento" v={p.tag||""} s={v=>onChange("tag",v)} ph="Ex: TR-01, QD-15"/>
        <F l="Identificação" v={p.equipamento} s={v=>onChange("equipamento",v)} ph="Ex: Quadro Geral"/>
        <TipoSelect l="Tipo de Equipamento" v={p.tipoEquip} s={v=>onChange("tipoEquip",v)} criterios={criterios}/>
        <FS l="Periodicidade" v={p.periodicidade||""} s={v=>onChange("periodicidade",v)} opts={periodOpts}/>
      </div>
      <G2 mb={12}>
        <F l="Localização / Área *" v={p.localizacao} s={v=>onChange("localizacao",v)} ph="Ex: Sala Elétrica Principal"/>
        <F l="Nome / Código de Área" v={p.codigoArea||""} s={v=>onChange("codigoArea",v)} ph="Ex: P1, Pintura"/>
      </G2>

      {/* Condições operacionais */}
      <div style={{background:T.panelInfo,border:"1px solid "+T.borderInfo,borderRadius:8,padding:"14px 16px",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:T.blue,marginBottom:10,textTransform:"uppercase",letterSpacing:.8}}>🔧 Condições no Momento da Medição</div>
        {isSubTrf ? (
          <G2 mb={10}>
            <FS l="Status Operacional *" v={p.statusOperacao} s={v=>onChange("statusOperacao",v)} opts={statusOpts}/>
            <FS l="Tipo de Instalação" v={p.tipoInstalacao} s={v=>onChange("tipoInstalacao",v)} opts={instalOpts}/>
          </G2>
        ) : (
          <G3 mb={10}>
            <FS l="Status Operacional *" v={p.statusOperacao} s={v=>onChange("statusOperacao",v)} opts={statusOpts}/>
            <FS l="Tipo de Instalação" v={p.tipoInstalacao} s={v=>onChange("tipoInstalacao",v)} opts={instalOpts}/>
            <F l="Fator de Carga (%)" t="number" v={p.fatorCarga} s={v=>onChange("fatorCarga",v)} ph="Ex: 75"/>
          </G3>
        )}
        {p.statusOperacao==="❌ Fora de operação / desligado" && (
          <div style={{background:T.redSoftBg,border:"1px solid "+T.redSoftBorder,borderRadius:6,padding:"8px 12px",fontSize:12,color:T.redSoftText,marginBottom:10}}>
            ⚠️ Equipamento fora de operação — inspeção pode ser inconclusiva conforme NBR 15572
          </div>
        )}
        <G3 mb={0}>
          <F l="Temperatura Ambiente (°C)" t="number" v={p.tempAmb} s={v=>onChange("tempAmb",v)}/>
          <F l="Umidade Relativa (%)" t="number" v={p.umidade} s={v=>onChange("umidade",v)}/>
          <FS l="Condição Ambiental" v={p.condicaoAmb} s={v=>onChange("condicaoAmb",v)} opts={["Ensolarado","Nublado","Noturno","Interior / Área Fechada","Chuva"]}/>
        </G3>
        <G2 mt={10} mb={0}>
          <FS l="Emissividade ε" v={p.emissividade||"0.95"} s={v=>onChange("emissividade",v)} opts={emissOpts}/>
          <FS l="Transmissão τ (janela óptica)" v={p.transmissao||"1.00"} s={v=>onChange("transmissao",v)} opts={emissOpts}/>
        </G2>
        {isSubTrf && (
          <div style={{marginTop:10}}>
            <div style={{fontSize:11,fontWeight:700,color:T.amber,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>⚡ Correntes (Subestação / Transformador)</div>
            <div style={{fontSize:11,color:T.textFaint,marginBottom:8}}>Preenchendo I. Nominal + ao menos uma fase, o Fator de Carga é calculado automaticamente (maior corrente de fase ÷ nominal) e aparece logo abaixo, em "🧮 Dados Calculados".</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
              <F l="I. Nominal (A)" t="number" v={p.corrNom} s={v=>onChange("corrNom",v)}/>
              <F l="I. Fase R (A)" t="number" v={p.corrR} s={v=>onChange("corrR",v)}/>
              <F l="I. Fase S (A)" t="number" v={p.corrS} s={v=>onChange("corrS",v)}/>
              <F l="I. Fase T (A)" t="number" v={p.corrT} s={v=>onChange("corrT",v)}/>
            </div>
          </div>
        )}
      </div>

      {/* Temperaturas: dados coletados em campo */}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:T.blue,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>📥 Dados Coletados em Campo</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          <F l="T. Máx (°C)" t="number" v={p.tempMax} s={v=>onChange("tempMax",v)}/>
          <F l="T. Mín (°C)" t="number" v={p.tempMin} s={v=>onChange("tempMin",v)}/>
          <F l="T. Referência (°C)" t="number" v={p.tempRef} s={v=>onChange("tempRef",v)} ph={p.tempAmb||"—"}/>
        </div>
      </div>

      {/* Temperaturas (e, para Subestação/Transformador, Fator de Carga): dados calculados automaticamente */}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:T.green,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>🧮 Dados Calculados</div>
        <div style={{display:"grid",gridTemplateColumns:isSubTrf?"repeat(3,1fr)":"repeat(2,1fr)",gap:8}}>
          <div>
            <label>T. Média <span style={{color:T.green,fontWeight:400,textTransform:"none",letterSpacing:0}}>auto</span></label>
            <input readOnly value={p.tempMedia} style={{cursor:"default"}}/>
          </div>
          <div>
            <label>ΔT <span style={{color:T.green,fontWeight:400,textTransform:"none",letterSpacing:0}}>auto</span></label>
            <input readOnly value={p.deltaT} style={{fontWeight:700,cursor:"default",
              color:!isNaN(dt)&&p.deltaT?(T.sev[p.severidade]?.color||T.green):T.textMuted}}/>
          </div>
          {isSubTrf && (p.fatorCargaAuto ? (
            <div>
              <label>Fator de Carga (%) <span style={{color:T.green,fontWeight:400,textTransform:"none",letterSpacing:0}}>auto</span></label>
              <input readOnly value={p.fatorCarga} style={{cursor:"default"}}/>
            </div>
          ) : (
            <F l="Fator de Carga (%)" t="number" v={p.fatorCarga} s={v=>onChange("fatorCarga",v)} ph="Preencha as correntes ao lado"/>
          ))}
        </div>
      </div>

      {/* Info do Critério — varia por método */}
      {crit ? (
        <div style={{marginBottom:12,background:T.panelInfo,border:"1px solid "+T.borderInfo,borderRadius:6,padding:"8px 12px",fontSize:11,color:T.textMuted}}>
          {crit.metodo==="maa" && (
            <>
              <b style={{color:T.blue}}>Critério — {p.tipoEquip} (MAA/CFCA):</b> MTA = {crit.mta||"—"}°C
              {p.cfca ? ` · MAA = ${p.cfca.maa}°C · Razão AC/MAA = ${p.cfca.razao} · ${p.cfca.nivel} (${p.cfca.prazo})`
                      : " · preencha T. Máx e T. Ambiente para calcular"}
            </>
          )}
          {crit.metodo==="comparativo" && (
            (crit.toleranciaAlerta!==""&&crit.toleranciaCritico!=="") ? (
              <><b style={{color:T.blue}}>Critério — {p.tipoEquip}:</b> {crit.oQueComparado?`Ref. = ${crit.oQueComparado} · `:""}🟡 Suspeita ≥{crit.toleranciaAlerta}°C · 🔴 Certa ≥{crit.toleranciaCritico}°C</>
            ) : (
              <><b style={{color:T.amber}}>Critério — {p.tipoEquip}:</b> sem tolerância numérica cadastrada — classifique a severidade manualmente.</>
            )
          )}
          {crit.metodo==="qualitativo" && (
            <><b style={{color:T.blue}}>Critério — {p.tipoEquip} (qualitativo):</b> classificação manual.{crit.documentacaoNecessaria?` Documentar: ${crit.documentacaoNecessaria}`:""}</>
          )}
          {crit.condicoes && <div style={{marginTop:4,color:T.textFaint}}>Condições de aplicação: {crit.condicoes}</div>}
        </div>
      ) : p.tipoEquip ? (
        <div style={{marginBottom:12,background:T.redSoftBg,border:"1px solid "+T.redSoftBorder,borderRadius:6,padding:"8px 12px",fontSize:11,color:T.redSoftText}}>
          ⚠️ Nenhum critério cadastrado para "{p.tipoEquip}" — classifique a severidade manualmente.
        </div>
      ) : null}

      {/* Severidade */}
      <div style={{marginBottom:12}}>
        <label>Severidade <span style={{color:p.severidadeAuto?T.green:T.amber,fontWeight:400,textTransform:"none",letterSpacing:0}}>{p.severidadeAuto?"auto (editável)":"manual"}</span></label>
        <select value={p.severidade} onChange={e=>onChange("severidade",e.target.value)}>
          {Object.entries(T.sev).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
      </div>

      {/* Fotos */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12,marginBottom:12}}>
        <FotoUpload label="📷 Foto Termográfica" preview={p.fotoTermicaPreview} onChange={f=>onFoto("termica",f)}/>
        <FotoUpload label="📸 Foto Real do Equipamento" preview={p.fotoRealPreview} onChange={f=>onFoto("real",f)}/>
      </div>


      {/* Defeito / Recomendação / Ação Executada */}
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>
        <div>
          <label>🔍 Defeito Encontrado</label>
          <textarea rows={2} value={p.defeito||""} onChange={e=>onChange("defeito",e.target.value)}
            placeholder="Descreva o defeito ou anomalia identificada..." style={{resize:"vertical"}}/>
        </div>
        <div>
          <label>📋 Recomendação</label>
          <textarea rows={2} value={p.recomendacao||""} onChange={e=>onChange("recomendacao",e.target.value)}
            placeholder="Descreva a ação corretiva recomendada..." style={{resize:"vertical"}}/>
        </div>
        <div>
          <label>✅ Ação Executada</label>
          <textarea rows={2} value={p.acaoExecutada||""} onChange={e=>onChange("acaoExecutada",e.target.value)}
            placeholder="Descreva a ação que foi executada (preencher após intervenção)..." style={{resize:"vertical"}}/>
        </div>
      </div>


      {/* Observações */}
      <div style={{borderTop:"2px solid "+T.accent,paddingTop:10,marginTop:4}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:8,color:T.textDim}}>Observações</div>
        <textarea rows={3} value={p.observacoes||""} onChange={e=>onChange("observacoes",e.target.value)}
          placeholder="Registre observações específicas desta medição..." style={{resize:"vertical"}}/>
      </div>
    </div>
  );
}


// ─── FOTO UPLOAD ──────────────────────────────────────────────────────────────
function FotoUpload({ label, preview, onChange }) {
  const T = useContext(ThemeContext);
  const uid = useRef("f"+Math.random().toString(36).slice(2)).current;
  return (
    <div>
      <label htmlFor={uid}>{label}</label>
      <label htmlFor={uid} style={{display:"block",cursor:"pointer"}}>
        <div style={{border:"2px dashed "+(preview?T.accent:T.borderMuted),borderRadius:8,minHeight:90,
          display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.panel}}>
          {preview
            ? <img src={preview} alt="" style={{width:"100%",maxHeight:180,objectFit:"cover",display:"block"}}/>
            : <div style={{textAlign:"center",padding:16}}>
                <div style={{fontSize:24,marginBottom:4}}>📁</div>
                <div style={{fontSize:12,color:T.textFaint,textTransform:"none",letterSpacing:0,fontWeight:400}}>Toque para selecionar</div>
                <div style={{fontSize:11,color:T.borderMuted,marginTop:2,textTransform:"none",letterSpacing:0,fontWeight:400}}>Câmera ou galeria</div>
              </div>
          }
        </div>
      </label>
      <input id={uid} type="file" accept="image/*"
        style={{position:"absolute",opacity:0,width:1,height:1,pointerEvents:"none"}}
        onChange={e=>{ if(e.target.files?.[0]) onChange(e.target.files[0]); }}/>
    </div>
  );
}

// ─── COMPARATIVO ─────────────────────────────────────────────────────────────
function Comparativo({ cliente, relatorios, onBack }) {
  const T = useContext(ThemeContext);
  const rels=[...relatorios].filter(r=>r.cliente===cliente).sort((a,b)=>new Date(b.dataRelatorio)-new Date(a.dataRelatorio)).slice(0,3);

  if(rels.length<2) return (
    <div style={{textAlign:"center",padding:80}}>
      <div style={{fontSize:48,marginBottom:12}}>📊</div>
      <div style={{fontSize:17,fontWeight:600,color:T.textMuted}}>São necessários ao menos 2 relatórios para comparar</div>
      <div style={{marginTop:20}}><Btn onClick={onBack} primary>← Voltar</Btn></div>
    </div>
  );

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:24,fontWeight:800,color:T.textBright}}>📊 Comparativo — {cliente}</div>
          <div style={{color:T.textFaint,fontSize:13}}>Últimas {rels.length} inspeções</div>
        </div>
        <Btn onClick={onBack}>← Voltar</Btn>
      </div>

      <div style={{background:T.panel,border:"1px solid "+T.border,borderRadius:12,overflowX:"auto",marginBottom:24,WebkitOverflowScrolling:"touch"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
          <thead>
            <tr style={{background:T.panelDeep}}>
              {["Inspeção","Data","Medições","🟢 Normais","🟡 Suspeitas","🟠 Prováveis","🔴 Certas","🟣 Iminentes","Maior ΔT"].map(h=>(
                <th key={h} style={{padding:"11px 14px",textAlign:"left",fontSize:11,fontWeight:700,color:T.textMuted,letterSpacing:.8,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rels.map((r,i)=>{
              const pts=r.pontos||[];
              const maxDt=Math.max(0,...pts.map(p=>parseFloat(p.deltaT)||0));
              return (
                <tr key={r.id} style={{borderTop:"1px solid "+T.border}}>
                  <td style={tds(T)}><Tag color={i===0?T.accent:undefined}>{i===0?"Mais Recente":`${i+1}ª Anterior`}</Tag></td>
                  <td style={tds(T)}>{fmtDate(r.dataRelatorio)}</td>
                  <td style={{...tds(T),fontWeight:700,color:T.textBright}}>{pts.length}</td>
                  <td style={{...tds(T),color:T.sev.normal.color,fontWeight:700}}>{pts.filter(p=>p.severidade==="normal").length}</td>
                  <td style={{...tds(T),color:T.sev.suspeita.color,fontWeight:700}}>{pts.filter(p=>p.severidade==="suspeita").length}</td>
                  <td style={{...tds(T),color:T.sev.provavel.color,fontWeight:700}}>{pts.filter(p=>p.severidade==="provavel").length}</td>
                  <td style={{...tds(T),color:T.sev.certa.color,fontWeight:700}}>{pts.filter(p=>p.severidade==="certa").length}</td>
                  <td style={{...tds(T),color:T.sev.iminente.color,fontWeight:700}}>{pts.filter(p=>p.severidade==="iminente").length}</td>
                  <td style={{...tds(T),fontWeight:700,color:maxDt>=20?T.sev.certa.color:maxDt>=10?T.sev.suspeita.color:T.sev.normal.color}}>{maxDt>0?`${maxDt}°C`:"—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{background:T.panel,border:"1px solid "+T.border,borderRadius:12,padding:22}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:700,color:T.textBright,marginBottom:16}}>🔁 Evolução por Equipamento</div>
        {(()=>{
          const equips=[...new Set(rels.flatMap(r=>(r.pontos||[]).map(p=>p.equipamento).filter(Boolean)))];
          if(!equips.length) return <div style={{color:T.borderMuted}}>Sem dados suficientes.</div>;
          return (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {equips.map(eq=>{
                const hist=rels.map(r=>(r.pontos||[]).find(p=>p.equipamento===eq)||null);
                const atual=hist[0],ant=hist[1];
                const trend=atual&&ant&&parseFloat(atual.tempMax)&&parseFloat(ant.tempMax)?parseFloat(atual.tempMax)-parseFloat(ant.tempMax):null;
                const sa=T.sev[atual?.severidade]||T.sev.normal;
                return (
                  <div key={eq} style={{background:T.panelDeep,borderRadius:8,padding:"13px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:140}}>
                      <div style={{fontWeight:600,color:T.textBright,marginBottom:4,fontSize:14}}>{eq}</div>
                      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                        {hist.map((h,i)=>h&&(
                          <div key={i} style={{fontSize:11,color:T.textMuted}}>
                            <span>{i===0?"Atual":`-${i}`}: </span>
                            <span style={{color:T.sev[h.severidade]?.color,fontWeight:700}}>{h.tempMax?`${h.tempMax}°C`:"—"}</span>
                            {h.deltaT&&<span style={{color:T.textFaint}}> (ΔT {h.deltaT}°C)</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontSize:11,background:sa.bg,color:sa.color,border:"1px solid "+sa.border,padding:"2px 10px",borderRadius:20,fontWeight:700}}>{sa.icon} {sa.label}</span>
                      {trend!==null&&(
                        <span style={{fontSize:16,fontWeight:700,color:trend>5?T.red:trend<-5?T.green:T.amber}}>
                          {trend>0?`↑ +${trend.toFixed(1)}°C`:trend<0?`↓ ${trend.toFixed(1)}°C`:"→ Estável"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const tds = T => ({padding:"11px 14px",fontSize:13,color:T.gray9ca});
function ST({children,style}){ return <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:13,fontWeight:700,color:"#CD0000",marginBottom:18,...style}}>{children}</div>; }
function G3({children,mt=0,mb=14}){ return <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginTop:mt,marginBottom:mb}}>{children}</div>; }
function G2({children,mt=0,mb=14}){ return <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginTop:mt,marginBottom:mb}}>{children}</div>; }
function F({l,v,s,t="text",ph,readonly}){
  return <div><label>{l}</label><input type={t} value={v} readOnly={readonly} placeholder={ph||""} onChange={e=>s&&s(e.target.value)}/></div>;
}
function FS({l,v,s,opts}){
  return <div><label>{l}</label><select value={v} onChange={e=>s(e.target.value)}><option value="">Selecione...</option>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select></div>;
}
// Seletor de Tipo de Equipamento/Ponto de Medição agrupado por "grupo", lendo do cadastro de Critérios
// (substitui o antigo <FS opts={TIPOS}/> fixo). Só lista critérios ativos.
function TipoSelect({l,v,s,criterios=[]}){
  const ativos = criterios.filter(c=>c.ativo!==false);
  const grupos = {};
  ativos.forEach(c=>{ const g=c.grupo||"Outros"; (grupos[g]=grupos[g]||[]).push(c); });
  const nomesGrupo = Object.keys(grupos).sort((a,b)=>a.localeCompare(b,"pt-BR"));
  return (
    <div>
      <label>{l}</label>
      <select value={v} onChange={e=>s(e.target.value)}>
        <option value="">Selecione...</option>
        {nomesGrupo.map(g=>(
          <optgroup key={g} label={g}>
            {[...grupos[g]].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")).map(c=>
              <option key={c.id} value={c.nome}>{c.nome}</option>
            )}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
function Tag({children,color}){
  const T = useContext(ThemeContext);
  return <span style={{fontSize:11,background:color?color+"22":T.border,color:color||T.gray9ca,border:"1px solid "+(color||T.borderMuted),padding:"2px 9px",borderRadius:20,fontWeight:600}}>{children}</span>;
}
function Btn({children,onClick,primary,success,danger,small,style}){
  const T = useContext(ThemeContext);
  const base={padding:small?"6px 12px":"9px 18px",borderRadius:7,cursor:"pointer",fontWeight:600,fontSize:small?12:13,border:"1px solid",transition:"all .15s"};
  const v=primary?{background:T.accent,color:T.white,borderColor:T.accent}
         :success?{background:T.greenStrong,color:T.white,borderColor:T.greenStrong}
         :danger ?{background:T.redDeepBg,color:T.redSoftText,borderColor:T.redSoftBorder}
         :        {background:T.input,color:T.gray9ca,borderColor:T.border};
  return <button onClick={onClick} style={{...base,...v,...style}}>{children}</button>;
}
