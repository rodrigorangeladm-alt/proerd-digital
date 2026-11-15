import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BrainCircuit, CalendarDays, Check, Download, FileSpreadsheet, Link2, Pencil, Plus, RefreshCw, Save, Target, Trash2, Wallet, X } from "lucide-react";

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
  const [editingGoalId,setEditingGoalId] = useState<string | null>(null);
  const [integrationForm,setIntegrationForm] = useState({system_name:"SEI",reference_type:"Processo",reference_value:"",status:"Ativo",notes:""});
  const [editingIntegrationId,setEditingIntegrationId] = useState<string | null>(null);
  const [integrationSearch,setIntegrationSearch] = useState("");
  const [integrationSystemFilter,setIntegrationSystemFilter] = useState("Todos");
  const [integrationStatusFilter,setIntegrationStatusFilter] = useState("Todos");
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
  async function saveGoal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!goalForm.title.trim()) { setMessage("Informe o nome da meta."); return; }
    if (Number(goalForm.target_value) < 0 || Number(goalForm.current_value) < 0) { setMessage("Os valores da meta não podem ser negativos."); return; }
    if (goalForm.start_date && goalForm.end_date && goalForm.end_date < goalForm.start_date) { setMessage("A data final não pode ser anterior à data inicial."); return; }
    const payload = { ...goalForm, title: goalForm.title.trim(), description: goalForm.description.trim() || null, target_value: Number(goalForm.target_value), current_value: Number(goalForm.current_value), unit: goalForm.unit.trim() || "unidades" };
    const result = editingGoalId
      ? await supabase.from("operational_goals").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingGoalId)
      : await supabase.from("operational_goals").insert({ ...payload, created_by: profile.id });
    setMessage(result.error ? result.error.message : editingGoalId ? "Meta atualizada com sucesso." : "Meta cadastrada com sucesso.");
    if (!result.error) { setEditingGoalId(null); setGoalForm({title:"",description:"",target_value:"",current_value:"0",unit:"atividades",start_date:localDate(),end_date:plusDays(localDate(),30),status:"Em andamento"}); await load(); }
  }
  function editGoal(goal: Goal) {
    setEditingGoalId(goal.id);
    setGoalForm({ title:goal.title, description:goal.description || "", target_value:String(goal.target_value), current_value:String(goal.current_value), unit:goal.unit, start_date:goal.start_date || "", end_date:goal.end_date || "", status:goal.status });
    setMessage("Editando meta selecionada. Altere os campos e salve.");
  }
  function cancelGoalEdit() {
    setEditingGoalId(null);
    setGoalForm({title:"",description:"",target_value:"",current_value:"0",unit:"atividades",start_date:localDate(),end_date:plusDays(localDate(),30),status:"Em andamento"});
    setMessage("Edição cancelada.");
  }
  async function remove(table:string,id:string) { if(!window.confirm("Confirma a exclusão deste registro?")) return; const {error}=await supabase.from(table).delete().eq("id",id); setMessage(error?error.message:"Registro excluído."); if(!error) await load(); }
  async function saveIntegration(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!integrationForm.reference_value.trim()) { setMessage("Informe o número ou endereço da referência."); return; }
    const payload = { ...integrationForm, system_name: integrationForm.system_name.trim(), reference_type: integrationForm.reference_type.trim(), reference_value: integrationForm.reference_value.trim(), notes: integrationForm.notes.trim() || null };
    const result = editingIntegrationId
      ? await supabase.from("institutional_integrations").update(payload).eq("id", editingIntegrationId)
      : await supabase.from("institutional_integrations").insert({ ...payload, created_by: profile.id });
    setMessage(result.error ? result.error.message : editingIntegrationId ? "Referência atualizada com sucesso." : "Referência cadastrada com sucesso.");
    if (!result.error) {
      setEditingIntegrationId(null);
      setIntegrationForm({system_name:"SEI",reference_type:"Processo",reference_value:"",status:"Ativo",notes:""});
      await load();
    }
  }
  function editIntegration(item: Integration) {
    setEditingIntegrationId(item.id);
    setIntegrationForm({system_name:item.system_name,reference_type:item.reference_type,reference_value:item.reference_value,status:item.status,notes:item.notes || ""});
    setMessage("Editando referência selecionada. Altere os campos e salve.");
  }
  function cancelIntegrationEdit() {
    setEditingIntegrationId(null);
    setIntegrationForm({system_name:"SEI",reference_type:"Processo",reference_value:"",status:"Ativo",notes:""});
    setMessage("Edição da referência cancelada.");
  }

  function exportCsv() {
    const rows=[["Grupo","Data","Responsável/Meta","Descrição/Status","Quantidade"],
      ...scales.map(x=>["Escala",x.service_date,personLabel(x.personnel),`${x.duty_type}: ${x.shift_start}-${x.shift_end}`,durationHours(x.shift_start,x.shift_end)]),
      ...adjustments.map(x=>["Banco de horas",x.adjustment_date,personLabel(x.personnel),x.reason,x.hours]),
      ...activities.map(x=>["Atividade",x.performed_on,personnel.find(p=>p.id===x.instructor_id)?personLabel(personnel.find(p=>p.id===x.instructor_id)):"Instrutor não identificado",x.status,x.students_present]),
      ...goals.map(x=>["Meta",x.start_date||"",x.title,`${x.status} · prazo ${x.end_date||"não definido"}`,`${x.current_value}/${x.target_value} ${x.unit}`])];
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
    {tab==="goals"&&<article><h3>Metas e desempenho operacional</h3>
      <div className="mgmt-cards">
        <div><b>{goals.length}</b><span>Metas cadastradas</span></div>
        <div><b>{goals.filter(g=>g.status==="Concluída").length}</b><span>Metas concluídas</span></div>
        <div><b>{goals.filter(g=>g.status==="Em andamento").length}</b><span>Em andamento</span></div>
        <div><b>{goals.filter(g=>g.end_date && g.end_date < localDate() && g.status!=="Concluída" && g.status!=="Suspensa").length}</b><span>Com prazo vencido</span></div>
      </div>
      <h4>{editingGoalId ? "Editar meta" : "Cadastrar nova meta"}</h4>
      <form onSubmit={saveGoal}>
        <label>Nome da meta<input required value={goalForm.title} onChange={e=>setGoalForm({...goalForm,title:e.target.value})} placeholder="Ex.: Formar 500 alunos no semestre"/></label>
        <label>Descrição/indicador<input value={goalForm.description} onChange={e=>setGoalForm({...goalForm,description:e.target.value})} placeholder="Descreva o resultado esperado"/></label>
        <label>Valor-alvo<input required type="number" min="0" step="0.01" value={goalForm.target_value} onChange={e=>setGoalForm({...goalForm,target_value:e.target.value})}/></label>
        <label>Valor alcançado<input required type="number" min="0" step="0.01" value={goalForm.current_value} onChange={e=>setGoalForm({...goalForm,current_value:e.target.value})}/></label>
        <label>Unidade de medida<input required value={goalForm.unit} onChange={e=>setGoalForm({...goalForm,unit:e.target.value})} placeholder="alunos, escolas, turmas..."/></label>
        <label>Status<select value={goalForm.status} onChange={e=>setGoalForm({...goalForm,status:e.target.value})}>{["Não iniciada","Em andamento","Concluída","Suspensa"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Data de início<input type="date" value={goalForm.start_date} onChange={e=>setGoalForm({...goalForm,start_date:e.target.value})}/></label>
        <label>Prazo final<input type="date" value={goalForm.end_date} onChange={e=>setGoalForm({...goalForm,end_date:e.target.value})}/></label>
        <div className="mgmt-actions"><button type="submit">{editingGoalId?<><Save size={14}/> Salvar alterações</>:<><Plus size={14}/> Cadastrar meta</>}</button>{editingGoalId&&<button type="button" onClick={cancelGoalEdit}><X size={14}/> Cancelar edição</button>}</div>
      </form>
      <div className="mgmt-table-wrap"><table><thead><tr><th>Meta/indicador</th><th>Progresso</th><th>Prazo</th><th>Status</th><th>Ações</th></tr></thead><tbody>
        {goals.map(x=>{const pct=x.target_value>0?Math.min(100,Math.max(0,(Number(x.current_value)/Number(x.target_value))*100)):0; const overdue=!!x.end_date&&x.end_date<localDate()&&x.status!=="Concluída"&&x.status!=="Suspensa"; return <tr key={x.id}>
          <td><b>{x.title}</b><small>{x.description}</small></td>
          <td><div>{Number(x.current_value).toLocaleString("pt-BR")} / {Number(x.target_value).toLocaleString("pt-BR")} {x.unit}</div><div style={{height:7,background:"#e8eef4",borderRadius:8,overflow:"hidden",minWidth:100,marginTop:6}}><div style={{height:"100%",width:`${pct}%`,background:pct>=100?"#2f855a":"#27618f",borderRadius:8}}/></div><small>{pct.toLocaleString("pt-BR",{maximumFractionDigits:1})}% concluído</small></td>
          <td>{x.end_date||"Sem prazo"}{overdue&&<small style={{color:"#a83a3a"}}>Prazo vencido</small>}</td><td>{x.status}</td>
          <td><div className="mgmt-actions"><button type="button" onClick={()=>editGoal(x)}><Pencil size={13}/> Editar</button><button type="button" className="danger" onClick={()=>remove("operational_goals",x.id)}><Trash2 size={13}/></button></div></td>
        </tr>;})}
        {!goals.length&&<tr><td colSpan={5}>Nenhuma meta cadastrada.</td></tr>}
      </tbody></table></div>
    </article>}
    {tab==="reports"&&<article>
      <h3>Relatórios gerenciais</h3>
      <p>Consolidação das atividades registradas, validações, participação de alunos, escalas e banco de horas no período selecionado.</p>
      <div className="mgmt-filters">
        <label>Data inicial<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label>
        <label>Data final<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label>
      </div>
      <div className="mgmt-cards">
        <div><b>{activities.length}</b><span>Atividades registradas</span></div>
        <div><b>{activities.filter(x=>x.status==="Validada").length}</b><span>Atividades validadas</span></div>
        <div><b>{activities.filter(x=>x.status!=="Validada").length}</b><span>Outros status</span></div>
        <div><b>{activities.filter(x=>x.status==="Validada").reduce((n,x)=>n+Number(x.students_present||0),0).toLocaleString("pt-BR")}</b><span>Alunos em atividades validadas</span></div>
      </div>
      <h4>Atividades no período</h4>
      <div className="mgmt-table-wrap"><table><thead><tr><th>Data</th><th>Instrutor</th><th>Status</th><th>Alunos presentes</th></tr></thead><tbody>
        {activities.map((x,i)=>{const p=personnel.find(person=>person.id===x.instructor_id);return <tr key={`${x.performed_on}-${x.instructor_id}-${i}`}><td>{x.performed_on}</td><td>{p?personLabel(p):"Instrutor não identificado"}</td><td>{x.status||"Não informado"}</td><td>{Number(x.students_present||0).toLocaleString("pt-BR")}</td></tr>;})}
        {!activities.length&&<tr><td colSpan={4}>Nenhuma atividade encontrada no período selecionado.</td></tr>}
      </tbody></table></div>
      <h4>Indicadores complementares</h4>
      <p>Metas cadastradas: {goals.length} · Metas concluídas: {goals.filter(x=>x.status==="Concluída").length} · Ajustes de banco de horas no período: {adjustments.length} · Designações carregadas na semana de referência: {scales.length}.</p>
      <div className="mgmt-actions"><button onClick={exportCsv}><Download size={14}/> Exportar relatório CSV para Excel</button><button onClick={printPdf}><Download size={14}/> Imprimir ou salvar relatório em PDF</button></div>
      <small>O CSV é compatível com Excel. O PDF é produzido pela impressão do navegador. Os indicadores refletem os registros disponíveis no sistema e não substituem conferência administrativa.</small>
    </article>}
    {tab==="integrations"&&<article>
      <h3>Integrações e referências institucionais</h3>
      <p>Organize processos, documentos e endereços de consulta do SEI, SGPol, Google Drive e outros sistemas. Esta tela mantém referências e situação de acompanhamento, mas não autentica nem consulta automaticamente os sistemas externos.</p>
      <div className="mgmt-cards">
        <div><b>{integrations.length}</b><span>Referências cadastradas</span></div>
        <div><b>{integrations.filter(x=>x.status==="Ativo").length}</b><span>Ativas</span></div>
        <div><b>{integrations.filter(x=>x.status==="Pendente").length}</b><span>Pendentes</span></div>
        <div><b>{integrations.filter(x=>x.status==="Concluído").length}</b><span>Concluídas</span></div>
      </div>
      <h3>{editingIntegrationId ? "Editar referência institucional" : "Cadastrar referência institucional"}</h3>
      <form onSubmit={saveIntegration}>
        <label>Sistema<select value={integrationForm.system_name} onChange={e=>setIntegrationForm({...integrationForm,system_name:e.target.value})}>{["SEI","SGPol","Google Drive","E-mail institucional","Outro"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Tipo de referência<select value={integrationForm.reference_type} onChange={e=>setIntegrationForm({...integrationForm,reference_type:e.target.value})}>{["Processo","Link","Documento","Pasta","Protocolo","Outro"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Número ou endereço da referência<input required value={integrationForm.reference_value} onChange={e=>setIntegrationForm({...integrationForm,reference_value:e.target.value})} placeholder="Número de processo ou endereço eletrônico"/></label>
        <label>Status<select value={integrationForm.status} onChange={e=>setIntegrationForm({...integrationForm,status:e.target.value})}>{["Ativo","Pendente","Concluído","Arquivado"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Observações<input value={integrationForm.notes} onChange={e=>setIntegrationForm({...integrationForm,notes:e.target.value})} placeholder="Responsável, providência ou contexto"/></label>
        <div className="mgmt-actions"><button type="submit">{editingIntegrationId ? <Save size={14}/> : <Plus size={14}/>} {editingIntegrationId ? "Salvar alterações" : "Registrar referência"}</button>{editingIntegrationId && <button type="button" onClick={cancelIntegrationEdit}><X size={14}/> Cancelar edição</button>}</div>
      </form>
      <h3>Referências cadastradas</h3>
      <div className="mgmt-filters">
        <label>Pesquisar<input value={integrationSearch} onChange={e=>setIntegrationSearch(e.target.value)} placeholder="Sistema, número, link ou observação"/></label>
        <label>Filtrar por sistema<select value={integrationSystemFilter} onChange={e=>setIntegrationSystemFilter(e.target.value)}>{["Todos","SEI","SGPol","Google Drive","E-mail institucional","Outro"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Filtrar por situação<select value={integrationStatusFilter} onChange={e=>setIntegrationStatusFilter(e.target.value)}>{["Todos","Ativo","Pendente","Concluído","Arquivado"].map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      <div className="mgmt-table-wrap"><table><thead><tr><th>Sistema</th><th>Tipo</th><th>Referência</th><th>Situação</th><th>Observações</th><th>Ações</th></tr></thead><tbody>
        {integrations.filter(x=>(integrationSystemFilter==="Todos"||x.system_name===integrationSystemFilter)&&(integrationStatusFilter==="Todos"||x.status===integrationStatusFilter)&&`${x.system_name} ${x.reference_type} ${x.reference_value} ${x.notes||""}`.toLocaleLowerCase("pt-BR").includes(integrationSearch.toLocaleLowerCase("pt-BR"))).map(x=><tr key={x.id}><td>{x.system_name}</td><td>{x.reference_type}</td><td>{/^https?:\/\//i.test(x.reference_value)?<a href={x.reference_value} target="_blank" rel="noreferrer">Abrir referência</a>:x.reference_value}</td><td>{x.status}</td><td>{x.notes||"—"}</td><td><div className="mgmt-actions"><button type="button" onClick={()=>editIntegration(x)}><Pencil size={13}/> Editar</button><button type="button" className="danger" onClick={()=>remove("institutional_integrations",x.id)}><Trash2 size={13}/></button></div></td></tr>)}
        {!integrations.length&&<tr><td colSpan={6}>Nenhuma referência cadastrada.</td></tr>}
        {integrations.length>0&&integrations.filter(x=>(integrationSystemFilter==="Todos"||x.system_name===integrationSystemFilter)&&(integrationStatusFilter==="Todos"||x.status===integrationStatusFilter)&&`${x.system_name} ${x.reference_type} ${x.reference_value} ${x.notes||""}`.toLocaleLowerCase("pt-BR").includes(integrationSearch.toLocaleLowerCase("pt-BR")).length===0&&<tr><td colSpan={6}>Nenhuma referência corresponde aos filtros.</td></tr>}
      </tbody></table></div>
      <small>Os registros usam a tabela institutional_integrations existente. Integrações automáticas com APIs exigem autorização institucional, credenciais protegidas no servidor e avaliação de segurança e LGPD.</small>
    </article>}
    {tab==="ai"&&<article><h3>Inteligência gerencial e alertas</h3><p>Indicadores transparentes calculados localmente com os dados já disponíveis. Não há envio de dados pessoais para serviços externos.</p><div className="mgmt-insights">
      <div><AlertTriangle/><b>Jornada programada</b><p>{activePersonnel.filter(p=>(scheduledHours.get(p.id)||0)!==30).length} policiais com programação semanal diferente de 30 horas.</p></div><div><Activity/><b>Atividades validadas</b><p>{activities.filter(x=>x.status==="Validada").length} no período selecionado.</p></div><div><Target/><b>Metas cadastradas</b><p>{goals.length} metas, sendo {goals.filter(x=>x.status==="Concluída").length} concluídas.</p></div><div><BrainCircuit/><b>Referências em acompanhamento</b><p>{integrations.filter(x=>["Pendente","Ativo"].includes(x.status)).length} registros ativos ou pendentes.</p></div>
    </div><small>Este painel utiliza regras e indicadores, não é IA generativa. Uma integração com modelo de IA exigiria serviço institucional autorizado, proteção de dados e credenciais mantidas no servidor.</small></article>}
  </section>;
}
