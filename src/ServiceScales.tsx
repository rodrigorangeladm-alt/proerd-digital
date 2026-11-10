import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, Plus, RefreshCw, AlertTriangle, Clock3, Users } from "lucide-react";

type Person = {
  id: string;
  full_name: string;
  war_name: string | null;
  service_number: string | null;
  rank: string;
  status: string;
};

type ScaleRow = {
  id: string;
  personnel_id: string;
  duty_type: "Administrativo" | "Instrutor";
  shift_start: string;
  shift_end: string;
  circumstance: "Ordinária" | "Extraordinária";
  notes: string | null;
  personnel?: Person;
};

type Props = {
  supabase: any;
  personnel: Person[];
  profile: any;
};

const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const shifts = [
  { label: "07:07 às 13:07", start: "07:07", end: "13:07" },
  { label: "13:07 às 19:07", start: "13:07", end: "19:07" },
  { label: "17:07 às 23:07", start: "17:07", end: "23:07" },
  { label: "14:07 às 20:07", start: "14:07", end: "20:07" },
];
const weekStart = (value: string) => {
  const d = new Date(`${value}T12:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
};
const dateBR = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "";

export default function ServiceScales({ supabase, personnel, profile }: Props) {
  const [date, setDate] = useState(todayLocal());
  const [rows, setRows] = useState<ScaleRow[]>([]);
  const [weekRows, setWeekRows] = useState<ScaleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedPerson, setSelectedPerson] = useState("");
  const [dutyType, setDutyType] = useState<"Administrativo" | "Instrutor">("Instrutor");
  const [shiftIndex, setShiftIndex] = useState("0");
  const [circumstance, setCircumstance] = useState<"Ordinária" | "Extraordinária">("Ordinária");
  const [notes, setNotes] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const activePersonnel = useMemo(() => personnel.filter(p => p.status === "Ativo").sort((a,b) => a.full_name.localeCompare(b.full_name, "pt-BR")), [personnel]);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const start = weekStart(date);
    const endDate = new Date(`${start}T12:00:00`);
    endDate.setDate(endDate.getDate() + 6);
    const end = endDate.toISOString().slice(0,10);
    const [daily, weekly] = await Promise.all([
      supabase.from("service_scale_entries").select("*, personnel(id,full_name,war_name,service_number,rank,status)").eq("service_date", date).order("shift_start"),
      supabase.from("service_scale_entries").select("*, personnel(id,full_name,war_name,service_number,rank,status)").gte("service_date", start).lte("service_date", end)
    ]);
    if (daily.error || weekly.error) setMessage(`Não foi possível carregar as escalas: ${(daily.error || weekly.error).message}`);
    else {
      setRows((daily.data || []) as ScaleRow[]);
      setWeekRows((weekly.data || []) as ScaleRow[]);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [date]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPerson || !supabase) return;
    setSaving(true);
    setMessage("");
    const shift = shifts[Number(shiftIndex)];
    const result = await supabase.from("service_scale_entries").insert({
      service_date: date,
      personnel_id: selectedPerson,
      duty_type: dutyType,
      shift_start: shift.start,
      shift_end: shift.end,
      circumstance,
      notes: notes.trim() || null,
      created_by: profile?.id || null
    });
    if (result.error) setMessage(`Não foi possível incluir na escala: ${result.error.message}`);
    else {
      setMessage("Policial incluído na escala diária.");
      setSelectedPerson("");
      setNotes("");
      await load();
    }
    setSaving(false);
  }

  async function removeEntry(id: string) {
    if (!window.confirm("Deseja retirar este policial da escala?")) return;
    const { error } = await supabase.from("service_scale_entries").delete().eq("id", id);
    setMessage(error ? `Não foi possível retirar: ${error.message}` : "Registro retirado da escala.");
    if (!error) await load();
  }

  function downloadPdf() {
    const printWindow = window.open("", "_blank", "width=1100,height=850");
    if (!printWindow) {
      setMessage("O navegador bloqueou a janela do PDF. Permita pop-ups para este site.");
      return;
    }
    const esc = (v: any) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]!));
    const blocks = shifts.map(shift => {
      const group = rows.filter(r => String(r.shift_start || "").slice(0, 5) === shift.start);
      return group.length ? `
      <section class="block">
        <table>
          <thead><tr><th colspan="5">ESCALA DE SERVIÇO · ${esc(shift.label)}</th></tr>
          <tr><th>MATRÍCULA</th><th>POLICIAL</th><th>TIPO</th><th>CIRCUNSTÂNCIA</th><th>FUNÇÃO</th></tr></thead>
          <tbody>${group.map(r => `<tr><td>${esc(r.personnel?.service_number || "Não informada")}</td><td>${esc(r.personnel?.rank)} ${esc(r.personnel?.war_name || r.personnel?.full_name)}</td><td>${esc(r.duty_type)}</td><td>${esc(r.circumstance)}</td><td>${esc(r.duty_type === "Instrutor" ? "INSTRUTOR" : "ADMINISTRATIVO")}</td></tr>`).join("")}</tbody>
        </table>
        ${group.some(r=>r.notes) ? `<p class="notes"><b>OBSERVAÇÕES</b><br>${group.filter(r=>r.notes).map(r=>esc(r.notes)).join("<br>")}</p>` : ""}
      </section>` : "";
    }).join("");
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Escala de Serviço ${dateBR(date)}</title>
      <style>
      @page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#111}
      header{display:grid;grid-template-columns:100px 1fr 90px;align-items:center;border-bottom:3px solid #111;padding-bottom:10px;margin-bottom:10px}
      header img{max-width:80px;max-height:70px}header .center{text-align:center;font-weight:bold;font-size:13px;line-height:1.5}
      .title{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding:8px 0;font-weight:bold;font-size:13px}
      .block{border:1px solid #111;margin:12px 0;break-inside:avoid}table{width:100%;border-collapse:collapse}
      th{background:#ddd;text-align:left;padding:5px;border:1px solid #aaa;font-size:10px}td{padding:5px;border:1px solid #bbb;font-size:10px}
      .notes{padding:6px;margin:0;border-top:1px solid #aaa;line-height:1.5}.foot{margin-top:12px;font-size:9px;color:#555}
      </style></head><body>
      <header><div></div><div class="center">GOVERNO DO DISTRITO FEDERAL<br>POLÍCIA MILITAR DO DISTRITO FEDERAL<br>PROERD</div><div></div></header>
      <div class="title"><span>ESCALA DE SERVIÇO</span><span>${dateBR(date)}</span></div>
      ${blocks || "<p>Não há policiais incluídos nesta escala.</p>"}
      <p class="foot">Documento gerado pelo PROERD DIGITAL. Conferir e validar antes da publicação.</p>
      <script>window.onload=()=>window.print();</script></body></html>`);
    printWindow.document.close();
  }

  const weekHours = new Map<string, number>();
  weekRows.forEach(r => weekHours.set(r.personnel_id, (weekHours.get(r.personnel_id) || 0) + 6));
  const assignedToday = new Set(rows.map(r => r.personnel_id));
  const weekAlerts = activePersonnel.map(p => ({ person:p, hours:weekHours.get(p.id) || 0 })).filter(x => x.hours !== 30);

  return <section>
    <div className="section-head"><div><h2>Escalas de serviço</h2><p>Geração diária de escala e acompanhamento da jornada semanal de 30 horas.</p></div><span className="count">{activePersonnel.length} policiais ativos</span></div>
    <div className="panel">
      <h3><CalendarDays size={18}/> Gerar escala diária</h3>
      <form className="form" onSubmit={addEntry}>
        <div className="form-row">
          <label className="field"><span>Data da escala</span><input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>
          <label className="field"><span>Policial</span><select required value={selectedPerson} onChange={e=>setSelectedPerson(e.target.value)}><option value="">Selecione um policial</option>{activePersonnel.map(p=><option key={p.id} value={p.id}>{p.rank} {p.war_name || p.full_name} · {p.service_number || "Sem matrícula"}</option>)}</select></label>
        </div>
        <div className="form-row">
          <label className="field"><span>Classificação funcional</span><select value={dutyType} onChange={e=>setDutyType(e.target.value as any)}><option>Administrativo</option><option>Instrutor</option></select></label>
          <label className="field"><span>Horário</span><select value={shiftIndex} onChange={e=>setShiftIndex(e.target.value)}>{shifts.map((s,i)=><option key={s.start} value={i}>{s.label}</option>)}</select></label>
        </div>
        <div className="form-row">
          <label className="field"><span>Circunstância</span><select value={circumstance} onChange={e=>setCircumstance(e.target.value as any)}><option>Ordinária</option><option>Extraordinária</option></select></label>
          <label className="field"><span>Observação desta designação</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: expediente administrativo, instrução em escola..."/></label>
        </div>
        <button className="primary" disabled={saving}><Plus size={15}/> {saving ? "Salvando..." : "Adicionar policial à escala"}</button>
      </form>
    </div>
    <div className="panel">
      <div className="section-head"><div><h2>Escala de {dateBR(date)}</h2><p>Policiais distribuídos nos quatro horários disponíveis.</p></div><div style={{display:"flex",gap:8}}><button className="small-secondary" onClick={load}><RefreshCw size={14}/> Atualizar</button><button className="small-primary" onClick={downloadPdf}><Download size={14}/> Baixar PDF</button></div></div>
      {shifts.map(shift => <div key={shift.start} style={{marginBottom:18}}>
        <h3 style={{marginBottom:8}}>{shift.label}</h3>
        <div className="table-wrap"><table><thead><tr><th>Policial</th><th>Matrícula</th><th>Classificação</th><th>Circunstância</th><th>Observações</th><th></th></tr></thead><tbody>
          {rows.filter(r=>String(r.shift_start || "").slice(0, 5)===shift.start).map(r=><tr key={r.id}><td>{r.personnel?.rank} {r.personnel?.war_name || r.personnel?.full_name}</td><td>{r.personnel?.service_number || "—"}</td><td>{r.duty_type}</td><td>{r.circumstance}</td><td>{r.notes || "—"}</td><td><button className="small-danger" onClick={()=>removeEntry(r.id)}>Retirar</button></td></tr>)}
          {!rows.some(r=>String(r.shift_start || "").slice(0, 5)===shift.start) && <tr><td colSpan={6}>Nenhum policial neste horário.</td></tr>}
        </tbody></table></div>
      </div>)}
    </div>
    <div className="panel">
      <h3><Clock3 size={18}/> Jornada semanal e banco de horas</h3>
      <p className="muted">Meta: 30 horas por semana, considerando cinco jornadas de seis horas. O cálculo abaixo soma as escalas diárias registradas de segunda a domingo da semana selecionada.</p>
      <div className="table-wrap"><table><thead><tr><th>Policial</th><th>Horas programadas</th><th>Saldo frente à meta</th><th>Sinalização</th></tr></thead><tbody>
        {activePersonnel.map(p=>{const h=weekHours.get(p.id)||0;const diff=h-30;return <tr key={p.id}><td>{p.rank} {p.war_name||p.full_name}</td><td>{h}h</td><td>{diff>0?`+${diff}h`:diff<0?`${diff}h`:"0h"}</td><td><span className={`status ${diff===0?"green":diff>0?"blue":"amber"}`}>{diff===0?"Meta atingida":diff>0?"Crédito previsto":"Débito previsto"}</span></td></tr>})}
      </tbody></table></div>
      {weekAlerts.length>0 && <p className="notice"><AlertTriangle size={15}/> Há {weekAlerts.length} policiais com jornada semanal diferente de 30 horas na programação registrada.</p>}
    </div>
  </section>;
}
