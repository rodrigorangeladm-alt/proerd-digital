import { useState } from "react";
import type { FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type School = { id: string; name: string };
type Demand = {
  id: string; protocol: string; class_name: string; activity_type: string;
  preferred_date: string | null; preferred_time?: string | null; status: string;
  created_by: string; requested_by_name?: string | null; school_contact?: string | null;
  estimated_students?: number | null; administrative_note?: string | null;
  schools?: { name: string } | null;
};
type Profile = { id: string; role: "admin" | "instructor" | "school"; full_name: string };
type Props = {
  supabase: SupabaseClient; profile: Profile; schools: School[];
  demands: Demand[]; onRefresh: () => Promise<void> | void;
};

const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,10);
};

export default function ServiceDemandWorkflow({supabase,profile,schools,demands,onRefresh}:Props) {
  const [schoolId,setSchoolId] = useState("");
  const [className,setClassName] = useState("");
  const [activityType,setActivityType] = useState("PROERD 5º ano");
  const [preferredDate,setPreferredDate] = useState(today());
  const [preferredTime,setPreferredTime] = useState("");
  const [estimatedStudents,setEstimatedStudents] = useState("25");
  const [requestedByName,setRequestedByName] = useState("");
  const [schoolContact,setSchoolContact] = useState("");
  const [requestNotes,setRequestNotes] = useState("");
  const [decisionNotes,setDecisionNotes] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const isAdmin = profile.role === "admin";
  const visible = isAdmin
    ? demands.filter(d => ["Aguardando autorização","Autorizada","Indeferida","Devolvida para correção"].includes(d.status))
    : demands.filter(d => d.created_by === profile.id);

  async function submit(e:FormEvent) {
    e.preventDefault();
    if (!schoolId) { setMessage("Selecione a escola."); return; }
    if (preferredDate < today()) { setMessage("A data não pode ser anterior a hoje."); return; }
    setBusy(true); setMessage("");
    const {error} = await supabase.rpc("request_service_demand",{
      p_school_id:schoolId,p_class_name:className.trim(),p_activity_type:activityType,
      p_preferred_date:preferredDate,p_preferred_time:preferredTime || null,
      p_estimated_students:estimatedStudents ? Number(estimatedStudents) : null,
      p_requested_by_name:requestedByName.trim() || null,
      p_school_contact:schoolContact.trim() || null,p_request_notes:requestNotes.trim() || null
    });
    setBusy(false);
    setMessage(error ? error.message : "Solicitação enviada para autorização da administração.");
    if (!error) {
      setSchoolId("");setClassName("");setPreferredDate(today());setPreferredTime("");
      setEstimatedStudents("25");setRequestedByName("");setSchoolContact("");setRequestNotes("");
      await onRefresh();
    }
  }

  async function review(id:string,decision:"Autorizada"|"Indeferida"|"Devolvida para correção") {
    const note=(decisionNotes[id] || "").trim();
    if (decision !== "Autorizada" && !note) {setMessage("Informe a justificativa.");return;}
    setBusy(true);setMessage("");
    const {error}=await supabase.rpc("review_service_demand",{
      p_demand_id:id,p_decision:decision,p_administrative_note:note || null
    });
    setBusy(false);
    setMessage(error ? error.message : `Solicitação ${decision.toLowerCase()}.`);
    if (!error) await onRefresh();
  }

  return <section className="service-demand-workflow">
    {profile.role === "instructor" && <div className="panel form demand-form">
      <h3>Solicitar serviço à administração</h3>
      <p className="muted">Registre a solicitação recebida diretamente da escola. A atividade só poderá ser executada após autorização.</p>
      <form onSubmit={submit}>
        <div className="form-row">
          <label className="field"><span>Escola</span><select required value={schoolId} onChange={e=>setSchoolId(e.target.value)}>
            <option value="">Selecione</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          <label className="field"><span>Turma</span><input required value={className} onChange={e=>setClassName(e.target.value)} placeholder="Ex.: 5º ano A"/></label>
        </div>
        <div className="form-row">
          <label className="field"><span>Tipo de atividade</span><select value={activityType} onChange={e=>setActivityType(e.target.value)}>
            <option>PROERD 5º ano</option><option>PROERD 7º ano</option><option>PROERD Kids</option>
            <option>Palestra</option><option>Reunião</option><option>Evento escolar</option><option>Outro</option>
          </select></label>
          <label className="field"><span>Data pretendida</span><input required type="date" min={today()} value={preferredDate} onChange={e=>setPreferredDate(e.target.value)}/></label>
          <label className="field"><span>Horário</span><input type="time" value={preferredTime} onChange={e=>setPreferredTime(e.target.value)}/></label>
        </div>
        <div className="form-row">
          <label className="field"><span>Alunos estimados</span><input type="number" min="0" value={estimatedStudents} onChange={e=>setEstimatedStudents(e.target.value)}/></label>
          <label className="field"><span>Solicitante na escola</span><input value={requestedByName} onChange={e=>setRequestedByName(e.target.value)}/></label>
          <label className="field"><span>Contato da escola</span><input value={schoolContact} onChange={e=>setSchoolContact(e.target.value)}/></label>
        </div>
        <label className="field"><span>Justificativa e informações adicionais</span><textarea rows={3} value={requestNotes} onChange={e=>setRequestNotes(e.target.value)} /></label>
        <button className="primary" disabled={busy || !schools.length}>{busy ? "Enviando..." : "Enviar para autorização"}</button>
      </form>
    </div>}

    <div className="section-head"><div>
      <h2>{isAdmin ? "Solicitações de serviço" : "Minhas solicitações de serviço"}</h2>
      <p>{isAdmin ? "Analise, autorize, indefira ou devolva as solicitações." : "Acompanhe a análise administrativa."}</p>
    </div><span className="count">{visible.length} registros</span></div>

    <div className="panel table-panel">
      {!visible.length ? <div className="empty">Nenhuma solicitação disponível.</div> : <div className="table-wrap">
        <table><thead><tr><th>Protocolo</th><th>Escola / turma</th><th>Atividade</th><th>Data / horário</th><th>Solicitante</th><th>Status / ação</th></tr></thead>
        <tbody>{visible.map(d=><tr key={d.id}>
          <td><b>{d.protocol}</b></td><td>{d.schools?.name || "Escola"}<small>{d.class_name}</small></td>
          <td>{d.activity_type}<small>{d.estimated_students ?? "—"} alunos estimados</small></td>
          <td>{d.preferred_date || "A definir"}<small>{d.preferred_time || "Horário não informado"}</small></td>
          <td>{d.requested_by_name || "Não informado"}<small>{d.school_contact || ""}</small></td>
          <td><span className={`status ${d.status==="Autorizada"?"green":d.status==="Indeferida"?"red":"amber"}`}>{d.status}</span>
            {isAdmin && d.status==="Aguardando autorização" && <div className="review" style={{minWidth:220,marginTop:8}}>
              <textarea rows={2} placeholder="Justificativa se indeferir/devolver" value={decisionNotes[d.id] || ""} onChange={e=>setDecisionNotes(v=>({...v,[d.id]:e.target.value}))}/>
              <div className="actions">
                <button type="button" className="small-primary" disabled={busy} onClick={()=>review(d.id,"Autorizada")}>Autorizar</button>
                <button type="button" className="small-danger" disabled={busy} onClick={()=>review(d.id,"Indeferida")}>Indeferir</button>
                <button type="button" className="small-secondary" disabled={busy} onClick={()=>review(d.id,"Devolvida para correção")}>Devolver</button>
              </div>
            </div>}
            {d.administrative_note && <small>{d.administrative_note}</small>}
          </td>
        </tr>)}</tbody></table>
      </div>}
    </div>
    {message && <p className="notice">{message}</p>}
  </section>;
}
