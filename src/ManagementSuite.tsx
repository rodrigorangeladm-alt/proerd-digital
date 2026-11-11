import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BrainCircuit, CalendarDays, Download, FileSpreadsheet, Link2, Plus, RefreshCw, Target, Trash2, Wallet } from "lucide-react";

type Person = { id: string; full_name: string; war_name: string | null; rank: string; status: string };
type ScaleEntry = { id: string; service_date: string; personnel_id: string; duty_type: string; shift_start: string; shift_end: string; personnel?: Person | null };
type HourAdjustment = { id: string; personnel_id: string; adjustment_date: string; hours: number; reason: string; personnel?: Person | null };
type Goal = { id: string; title: string; description: string | null; target_value: number; current_value: number; unit: string; start_date: string | null; end_date: string | null; status: string };
type Integration = { id: string; system_name: string; reference_type: string; reference_value: string; status: string; notes: string | null };
type Props = { supabase: any; personnel: Person[]; profile: any };

const localDate = (d = new Date()) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 10); };
const shiftWeek = (v: string) => { const d = new Date(`${v}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDate(d); };
const plusDays = (v: string, n: number) => { const d = new Date(`${v}T12:00:00`); d.setDate(d.getDate() + n); return localDate(d); };
const durationHours = (s: string, e: string) => { if (!s || !e) return 0; const [sh, sm] = s.slice(0,5).split(":").map(Number); const [eh, em] = e.slice(0,5).split(":").map(Number); let m = eh*60+em-sh*60-sm; if (m < 0) m += 1440; return Math.max(0,m/60); };
const fmt = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h`;
const personLabel = (p?: Person | null) => p ? `${p.rank ? `${p.rank} ` : ""}${p.war_name || p.full_name}` : "Cadastro funcional não localizado";

export default function ManagementSuite({ supabase, personnel, profile }: Props) {
  const [tab,setTab] = useState("scales"), [weekDate,setWeekDate] = useState(localDate());
  const [from,setFrom] = useState(localDate(new Date(Date.now()-30*86400000))), [to,setTo] = useState(localDate());
  const [scales,setScales] = useState<ScaleEntry[]>([]), [adjustments,setAdjustments] = useState<HourAdjustment[]>([]);
  const [goals,setGoals] = useState<Goal[]>([]), [integrations,setIntegrations] = useState<Integration[]>([]);
  const [activities,setActivities] = useState<any[]>([]), [message,setMessage] = useState(""), [busy,setBusy] = useState(false);
  const [hourForm,setHourForm] = useState({personnel_id:"",adjustment_date:localDate(),hours:"",reason:""});
  const [goalForm,setGoalForm] = useState({title:"",description:"",target_value:"",current_value:"0",unit:"atividades",start_date:localDate(),end_date:plusDays(localDate(),30),status:"Em andamento"});
  const [integrationForm,setIntegrationForm] = useState({system_name:"SEI",reference_type:"Processo",reference_value:"",status:"Ativo",notes:""});
  const weekStart = useMemo(()=>shiftWeek(weekDate),[weekDate]), weekEnd = useMemo(()=>plusDays(weekStart,6),[weekStart]);
  const activePersonnel = useMemo(()=>personnel.filter(p=>p.status==="Ativo").sort((a,b)=>a.full_name.localeCompare(b.full_name,"pt-BR")),[personnel]);

  async function load() {
    if (!supabase || profile?.role !== "admin") return;
    setBusy(true); setMessage("");
    const r = await Promise.all([
      supabase.from("service_scale_entries").select("id,service_date,personnel_id,duty_type,shift_start,shift_end,personnel(id,full_name,war_name,rank,status)").gte("service_date",weekStart).lte("service_date",weekEnd).order("service_date").order("shift_start"),
      // Sem join com personnel: a associação é feita localmente usando a lista recebida por props.
      supabase.from("instructor_hour_adjustments").select("id,personnel_id,adjustment_date,hours,reason").gte("adjustment_date",from).lte("adjustment_date",to).order("adjustment_date",{ascending:false}),
      supabase.from("operational_goals").select("*").order("created_at",{ascending:false}),
      supabase.from("institutional_integrations").select("*").order("created_at",{ascending:false}),
      supabase.from("activities").select("performed_on,status,students_present,instructor_id").gte("performed_on",from).lte("performed_on",to)
    ]);
    const errs = r.filter(x=>x.error);
    if (errs.length) setMessage(`Não foi possível carregar todos os dados: ${errs.map(x=>x.error.message).join(" | ")}`);
    setScales((r[0].data||[]) as ScaleEntry[]);
    const byId = new Map(personnel.map(p=>[p.id,p]));
    setAdjustments(((r[1].data||[]) as HourAdjustment[]).map(x=>({...x,personnel:byId.get(x.personnel_id)||null})));
    setGoals((r[2].data||[]) as Goal[]); setIntegrations((r[3].data||[]) as Integration[]); setActivities(r[4].data||[]);
    setBusy(false);
  }
  useEffect(()=>{load();},[weekStart,from,to,profile?.id,personnel]);

  const scheduledHours = useMemo(()=>{const m=new Map<string,number>(); scales.forEach(x=>m.set(x.personnel_id,(m.get(x.personnel_id)||0)+durationHours(x.shift_start,x.shift_end))); return m;},[scales]);
  const adjustmentTotals = useMemo(()=>{const m=new Map<string,number>(); adjustments.forEach(x=>m.set(x.personnel_id,(m.get(x.personnel_id)||0)+Number(x.hours||0))); return m;},[adjustments]);

  async function insert(table:string,data:Record<string,any>) { const {error}=await supabase.from(table).insert(data); setMessage(error?error.message:"Registro salvo com sucesso."); if(!error) await load(); }
  async function remove(table:string,id:string) { if(!window.confirm("Confirma a exclusão deste registro?")) return; const {error}=await supabase.from(table).delete().eq("id",id); setMessage(error?error.message:"Registro excluído."); if(!error) await load(); }

  function exportCsv() {
    const rows=[["Grupo","Data","Policial","Descrição","Quantidade"],
      ...scales.map(x=>["Escala",x.service_date,personLabel(x.personnel),`${x.shift_start}-${x.shift_end}`,durationHours(x.shift_start,x.shift_end)]),
      ...adjustments.map(x=>["Banco de horas",x.adjustment_date,personLabel(x.personnel),x.reason,x.hours]),
      ...activities.map(x=>["Atividade",x.performed_on,x.instructor_id,x.status,x.students_present])];
    const csv="\uFEFF"+rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); const a=document.createElement("a"); a.href=url; a.download=`proerd_relatorio_${localDate()}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  function printPdf() {
    const w=window.open("","_blank"); if(!w){setMessage("Permita a abertura de janelas para gerar o PDF.");return;}
    const body=activePersonnel.map(p=>`<tr><td>${personLabel(p)}</td><td>${(scheduledHours.get(p.id)||0).toFixed(2)}</td><td>${(adjustmentTotals.get(p.id)||0).toFixed(2)}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório PROERD DIGITAL</title><style>body{font:14px Arial;padding:28px;color:#1d2e40}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:8px;text-align:left}</style></head><body><h1>PROERD DIGITAL · Relatório gerencial</h1><p>Período ${from} a ${to}</p><p>Escalas na semana: ${scales.length} · Atividades no período: ${activities.length}</p><table><thead><tr><th>Policial</th><th>Horas programadas</th><th>Ajustes de banco</th></tr></thead><tbody>${body}</tbody></table><p>Relatório de apoio gerencial. Escalas programadas não comprovam jornada efetivamente cumprida.</p><script>window.onload=()=>window.print()</script></body></html>`); w.document.close();
  }
  const tabs=[["scales","Escalas",CalendarDays],["hours","Banco de horas",Wallet],["goals","Metas e desempenho",Target],["reports","Relatórios",FileSpreadsheet],["integrations","Integrações",Link2],["ai","Inteligência gerencial",BrainCircuit]] as const;
  if(profile?.role!=="admin") return <section className="mgmt"><p>Acesso restrito à administração.</p></section>;

  return <section className="mgmt">
    <header className="mgmt-header"><div><h2>Gestão estratégica PROERD</h2><p>Escalas, banco de horas, metas, relatórios e apoio à decisão.</p></div><button onClick={load} disabled={busy}><RefreshCw size={14}/>{busy?"Atualizando...":"Atualizar"}</button></header>
    <nav className="mgmt-tabs">{tabs.map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={15}/>{label}</button>)}</nav>
    {message&&<p className="mgmt-message">{message}</p>}
    {tab==="scales"&&<article><h3>Melhorias e acompanhamento das escalas</h3><label>Semana de referência <input type="date" value={weekDate} onChange={e=>setWeekDate(e.target.value)}/></label><p>{scales.length} designações entre {weekStart} e {weekEnd}. As horas são calculadas pela diferença entre início e término de cada turno.</p><div className="mgmt-table-wrap"><table><thead><tr><th>Data</th><th>Policial</th><th>Tipo</th><th>Horário</th><th>Horas</th></tr></thead><tbody>{scales.map(x=><tr key={x.id}><td>{x.service_date}</td><td>{x.personnel?.rank} {x.personnel?.war_name||x.personnel?.full_name||"Cadastro não localizado"}</td><td>{x.duty_type}</td><td>{String(x.shift_start).slice(0,5)} às {String(x.shift_end).slice(0,5)}</td><td>{fmt(durationHours(x.shift_start,x.shift_end))}</td></tr>)}{!scales.length&&<tr><td colSpan={5}>Nenhuma escala registrada nesta semana.</td></tr>}</tbody></table></div><small>Escala programada não equivale a registro de ponto ou comprovação de serviço efetivamente cumprido.</small><div className="mgmt-cards">{activePersonnel.map(p=><div key={p.id}><b>{personLabel(p)}</b><span>{fmt(scheduledHours.get(p.id)||0)} programadas</span></div>)}</div></article>}
    {tab==="hours"&&<article><h3>Banco de horas dos instrutores</h3><p>Registre créditos ou débitos conferidos administrativamente. Os lançamentos não são calculados automaticamente a partir da escala.</p>
      <form onSubmit={e=>{e.preventDefault();insert("instructor_hour_adjustments",{...hourForm,hours:Number(hourForm.hours),created_by:profile.id});}}>
        <label>Policial/instrutor<select required value={hourForm.personnel_id} onChange={e=>setHourForm({...hourForm,personnel_id:e.target.value})}><option value="">Selecione</option>{activePersonnel.map(p=><option key={p.id} value={p.id}>{personLabel(p)}</option>)}</select></label>
        <label>Data<input required type="date" value={hourForm.adjustment_date} onChange={e=>setHourForm({...hourForm,adjustment_date:e.target.value})}/></label>
        <label>Horas (+ crédito / - débito)<input required type="number" step="0.25" value={hourForm.hours} onChange={e=>setHourForm({...hourForm,hours:e.target.value})}/></label>
        <label>Justificativa<input required value={hourForm.reason} onChange={e=>setHourForm({...hourForm,reason:e.target.value})}/></label><button><Plus size={14}/> Lançar ajuste</button>
      </form>
      <div className="mgmt-table-wrap"><table><thead><tr><th>Data</th><th>Policial</th><th>Horas</th><th>Justificativa</th><th></th></tr></thead><tbody>{adjustments.map(x=><tr key={x.id}><td>{x.adjustment_date}</td><td>{personLabel(x.personnel)}</td><td>{fmt(Number(x.hours))}</td><td>{x.reason}</td><td><button className="danger" onClick={()=>remove("instructor_hour_adjustments",x.id)}><Trash2 size={13}/></button></td></tr>)}{!adjustments.length&&<tr><td colSpan={5}>Nenhum ajuste no período selecionado.</td></tr>}</tbody></table></div>
      <div className="mgmt-cards">{activePersonnel.map(p=><div key={p.id}><b>{p.war_name||p.full_name}</b><span>Saldo de ajustes no período: {fmt(adjustmentTotals.get(p.id)||0)}</span></div>)}</div>
    </article>}
    {tab==="goals"&&<article><h3>Metas e desempenho operacional</h3><form onSubmit={e=>{e.preventDefault();insert("operational_goals",{...goalForm,target_value:Number(goalForm.target_value),current_value:Number(goalForm.current_value),created_by:profile.id});}}>
      <label>Meta<input required value={goalForm.title} onChange={e=>setGoalForm({...goalForm,title:e.target.value})}/></label><label>Descrição/indicador<input value={goalForm.description} onChange={e=>setGoalForm({...goalForm,description:e.target.value})}/></label><label>Valor-alvo<input required type="number" min="0" step="0.01" value={goalForm.target_value} onChange={e=>setGoalForm({...goalForm,target_value:e.target.value})}/></label><label>Valor atual<input type="number" min="0" step="0.01" value={goalForm.current_value} onChange={e=>setGoalForm({...goalForm,current_value:e.target.value})}/></label><label>Unidade<input value={goalForm.unit} onChange={e=>setGoalForm({...goalForm,unit:e.target.value})}/></label><label>Início<input type="date" value={goalForm.start_date} onChange={e=>setGoalForm({...goalForm,start_date:e.target.value})}/></label><label>Fim<input type="date" value={goalForm.end_date} onChange={e=>setGoalForm({...goalForm,end_date:e.target.value})}/></label><button><Plus size={14}/> Cadastrar meta</button>
    </form><div className="mgmt-table-wrap"><table><thead><tr><th>Meta</th><th>Progresso</th><th>Prazo</th><th>Status</th><th></th></tr></thead><tbody>{goals.map(x=><tr key={x.id}><td>{x.title}<small>{x.description}</small></td><td>{Number(x.current_value)} / {Number(x.target_value)} {x.unit}</td><td>{x.end_date||"—"}</td><td>{x.status}</td><td><button className="danger" onClick={()=>remove("operational_goals",x.id)}><Trash2 size={13}/></button></td></tr>)}{!goals.length&&<tr><td colSpan={5}>Nenhuma meta cadastrada.</td></tr>}</tbody></table></div></article>}
    {tab==="reports"&&<article><h3>Relatórios gerenciais</h3><div className="mgmt-filters"><label>De<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Até<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div><p>Atividades no período: {activities.length} · Validadas: {activities.filter(x=>x.status==="Validada").length} · Alunos registrados em atividades validadas: {activities.filter(x=>x.status==="Validada").reduce((n,x)=>n+Number(x.students_present||0),0)}</p><div className="mgmt-actions"><button onClick={exportCsv}><Download size={14}/> Exportar CSV compatível com Excel</button><button onClick={printPdf}><Download size={14}/> Imprimir/salvar em PDF</button></div><small>O CSV pode ser aberto no Excel. O PDF é gerado pela função de impressão do navegador.</small></article>}
    {tab==="integrations"&&<article><h3>Referências institucionais</h3><p>Cadastre links, números de processo e referências para consulta. Esta tela não realiza integração automática ou autenticação nos sistemas externos.</p><form onSubmit={e=>{e.preventDefault();insert("institutional_integrations",{...integrationForm,created_by:profile.id});}}>
      <label>Sistema<select value={integrationForm.system_name} onChange={e=>setIntegrationForm({...integrationForm,system_name:e.target.value})}>{["SEI","SGPol","Google Drive","Outro"].map(x=><option key={x}>{x}</option>)}</select></label><label>Tipo de referência<select value={integrationForm.reference_type} onChange={e=>setIntegrationForm({...integrationForm,reference_type:e.target.value})}>{["Processo","Link","Documento","Pasta"].map(x=><option key={x}>{x}</option>)}</select></label><label>Número ou endereço da referência<input required value={integrationForm.reference_value} onChange={e=>setIntegrationForm({...integrationForm,reference_value:e.target.value})}/></label><label>Status<select value={integrationForm.status} onChange={e=>setIntegrationForm({...integrationForm,status:e.target.value})}>{["Ativo","Pendente","Concluído","Arquivado"].map(x=><option key={x}>{x}</option>)}</select></label><label>Observações<input value={integrationForm.notes} onChange={e=>setIntegrationForm({...integrationForm,notes:e.target.value})}/></label><button><Plus size={14}/> Registrar referência</button>
    </form><div className="mgmt-table-wrap"><table><thead><tr><th>Sistema</th><th>Tipo</th><th>Referência</th><th>Status</th><th></th></tr></thead><tbody>{integrations.map(x=><tr key={x.id}><td>{x.system_name}</td><td>{x.reference_type}</td><td>{/^https?:\/\//i.test(x.reference_value)?<a href={x.reference_value} target="_blank" rel="noreferrer">Abrir referência</a>:x.reference_value}</td><td>{x.status}</td><td><button className="danger" onClick={()=>remove("institutional_integrations",x.id)}><Trash2 size={13}/></button></td></tr>)}{!integrations.length&&<tr><td colSpan={5}>Nenhuma referência cadastrada.</td></tr>}</tbody></table></div></article>}
    {tab==="ai"&&<article><h3>Inteligência gerencial e alertas</h3><p>Indicadores transparentes calculados localmente com os dados já disponíveis. Não há envio de dados pessoais para serviços externos.</p><div className="mgmt-insights">
      <div><AlertTriangle/><b>Jornada programada</b><p>{activePersonnel.filter(p=>(scheduledHours.get(p.id)||0)!==30).length} policiais com programação semanal diferente de 30 horas.</p></div><div><Activity/><b>Atividades validadas</b><p>{activities.filter(x=>x.status==="Validada").length} no período selecionado.</p></div><div><Target/><b>Metas cadastradas</b><p>{goals.length} metas, sendo {goals.filter(x=>x.status==="Concluída").length} concluídas.</p></div><div><BrainCircuit/><b>Referências em acompanhamento</b><p>{integrations.filter(x=>["Pendente","Ativo"].includes(x.status)).length} registros ativos ou pendentes.</p></div>
    </div><small>Este painel utiliza regras e indicadores, não é IA generativa. Uma integração com modelo de IA exigiria serviço institucional autorizado, proteção de dados e credenciais mantidas no servidor.</small></article>}
  </section>;
}
