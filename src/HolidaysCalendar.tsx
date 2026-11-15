import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2,
  CalendarCheck, AlertCircle, Clock, School, UserRound
} from "lucide-react";

const STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEKDAYS = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];

type HolidayKind = "state" | "local" | "national";
type Holiday = { id?: string; holiday_date: string; name: string; state_code?: string; kind: HolidayKind };
type CalendarActivity = {
  id: string;
  demand_id: string;
  instructor_id: string;
  school_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  demands?: { protocol?: string; class_name?: string; activity_type?: string } | null;
  schools?: { name?: string; region?: string } | null;
  instructor?: { full_name?: string } | null;
};

function localIsoDate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}
function timeLabel(value: string) {
  return String(value || "").slice(0, 5);
}
function nationalHolidays(year: number): Holiday[] {
  return [
    ["01-01", "Confraternização Universal"],
    ["04-21", "Tiradentes"],
    ["05-01", "Dia Mundial do Trabalho"],
    ["09-07", "Independência do Brasil"],
    ["10-12", "Nossa Senhora Aparecida"],
    ["11-02", "Finados"],
    ["11-15", "Proclamação da República"],
    ["11-20", "Dia Nacional de Zumbi e da Consciência Negra"],
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
  const [name, setName] = useState("");
  const [holidayDate, setHolidayDate] = useState(today);
  const [kind, setKind] = useState<"state" | "local">("state");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) {
        if (active) { setErrorMessage("Banco de dados não configurado."); setLoading(false); }
        return;
      }
      setLoading(true);
      const [preferenceResult, holidayResult, scheduleResult] = await Promise.all([
        supabase.from("calendar_preferences").select("state_code").eq("id", 1).maybeSingle(),
        supabase.from("calendar_holidays").select("id,holiday_date,name,state_code,kind")
          .eq("state_code", state).gte("holiday_date", `${year}-01-01`)
          .lte("holiday_date", `${year}-12-31`).order("holiday_date"),
        supabase.from("service_schedule")
          .select("id,demand_id,instructor_id,school_id,scheduled_date,start_time,end_time,status,notes,demands(protocol,class_name,activity_type),schools(name,region),instructor:profiles!service_schedule_instructor_id_fkey(full_name)")
          .gte("scheduled_date", `${year}-${String(month + 1).padStart(2, "0")}-01`)
          .lte("scheduled_date", `${year}-${String(month + 1).padStart(2, "0")}-${new Date(year, month + 1, 0).getDate()}`)
          .order("scheduled_date").order("start_time"),
      ]);
      if (!active) return;
      if (preferenceResult.data?.state_code && preferenceResult.data.state_code !== state) setState(preferenceResult.data.state_code);
      if (holidayResult.error) {
        setHolidays([]);
        setErrorMessage(`Falha ao carregar feriados: ${holidayResult.error.message}`);
      } else {
        setHolidays(holidayResult.data || []);
        setErrorMessage("");
      }
      if (scheduleResult.error) {
        setActivities([]);
        setErrorMessage(current => current ? `${current} | Falha ao carregar atividades: ${scheduleResult.error.message}` : `Falha ao carregar atividades: ${scheduleResult.error.message}`);
      } else {
        setActivities(scheduleResult.data || []);
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [supabase, state, year, month]);

  const allHolidays = useMemo(
    () => [...nationalHolidays(year), ...holidays].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)),
    [year, holidays]
  );
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  const monthActivities = activities.filter(item => item.scheduled_date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`));
  const monthHolidays = allHolidays.filter(item => Number(item.holiday_date.slice(5, 7)) === month + 1);
  const selectedActivities = monthActivities.filter(item => item.scheduled_date === selectedDate);
  const selectedHolidays = allHolidays.filter(item => item.holiday_date === selectedDate);

  function moveMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`);
  }

  async function chooseState(next: string) {
    setState(next);
    setMessage("");
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
    const { data } = await supabase.from("calendar_holidays").select("id,holiday_date,name,state_code,kind")
      .eq("state_code", state).gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`).order("holiday_date");
    setHolidays(data || []);
  }

  async function removeHoliday(id?: string) {
    if (!isAdmin || !id || !window.confirm("Deseja excluir este feriado cadastrado?")) return;
    setBusy(true);
    const { error } = await supabase.from("calendar_holidays").delete().eq("id", id);
    setBusy(false);
    if (error) { setErrorMessage(`Não foi possível excluir: ${error.message}`); return; }
    setMessage("Feriado removido.");
    setHolidays(current => current.filter(item => item.id !== id));
  }

  async function refreshCalendar() {
    setLoading(true);
    const [h, s] = await Promise.all([
      supabase.from("calendar_holidays").select("id,holiday_date,name,state_code,kind")
        .eq("state_code", state).gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`).order("holiday_date"),
      supabase.from("service_schedule")
        .select("id,demand_id,instructor_id,school_id,scheduled_date,start_time,end_time,status,notes,demands(protocol,class_name,activity_type),schools(name,region),instructor:profiles!service_schedule_instructor_id_fkey(full_name)")
        .gte("scheduled_date", `${year}-${String(month + 1).padStart(2, "0")}-01`)
        .lte("scheduled_date", `${year}-${String(month + 1).padStart(2, "0")}-${new Date(year, month + 1, 0).getDate()}`)
        .order("scheduled_date").order("start_time"),
    ]);
    if (h.error || s.error) setErrorMessage([h.error?.message, s.error?.message].filter(Boolean).join(" | "));
    else setErrorMessage("");
    setHolidays(h.data || []);
    setActivities(s.data || []);
    setLoading(false);
  }

  return (
    <section className="holiday-page">
      <div className="section-head">
        <div>
          <h2><CalendarDays size={21} /> Calendário integrado</h2>
          <p>Visualize feriados e atividades programadas do PROERD em um único calendário.</p>
        </div>
        <div className="holiday-calendar-actions">
          {isAdmin && <label className="holiday-state-picker">Estado de referência
            <select value={state} onChange={event => chooseState(event.target.value)}>
              {STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </label>}
          <button type="button" className="small-secondary" onClick={refreshCalendar} disabled={loading || busy}>
            <RefreshCw size={13} /> Atualizar
          </button>
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
              const dayActivities = monthActivities.filter(item => item.scheduled_date === iso);
              const dayHolidays = allHolidays.filter(item => item.holiday_date === iso);
              const selected = selectedDate === iso;
              return (
                <button type="button" key={iso}
                  className={`calendar-day calendar-day-button ${dayHolidays.length ? "has-holiday" : ""} ${dayActivities.length ? "has-activity" : ""} ${today === iso ? "today" : ""} ${selected ? "selected-day" : ""}`}
                  onClick={() => setSelectedDate(iso)} aria-pressed={selected}>
                  <span>{day}</span>
                  {dayHolidays.slice(0, 1).map((item, i) => <small className="calendar-holiday-label" key={`h-${i}`} title={item.name}>{item.name}</small>)}
                  {dayActivities.slice(0, 2).map((item, i) => <small className="calendar-activity-label" key={`a-${i}`} title={`${timeLabel(item.start_time)} ${item.schools?.name || "Escola"}`}>{timeLabel(item.start_time)} · {item.schools?.name || "Atividade"}</small>)}
                  {(dayActivities.length + dayHolidays.length > 3) && <small>+ mais eventos</small>}
                </button>
              );
            })}
          </div>
          <div className="holiday-legend">
            <span><i className="national-dot" /> Feriado nacional</span>
            <span><i className="local-dot" /> Feriado estadual/local</span>
            <span><i className="activity-dot" /> Atividade agendada</span>
          </div>
          {loading && <p className="muted">Atualizando calendário...</p>}
        </div>

        <aside className="panel holiday-list">
          <div className="holiday-list-heading">
            <h3><CalendarCheck size={17} /> {dateLabel(selectedDate)}</h3>
            <span className="count">{selectedActivities.length + selectedHolidays.length} eventos</span>
          </div>
          {selectedHolidays.map((item, index) => (
            <div className="holiday-row" key={`holiday-${index}`}>
              <div><b>{item.name}</b><small>{item.kind === "national" ? "Feriado nacional" : item.kind === "state" ? `Estadual · ${state}` : `Local · ${state}`}</small></div>
              {item.kind !== "national" && isAdmin && <button type="button" className="small-danger" onClick={() => removeHoliday(item.id)} disabled={busy} title="Excluir feriado"><Trash2 size={14} /></button>}
            </div>
          ))}
          {selectedActivities.map(item => (
            <div className="calendar-event-row" key={item.id}>
              <div className="calendar-event-time"><Clock size={14} /><b>{timeLabel(item.start_time)} às {timeLabel(item.end_time)}</b></div>
              <b>{item.schools?.name || "Escola não informada"}</b>
              <small>{item.demands?.class_name || "Turma não informada"} · {item.demands?.activity_type || "Atividade PROERD"}</small>
              <small className="calendar-event-instructor"><UserRound size={12} /> {item.instructor?.full_name || "Instrutor não informado"}</small>
              <span className={`status ${item.status === "Realizada" ? "green" : item.status === "Cancelada" ? "red" : item.status === "Agendada" ? "amber" : "blue"}`}>{item.status}</span>
              {item.demands?.protocol && <small>Protocolo: {item.demands.protocol}</small>}
              {item.notes && <small>{item.notes}</small>}
            </div>
          ))}
          {selectedActivities.length === 0 && selectedHolidays.length === 0 && <p className="muted">Não há feriados ou atividades registrados nesta data.</p>}
        </aside>
      </div>

      {isAdmin && (
        <form className="panel holiday-form" onSubmit={addHoliday}>
          <h3><Plus size={18} /> Cadastrar feriado estadual ou local</h3>
          <p className="muted">Os feriados nacionais fixos são exibidos automaticamente. Cadastre datas estaduais ou municipais após conferir o calendário oficial aplicável.</p>
          <div className="form-row">
            <label className="field"><span>Nome do feriado</span><input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Data Magna do Estado" /></label>
            <label className="field"><span>Data</span><input required type="date" value={holidayDate} onChange={event => setHolidayDate(event.target.value)} /></label>
            <label className="field"><span>Abrangência</span><select value={kind} onChange={event => setKind(event.target.value as "state" | "local")}><option value="state">Estadual</option><option value="local">Local / municipal</option></select></label>
            <button className="primary" disabled={busy}><Plus size={15} /> {busy ? "Salvando..." : "Cadastrar"}</button>
          </div>
        </form>
      )}

      {errorMessage && <p className="notice holiday-error"><AlertCircle size={15} /> {errorMessage}</p>}
      {message && <p className="notice">{message}</p>}
      <p className="muted holiday-disclaimer">A lista nacional desta versão contempla feriados nacionais fixos. Pontos facultativos, feriados estaduais e municipais devem ser conferidos com o calendário oficial vigente antes do cadastro.</p>
    </section>
  );
}
