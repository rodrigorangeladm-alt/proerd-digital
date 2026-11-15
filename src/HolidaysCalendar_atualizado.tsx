import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2,
  MapPin, CalendarCheck, AlertCircle
} from "lucide-react";

const STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEKDAYS = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];

type HolidayKind = "state" | "local" | "national";
type Holiday = {
  id?: string;
  holiday_date: string;
  name: string;
  state_code?: string;
  kind: HolidayKind;
};

function localIsoDate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
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
  ].map(([md, name]) => ({
    holiday_date: `${year}-${md}`,
    name,
    kind: "national" as const,
  }));
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

export default function HolidaysCalendar({ supabase, profile }: { supabase: any; profile: any }) {
  const today = localIsoDate();
  const [state, setState] = useState("DF");
  const [month, setMonth] = useState(Number(today.slice(5, 7)) - 1);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [name, setName] = useState("");
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<"state" | "local">("state");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isAdmin = profile?.role === "admin";

  async function loadCalendar() {
    if (!supabase) {
      setErrorMessage("Banco de dados não configurado.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage("");
    const [preferenceResult, holidayResult] = await Promise.all([
      supabase.from("calendar_preferences").select("state_code").eq("id", 1).maybeSingle(),
      supabase.from("calendar_holidays")
        .select("id,holiday_date,name,state_code,kind")
        .eq("state_code", state)
        .gte("holiday_date", `${year}-01-01`)
        .lte("holiday_date", `${year}-12-31`)
        .order("holiday_date"),
    ]);

    if (preferenceResult.error && preferenceResult.error.code !== "PGRST116") {
      setErrorMessage(`Não foi possível carregar a preferência regional: ${preferenceResult.error.message}`);
    } else if (preferenceResult.data?.state_code && preferenceResult.data.state_code !== state) {
      setState(preferenceResult.data.state_code);
    }

    if (holidayResult.error) {
      setErrorMessage(`Não foi possível carregar os feriados cadastrados: ${holidayResult.error.message}`);
      setHolidays([]);
    } else {
      setHolidays(holidayResult.data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase) {
        if (active) {
          setErrorMessage("Banco de dados não configurado.");
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      const [pref, rows] = await Promise.all([
        supabase.from("calendar_preferences").select("state_code").eq("id", 1).maybeSingle(),
        supabase.from("calendar_holidays").select("id,holiday_date,name,state_code,kind")
          .eq("state_code", state).gte("holiday_date", `${year}-01-01`)
          .lte("holiday_date", `${year}-12-31`).order("holiday_date"),
      ]);
      if (!active) return;
      if (pref.data?.state_code && pref.data.state_code !== state) setState(pref.data.state_code);
      if (rows.error) {
        setErrorMessage(`Não foi possível carregar os feriados cadastrados: ${rows.error.message}`);
        setHolidays([]);
      } else {
        setHolidays(rows.data || []);
        setErrorMessage("");
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [supabase, state, year]);

  const allHolidays = useMemo(
    () => [...nationalHolidays(year), ...holidays].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)),
    [year, holidays]
  );

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  const monthHolidays = allHolidays.filter(h => Number(h.holiday_date.slice(5, 7)) === month + 1);
  const selectedMonthLabel = `${MONTHS[month]} de ${year}`;

  function moveMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  async function chooseState(next: string) {
    setState(next);
    setMessage("");
    const { error } = await supabase.from("calendar_preferences").upsert({
      id: 1,
      state_code: next,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) setErrorMessage(`Não foi possível salvar a UF de referência: ${error.message}`);
    else setMessage(`Estado de referência atualizado para ${next}.`);
  }

  async function addHoliday(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !name.trim() || !date) return;
    setBusy(true);
    setMessage("");
    setErrorMessage("");
    const { error } = await supabase.from("calendar_holidays").insert({
      holiday_date: date,
      name: name.trim(),
      state_code: state,
      kind,
      created_by: profile.id,
    });
    setBusy(false);
    if (error) {
      setErrorMessage(`Não foi possível cadastrar o feriado: ${error.message}`);
      return;
    }
    setName("");
    setDate(today);
    setMessage("Feriado cadastrado com sucesso.");
    await loadCalendar();
  }

  async function removeHoliday(id?: string) {
    if (!isAdmin || !id) return;
    if (!window.confirm("Deseja excluir este feriado cadastrado?")) return;
    setBusy(true);
    const { error } = await supabase.from("calendar_holidays").delete().eq("id", id);
    setBusy(false);
    if (error) {
      setErrorMessage(`Não foi possível excluir o feriado: ${error.message}`);
      return;
    }
    setMessage("Feriado removido.");
    await loadCalendar();
  }

  return (
    <section className="holiday-page">
      <div className="section-head">
        <div>
          <h2><CalendarDays size={21} /> Calendário e feriados</h2>
          <p>Consulte os feriados nacionais e as datas estaduais ou locais cadastradas para a unidade de referência.</p>
        </div>
        {isAdmin && (
          <label className="holiday-state-picker">
            Estado de referência
            <select value={state} onChange={e => chooseState(e.target.value)}>
              {STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="holiday-layout">
        <div className="panel holiday-calendar">
          <div className="calendar-toolbar">
            <button type="button" className="small-secondary" onClick={() => moveMonth(-1)} aria-label="Mês anterior">
              <ChevronLeft size={17} />
            </button>
            <h3>{selectedMonthLabel}</h3>
            <button type="button" className="small-secondary" onClick={() => moveMonth(1)} aria-label="Próximo mês">
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="calendar-grid">
            {WEEKDAYS.map(day => <b className="calendar-weekday" key={day}>{day.slice(0, 3)}</b>)}
            {Array.from({ length: offset }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const matches = allHolidays.filter(h => h.holiday_date === iso);
              return (
                <div key={iso} className={`calendar-day ${matches.length ? "has-holiday" : ""} ${today === iso ? "today" : ""}`}>
                  <span>{day}</span>
                  {matches.slice(0, 2).map((holiday, holidayIndex) => (
                    <small key={`${holiday.name}-${holidayIndex}`} title={holiday.name}>{holiday.name}</small>
                  ))}
                  {matches.length > 2 && <small>+{matches.length - 2} datas</small>}
                </div>
              );
            })}
          </div>
          <div className="holiday-legend">
            <span><i className="national-dot" /> Nacional</span>
            <span><i className="local-dot" /> Estadual/local</span>
          </div>
          {loading && <p className="muted">Atualizando calendário...</p>}
        </div>

        <aside className="panel holiday-list">
          <div className="holiday-list-heading">
            <h3><CalendarCheck size={17} /> Datas de {MONTHS[month]}</h3>
            <span className="count">{monthHolidays.length} registros</span>
          </div>
          {monthHolidays.length === 0 ? (
            <p className="muted">Nenhum feriado cadastrado ou fixo neste mês para {state}.</p>
          ) : monthHolidays.map((holiday, index) => (
            <div className="holiday-row" key={`${holiday.holiday_date}-${holiday.name}-${index}`}>
              <div>
                <b>{dateLabel(holiday.holiday_date).slice(0, 5)} · {holiday.name}</b>
                <small>{holiday.kind === "national" ? "Nacional" : holiday.kind === "state" ? `Estadual · ${state}` : `Local · ${state}`}</small>
              </div>
              {holiday.kind !== "national" && isAdmin && (
                <button type="button" className="small-danger" onClick={() => removeHoliday(holiday.id)} disabled={busy} title="Excluir feriado">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="small-secondary holiday-refresh" onClick={loadCalendar} disabled={loading || busy}>
            <RefreshCw size={13} /> Atualizar calendário
          </button>
        </aside>
      </div>

      {isAdmin && (
        <form className="panel holiday-form" onSubmit={addHoliday}>
          <h3><Plus size={18} /> Cadastrar feriado estadual ou local</h3>
          <p className="muted">Os feriados nacionais fixos são exibidos automaticamente. Cadastre aqui datas estaduais ou locais após conferir o calendário oficial aplicável.</p>
          <div className="form-row">
            <label className="field">
              <span>Nome do feriado</span>
              <input required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Data Magna do Estado" />
            </label>
            <label className="field">
              <span>Data</span>
              <input required type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Abrangência</span>
              <select value={kind} onChange={e => setKind(e.target.value as "state" | "local")}>
                <option value="state">Estadual</option>
                <option value="local">Local / municipal</option>
              </select>
            </label>
            <button className="primary" disabled={busy}><Plus size={15} /> {busy ? "Salvando..." : "Cadastrar"}</button>
          </div>
        </form>
      )}

      {errorMessage && <p className="notice holiday-error"><AlertCircle size={15} /> {errorMessage}</p>}
      {message && <p className="notice">{message}</p>}
      <p className="muted holiday-disclaimer">
        A lista nacional desta versão contempla feriados nacionais fixos. Pontos facultativos, feriados estaduais e municipais devem ser conferidos com o calendário oficial vigente antes do cadastro.
      </p>
    </section>
  );
}
