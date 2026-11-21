import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2,
  CalendarCheck, AlertCircle, Clock, UserRound, Shield, ClipboardList, X, Search
} from "lucide-react";

const STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEKDAYS = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];

type Holiday = { id?: string; holiday_date: string; name: string; state_code?: string; kind: "state" | "local" | "national" };
type CalendarActivity = {
  id: string; demand_id: string; instructor_id: string; school_id: string;
  scheduled_date: string; start_time: string; end_time: string; status: string; notes: string | null;
  demands?: { protocol?: string; class_name?: string; activity_type?: string } | null;
  schools?: { name?: string; region?: string } | null;
  instructor?: { full_name?: string } | null;
};
type CalendarScale = {
  id: string; service_date: string; personnel_id: string; duty_type: string;
  shift_start: string; shift_end: string; circumstance: string; notes: string | null;
  personnel?: { full_name?: string; war_name?: string | null; rank?: string; service_number?: string | null } | null;
};
type CalendarAbsence = {
  id: string; full_name: string; war_name?: string | null; rank?: string; service_number?: string | null;
  vacation_start_date?: string | null; vacation_end_date?: string | null; vacation_month?: string | null;
  annual_bonus_dates?: string[] | null; natalicio_leave_date?: string | null;
  edital_leave_start_date?: string | null; edital_leave_end_date?: string | null; edital_leave_days?: number | null;
  reward_leave_start_date?: string | null; reward_leave_end_date?: string | null; reward_leave_days?: number | null;
};
type AbsenceEvent = { id: string; personnel_id: string; name: string; rank?: string; service_number?: string | null; type: string; start: string; end: string; note?: string };
type CalendarDemand = {
  id: string; protocol: string; school_id: string; class_name: string; activity_type: string;
  preferred_date: string | null; preferred_time?: string | null; status: string;
  assigned_to?: string | null; estimated_students?: number | null;
  schools?: { name?: string; region?: string } | null;
  assignee?: { full_name?: string } | null;
};

function localIsoDate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}
function timeLabel(value?: string | null) {
  return value ? String(value).slice(0, 5) : "";
}
function nationalHolidays(year: number): Holiday[] {
  return [
    ["01-01", "Confraternização Universal"], ["04-21", "Tiradentes"],
    ["05-01", "Dia Mundial do Trabalho"], ["09-07", "Independência do Brasil"],
    ["10-12", "Nossa Senhora Aparecida"], ["11-02", "Finados"],
    ["11-15", "Proclamação da República"], ["11-20", "Dia Nacional de Zumbi e da Consciência Negra"],
    ["12-25", "Natal"],
  ].map(([md, name]) => ({ holiday_date: `${year}-${md}`, name, kind: "national" as const }));
}

export default function HolidaysCalendar({ supabase, profile }: { supabase: any; profile: any }) {
  const today = localIsoDate();
  const [state, setState] = useState("DF");
  const [month, setMonth] = useState(Number(today.slice(5, 7)) - 1);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [selectedDate, setSelectedDate] = useState(today);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [activities, setActivities] = useState<CalendarActivity[]>([]);
  const [scales, setScales] = useState<CalendarScale[]>([]);
  const [demands, setDemands] = useState<CalendarDemand[]>([]);
  const [personnel, setPersonnel] = useState<CalendarAbsence[]>([]);
  const [name, setName] = useState("");
  const [holidayDate, setHolidayDate] = useState(today);
  const [kind, setKind] = useState<"state" | "local">("state");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [filterType, setFilterType] = useState("todos");
  const [filterInstructor, setFilterInstructor] = useState("todos");
  const [filterSchool, setFilterSchool] = useState("todos");
  const [selectedEvent, setSelectedEvent] = useState<{type:string;title:string;subtitle:string;details:string[]}|null>(null);
  const isAdmin = profile?.role === "admin";
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${new Date(year, month + 1, 0).getDate()}`;

  async function fetchCalendar() {
    if (!supabase) throw new Error("Banco de dados não configurado.");
    const [pref, holidayResult, scheduleResult, scaleResult, demandResult, personnelResult] = await Promise.all([
      supabase.from("calendar_preferences").select("state_code").eq("id", 1).maybeSingle(),
      supabase.from("calendar_holidays").select("id,holiday_date,name,state_code,kind")
        .eq("state_code", state).gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`).order("holiday_date"),
      (() => { let q = supabase.from("service_schedule")
        .select("id,demand_id,instructor_id,school_id,scheduled_date,start_time,end_time,status,notes,demands(protocol,class_name,activity_type),schools(name,region),instructor:profiles!service_schedule_instructor_id_fkey(full_name)")
        .gte("scheduled_date", monthStart).lte("scheduled_date", monthEnd).order("scheduled_date").order("start_time");
        if (!isAdmin) q = q.eq("instructor_id", profile.id); return q; })(),
      isAdmin ? supabase.from("service_scale_entries")
        .select("id,service_date,personnel_id,duty_type,shift_start,shift_end,circumstance,notes,personnel(id,full_name,war_name,service_number,rank,status)").gte("service_date", monthStart).lte("service_date", monthEnd).order("service_date").order("shift_start") : Promise.resolve({data:[],error:null}),
      (() => { let q = supabase.from("demands")
        .select("id,protocol,school_id,class_name,activity_type,preferred_date,preferred_time,status,assigned_to,estimated_students,schools(name,region),assignee:profiles!demands_assigned_to_fkey(full_name)")
        .gte("preferred_date", monthStart).lte("preferred_date", monthEnd).order("preferred_date");
        if (!isAdmin) q = q.eq("assigned_to", profile.id); return q; })(),
      isAdmin ?       supabase.from("personnel").select("id,full_name,war_name,rank,service_number,vacation_month,vacation_start_date,vacation_end_date,annual_bonus_dates,natalicio_leave_date,edital_leave_start_date,edital_leave_end_date,edital_leave_days,reward_leave_start_date,reward_leave_end_date,reward_leave_days").eq("status", "Ativo") : Promise.resolve({data:[],error:null}),
    ]);

    const errors = [
      holidayResult.error && `Feriados: ${holidayResult.error.message}`,
      scheduleResult.error && `Atividades agendadas: ${scheduleResult.error.message}`,
      scaleResult.error && `Escalas: ${scaleResult.error.message}`,
      demandResult.error && `Demandas: ${demandResult.error.message}`,
      personnelResult.error && `Afastamentos: ${personnelResult.error.message}`,
    ].filter(Boolean);
    return {
      preference: pref.data?.state_code as string | undefined,
      holidays: (holidayResult.data || []) as Holiday[],
      activities: ((scheduleResult.data || []).filter((x:any) => isAdmin || x.instructor_id === profile.id)) as CalendarActivity[],
      scales: (isAdmin ? (scaleResult.data || []) : []) as CalendarScale[],
      demands: ((demandResult.data || []).filter((x:any) => isAdmin || x.assigned_to === profile.id)) as CalendarDemand[],
      personnel: (isAdmin ? (personnelResult.data || []) : []) as CalendarAbsence[],
      errors,
    };
  }

  async function loadCalendar() {
    setLoading(true);
    try {
      const result = await fetchCalendar();
      if (result.preference && result.preference !== state) setState(result.preference);
      setHolidays(result.holidays);
      setActivities(result.activities);
      setScales(result.scales);
      setDemands(result.demands);
      setPersonnel(result.personnel);
      setErrorMessage(result.errors.join(" | "));
    } catch (error: any) {
      setErrorMessage(error?.message || "Não foi possível carregar o calendário.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCalendar(); }, [supabase, state, year, month]);

  const allHolidays = useMemo(
    () => [...nationalHolidays(year), ...holidays].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)),
    [year, holidays]
  );
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  const monthActivities = activities.filter(item => item.scheduled_date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`));
  const monthScales = scales.filter(item => item.service_date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`));
  const monthDemands = demands.filter(item => !!item.preferred_date && item.preferred_date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`));
  const monthAbsences: AbsenceEvent[] = personnel.flatMap(person => {
    const events: AbsenceEvent[] = [];
    const fullName = person.war_name ? `${person.rank || ""} ${person.war_name}`.trim() : `${person.rank || ""} ${person.full_name}`.trim();
    if (person.vacation_start_date && person.vacation_end_date) events.push({id:`vac-${person.id}`,personnel_id:person.id,name:fullName,rank:person.rank,service_number:person.service_number,type:"Férias",start:person.vacation_start_date,end:person.vacation_end_date,note:person.vacation_month ? `Mês previsto: ${person.vacation_month}` : undefined});
    (person.annual_bonus_dates || []).filter(Boolean).forEach((date,index)=>events.push({id:`ab-${person.id}-${index}`,personnel_id:person.id,name:fullName,rank:person.rank,service_number:person.service_number,type:`Abono anual ${index+1}`,start:date,end:date}));
    if(person.natalicio_leave_date) events.push({id:`nat-${person.id}`,personnel_id:person.id,name:fullName,rank:person.rank,service_number:person.service_number,type:"Abono natalício",start:person.natalicio_leave_date,end:person.natalicio_leave_date});
    if(person.edital_leave_start_date && person.edital_leave_end_date) events.push({id:`ed-${person.id}`,personnel_id:person.id,name:fullName,rank:person.rank,service_number:person.service_number,type:"Afastamento por edital",start:person.edital_leave_start_date,end:person.edital_leave_end_date,note:`${person.edital_leave_days||0} dia(s)`});
    if(person.reward_leave_start_date && person.reward_leave_end_date) events.push({id:`rw-${person.id}`,personnel_id:person.id,name:fullName,rank:person.rank,service_number:person.service_number,type:"Dispensa recompensa",start:person.reward_leave_start_date,end:person.reward_leave_end_date,note:`${person.reward_leave_days||0} dia(s)`});
    return events.filter(event=>event.start.slice(0,7)<=`${year}-${String(month+1).padStart(2,"0")}` && event.end.slice(0,7)>=`${year}-${String(month+1).padStart(2,"0")}`);
  });
  const selectedActivities = monthActivities.filter(item => item.scheduled_date === selectedDate);
  const selectedScales = monthScales.filter(item => item.service_date === selectedDate);
  const selectedDemands = monthDemands.filter(item => item.preferred_date === selectedDate);
  const selectedHolidays = allHolidays.filter(item => item.holiday_date === selectedDate);
  const selectedAbsences = monthAbsences.filter(item => selectedDate >= item.start && selectedDate <= item.end);
  const instructorOptions = useMemo(() => {
    const map = new Map<string,string>();
    [...activities.map(x => [x.instructor_id, x.instructor?.full_name] as const),
     ...demands.map(x => [x.assigned_to || "", x.assignee?.full_name] as const),
     ...scales.map(x => [x.personnel_id, x.personnel?.full_name || x.personnel?.war_name] as const)]
      .forEach(([id,label]) => { if(id && label) map.set(id,label); });
    return [...map].map(([id,label])=>({id,label})).sort((a,b)=>a.label.localeCompare(b.label,"pt-BR"));
  },[activities,demands,scales]);
  const schoolOptions = useMemo(() => {
    const map = new Map<string,string>();
    [...activities,...demands].forEach(x=>{if(x.school_id && x.schools?.name) map.set(x.school_id,x.schools.name);});
    return [...map].map(([id,label])=>({id,label})).sort((a,b)=>a.label.localeCompare(b.label,"pt-BR"));
  },[activities,demands]);
  const visibleActivities = selectedActivities.filter(x =>
    (filterType==="todos"||filterType==="atividade") &&
    (filterInstructor==="todos"||x.instructor_id===filterInstructor) &&
    (filterSchool==="todos"||x.school_id===filterSchool));
  const visibleScales = selectedScales.filter(x =>
    (filterType==="todos"||filterType==="escala") &&
    (filterInstructor==="todos"||x.personnel_id===filterInstructor));
  const visibleDemands = selectedDemands.filter(x =>
    (filterType==="todos"||filterType==="demanda") &&
    (filterInstructor==="todos"||(x.assigned_to||"")===filterInstructor) &&
    (filterSchool==="todos"||x.school_id===filterSchool));
  const visibleHolidays = (filterType==="todos"||filterType==="feriado") ? selectedHolidays : [];
  const visibleAbsences = (filterType==="todos"||filterType==="afastamento") ? selectedAbsences : [];
  const visibleEventCount = visibleActivities.length+visibleScales.length+visibleDemands.length+visibleHolidays.length+visibleAbsences.length;


  function moveMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear()); setMonth(next.getMonth());
    setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`);
  }

  async function chooseState(next: string) {
    setState(next); setMessage("");
    const { error } = await supabase.from("calendar_preferences").upsert({
      id: 1, state_code: next, updated_by: profile.id, updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) setErrorMessage(`Não foi possível salvar a UF de referência: ${error.message}`);
    else setMessage(`Estado de referência atualizado para ${next}.`);
  }

  async function addHoliday(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !name.trim() || !holidayDate) return;
    setBusy(true); setMessage(""); setErrorMessage("");
    const { error } = await supabase.from("calendar_holidays").insert({
      holiday_date: holidayDate, name: name.trim(), state_code: state, kind, created_by: profile.id,
    });
    setBusy(false);
    if (error) { setErrorMessage(`Não foi possível cadastrar o feriado: ${error.message}`); return; }
    setName(""); setHolidayDate(today); setMessage("Feriado cadastrado com sucesso.");
    await loadCalendar();
  }

  async function removeHoliday(id?: string) {
    if (!isAdmin || !id || !window.confirm("Deseja excluir este feriado cadastrado?")) return;
    setBusy(true);
    const { error } = await supabase.from("calendar_holidays").delete().eq("id", id);
    setBusy(false);
    if (error) { setErrorMessage(`Não foi possível excluir: ${error.message}`); return; }
    setMessage("Feriado removido."); setHolidays(current => current.filter(item => item.id !== id));
  }


  return (
    <section className="holiday-page">
      <div className="section-head">
        <div><h2><CalendarDays size={21} /> Calendário integrado</h2><p>Feriados, escalas policiais, demandas e atividades programadas do PROERD.</p></div>
        <div className="holiday-calendar-actions">
          {isAdmin && <label className="holiday-state-picker">Estado de referência
            <select value={state} onChange={event => chooseState(event.target.value)}>{STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}</select>
          </label>}
          <button type="button" className="small-secondary" onClick={loadCalendar} disabled={loading || busy}><RefreshCw size={13} /> Atualizar</button>
        </div>
      </div>

      <div className="calendar-filter-bar panel">
        <div className="calendar-filter-title"><Search size={16}/><b>Filtros</b></div>
        <label className="field"><span>Tipo de evento</span><select value={filterType} onChange={e=>setFilterType(e.target.value)}>
          <option value="todos">Todos</option>{isAdmin && <><option value="escala">Escalas</option><option value="demanda">Demandas</option></>}<option value="atividade">Atividades agendadas</option><option value="feriado">Feriados</option>{isAdmin && <option value="afastamento">Afastamentos</option>}
        </select></label>
        {isAdmin && <label className="field"><span>Instrutor / policial</span><select value={filterInstructor} onChange={e=>setFilterInstructor(e.target.value)}>
          <option value="todos">Todos</option>{instructorOptions.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
        </select></label>}
        <label className="field"><span>Escola</span><select value={filterSchool} onChange={e=>setFilterSchool(e.target.value)}>
          <option value="todos">Todas</option>{schoolOptions.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
        </select></label>
        <button type="button" className="small-secondary" onClick={()=>{setFilterType("todos");setFilterInstructor("todos");setFilterSchool("todos");}}>Limpar filtros</button>
      </div>
      <div className="panel" style={{marginBottom:12}}>
        <h3>Resumo mensal de afastamentos · {MONTHS[month]} / {year}</h3>
        <div className="stats">
          <div><b>{monthAbsences.length}</b><small>Registros no mês</small></div>
          <div><b>{monthAbsences.filter(a=>a.type==="Férias").length}</b><small>Férias</small></div>
          <div><b>{monthAbsences.filter(a=>a.type.startsWith("Abono anual")).length}</b><small>Abonos anuais</small></div>
          <div><b>{monthAbsences.filter(a=>a.type==="Abono natalício").length}</b><small>Abonos natalícios</small></div>
          <div><b>{monthAbsences.filter(a=>a.type==="Afastamento por edital").length}</b><small>Edital</small></div>
          <div><b>{monthAbsences.filter(a=>a.type==="Dispensa recompensa").length}</b><small>Recompensa</small></div>
        </div>
      </div>
      <div className="holiday-layout">
        <div className="panel holiday-calendar">
          <div className="calendar-toolbar">
            <button type="button" className="small-secondary" onClick={() => moveMonth(-1)} aria-label="Mês anterior"><ChevronLeft size={17} /></button>
            <h3>{MONTHS[month]} de {year}</h3>
            <button type="button" className="small-secondary" onClick={() => moveMonth(1)} aria-label="Próximo mês"><ChevronRight size={17} /></button>
          </div>
          <div className="calendar-grid">
            {WEEKDAYS.map(day => <b className="calendar-weekday" key={day}>{day}</b>)}
            {Array.from({ length: offset }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayActivities = monthActivities.filter(item => item.scheduled_date === iso && (filterType==="todos"||filterType==="atividade") && (filterInstructor==="todos"||item.instructor_id===filterInstructor) && (filterSchool==="todos"||item.school_id===filterSchool));
              const dayScales = monthScales.filter(item => item.service_date === iso && (filterType==="todos"||filterType==="escala") && (filterInstructor==="todos"||item.personnel_id===filterInstructor));
              const dayDemands = monthDemands.filter(item => item.preferred_date === iso && (filterType==="todos"||filterType==="demanda") && (filterInstructor==="todos"||(item.assigned_to||"")===filterInstructor) && (filterSchool==="todos"||item.school_id===filterSchool));
              const dayHolidays = allHolidays.filter(item => item.holiday_date === iso && (filterType==="todos"||filterType==="feriado"));
              const dayAbsences = monthAbsences.filter(item => iso >= item.start && iso <= item.end && (filterType==="todos"||filterType==="afastamento"));
              const selected = selectedDate === iso;
              return (
                <button type="button" key={iso}
                  className={`calendar-day calendar-day-button ${dayHolidays.length ? "has-holiday" : ""} ${dayActivities.length || dayScales.length || dayDemands.length || dayAbsences.length ? "has-activity" : ""} ${today === iso ? "today" : ""} ${selected ? "selected-day" : ""}`}
                  onClick={() => setSelectedDate(iso)} aria-pressed={selected}>
                  <span>{day}</span>
                  {dayHolidays.slice(0, 1).map((item, i) => <small className="calendar-holiday-label" key={`h-${i}`} title={item.name}>{item.name}</small>)}
                  {dayActivities.slice(0, 1).map((item, i) => <small className="calendar-activity-label" key={`a-${i}`} title="Atividade agendada">{timeLabel(item.start_time)} · {item.schools?.name || "Atividade"}</small>)}
                  {dayScales.slice(0, 1).map((item, i) => <small className="calendar-scale-label" key={`s-${i}`} title="Escala de serviço">Escala · {item.personnel?.war_name || item.personnel?.full_name || "Policial"}</small>)}
                  {dayDemands.slice(0, 1).map((item, i) => <small className="calendar-demand-label" key={`d-${i}`} title="Demanda com data preferencial">Demanda · {item.schools?.name || "Escola"}</small>)}
                  {dayAbsences.length>0 && <small className="calendar-absence-label">{dayAbsences.length} afastamento(s)</small>}
                  {(dayActivities.length + dayScales.length + dayDemands.length + dayHolidays.length + dayAbsences.length > 4) && <small>+ mais eventos</small>}
                </button>
              );
            })}
          </div>
          <div className="holiday-legend">
            <span><i className="national-dot" /> Feriado</span>
            <span><i className="activity-dot" /> Atividade agendada</span>
            <span><i className="scale-dot" /> Escala policial</span>
            <span><i className="demand-dot" /> Demanda</span>
            <span><i className="absence-dot" /> Afastamentos</span>
          </div>
          {loading && <p className="muted">Atualizando calendário...</p>}
        </div>

        <aside className="panel holiday-list">
          <div className="holiday-list-heading">
            <h3><CalendarCheck size={17} /> {dateLabel(selectedDate)}</h3>
            <span className="count">{visibleEventCount} eventos</span>
          </div>

          {visibleHolidays.map((item, index) => <div className="holiday-row" key={`holiday-${index}`}>
            <div><b>{item.name}</b><small>{item.kind === "national" ? "Feriado nacional" : item.kind === "state" ? `Estadual · ${state}` : `Local · ${state}`}</small></div>
            {item.kind !== "national" && isAdmin && <button type="button" className="small-danger" onClick={() => removeHoliday(item.id)} disabled={busy} title="Excluir feriado"><Trash2 size={14} /></button>}
          </div>)}

          {visibleAbsences.map(item => <button type="button" className="calendar-event-row calendar-event-card absence-card" key={`absence-${item.id}`} onClick={()=>setSelectedEvent({
            type:item.type,title:item.name,subtitle:`${dateLabel(item.start)}${item.start!==item.end ? ` até ${dateLabel(item.end)}` : " (1 dia)"}`,
            details:[`Tipo: ${item.type}`,`Policial: ${item.name}`,`Matrícula: ${item.service_number||"Não informada"}`,`Período: ${dateLabel(item.start)} a ${dateLabel(item.end)}`,item.note||"Registro individual do cadastro de pessoal"]
          })}><div className="calendar-event-time"><CalendarCheck size={14}/><b>{item.type}</b></div><b>{item.name}</b><small>{item.start===item.end ? dateLabel(item.start) : `${dateLabel(item.start)} a ${dateLabel(item.end)}`}</small>{item.service_number && <small>Matrícula: {item.service_number}</small>}{item.note && <small>{item.note}</small>}</button>)}

          {visibleScales.map(item => <button type="button" className="calendar-event-row calendar-event-card scale-card" key={`scale-${item.id}`} onClick={()=>setSelectedEvent({
            type:"Escala policial", title:`${item.personnel?.rank||""} ${item.personnel?.war_name||item.personnel?.full_name||"Policial"}`.trim(),
            subtitle:`${timeLabel(item.shift_start)} às ${timeLabel(item.shift_end)}`,
            details:[`Nome completo: ${item.personnel?.full_name||"Não informado"}`,`Classificação: ${item.duty_type}`,`Circunstância: ${item.circumstance}`,`Matrícula: ${item.personnel?.service_number||"Não informada"}`,`Observações: ${item.notes||"Nenhuma"}`,`Data: ${dateLabel(item.service_date)}`]
          })}>
            <div className="calendar-event-time"><Shield size={14} /><b>Escala · {timeLabel(item.shift_start)} às {timeLabel(item.shift_end)}</b></div>
            <b>{item.personnel?.rank || ""} {item.personnel?.war_name || item.personnel?.full_name || "Policial"}</b>
            {item.personnel?.war_name && item.personnel?.full_name && <small>Nome completo: {item.personnel.full_name}</small>}
            <small>{item.duty_type} · {item.circumstance}</small>
            {item.personnel?.service_number && <small>Matrícula: {item.personnel.service_number}</small>}
            {item.notes && <small>{item.notes}</small>}
          </button>)}

          {visibleDemands.map(item => <button type="button" className="calendar-event-row calendar-event-card demand-card" key={`demand-${item.id}`} onClick={()=>setSelectedEvent({
            type:"Demanda escolar",title:item.schools?.name||"Escola não informada",subtitle:`${item.class_name} · ${item.activity_type}`,
            details:[`Protocolo: ${item.protocol}`,`Data preferencial: ${dateLabel(item.preferred_date||selectedDate)}`,`Horário preferencial: ${timeLabel(item.preferred_time)||"A definir"}`,`Situação: ${item.status}`,`Instrutor: ${item.assignee?.full_name||"Não designado"}`,`Alunos estimados: ${item.estimated_students??"Não informado"}`,`Região: ${item.schools?.region||"Não informada"}`]
          })}>
            <div className="calendar-event-time"><ClipboardList size={14} /><b>Demanda · {item.preferred_time ? timeLabel(item.preferred_time) : "Horário a definir"}</b></div>
            <b>{item.schools?.name || "Escola não informada"}</b>
            <small>{item.class_name} · {item.activity_type}</small>
            <small>Protocolo: {item.protocol}</small>
            <small>Situação: {item.status} · Data preferencial, não confirmação de agendamento</small>
            {item.assignee?.full_name && <small>Instrutor: {item.assignee.full_name}</small>}
            {item.estimated_students && <small>{item.estimated_students} alunos estimados</small>}
          </button>)}

          {visibleActivities.map(item => <button type="button" className="calendar-event-row calendar-event-card activity-card" key={`activity-${item.id}`} onClick={()=>setSelectedEvent({
            type:"Atividade agendada",title:item.schools?.name||"Escola não informada",subtitle:`${timeLabel(item.start_time)} às ${timeLabel(item.end_time)}`,
            details:[`Data: ${dateLabel(item.scheduled_date)}`,`Turma: ${item.demands?.class_name||"Não informada"}`,`Atividade: ${item.demands?.activity_type||"Não informada"}`,`Instrutor: ${item.instructor?.full_name||"Não informado"}`,`Situação: ${item.status}`,`Protocolo: ${item.demands?.protocol||"Não informado"}`,`Observações: ${item.notes||"Nenhuma"}`]
          })}>
            <div className="calendar-event-time"><Clock size={14} /><b>Atividade · {timeLabel(item.start_time)} às {timeLabel(item.end_time)}</b></div>
            <b>{item.schools?.name || "Escola não informada"}</b>
            <small>{item.demands?.class_name || "Turma não informada"} · {item.demands?.activity_type || "Atividade PROERD"}</small>
            <small className="calendar-event-instructor"><UserRound size={12} /> {item.instructor?.full_name || "Instrutor não informado"}</small>
            <span className={`status ${item.status === "Realizada" ? "green" : item.status === "Cancelada" ? "red" : item.status === "Agendada" ? "amber" : "blue"}`}>{item.status}</span>
            {item.demands?.protocol && <small>Protocolo: {item.demands.protocol}</small>}
            {item.notes && <small>{item.notes}</small>}
          </button>)}

          {visibleEventCount===0 && <p className="muted">Não há eventos para esta data com os filtros selecionados.</p>}
        </aside>
      </div>

      {selectedEvent && <div className="calendar-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedEvent(null);}}>
        <section className="calendar-event-modal panel" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title">
          <div className="calendar-modal-header"><div><span className="calendar-modal-type">{selectedEvent.type}</span><h3 id="calendar-event-title">{selectedEvent.title}</h3><p>{selectedEvent.subtitle}</p></div>
            <button type="button" className="small-secondary" onClick={()=>setSelectedEvent(null)} aria-label="Fechar detalhes"><X size={17}/></button>
          </div>
          <div className="calendar-modal-details">{selectedEvent.details.map((line,i)=><div key={i}>{line}</div>)}</div>
          <div className="calendar-modal-footer"><button type="button" className="small-primary" onClick={()=>setSelectedEvent(null)}>Fechar</button></div>
        </section>
      </div>}
      {isAdmin && <form className="panel holiday-form" onSubmit={addHoliday}>
        <h3><Plus size={18} /> Cadastrar feriado estadual ou local</h3>
        <p className="muted">Os feriados nacionais fixos são exibidos automaticamente. Cadastre datas estaduais ou municipais após conferir o calendário oficial aplicável.</p>
        <div className="form-row">
          <label className="field"><span>Nome do feriado</span><input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Data Magna do Estado" /></label>
          <label className="field"><span>Data</span><input required type="date" value={holidayDate} onChange={event => setHolidayDate(event.target.value)} /></label>
          <label className="field"><span>Abrangência</span><select value={kind} onChange={event => setKind(event.target.value as "state" | "local")}><option value="state">Estadual</option><option value="local">Local / municipal</option></select></label>
          <button className="primary" disabled={busy}><Plus size={15} /> {busy ? "Salvando..." : "Cadastrar"}</button>
        </div>
      </form>}

      {errorMessage && <p className="notice holiday-error"><AlertCircle size={15} /> {errorMessage}</p>}
      {message && <p className="notice">{message}</p>}
      <p className="muted holiday-disclaimer">Demandas exibidas nesta tela representam datas preferenciais solicitadas. A confirmação do atendimento depende da programação na agenda. A lista nacional contempla feriados nacionais fixos; pontos facultativos e feriados locais devem ser conferidos no calendário oficial vigente.</p>
    </section>
  );
}
