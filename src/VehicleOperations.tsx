import { useEffect, useMemo, useState } from "react";
import { Fuel, Wrench, RefreshCw, Plus } from "lucide-react";
import { supabase, type Profile } from "./lib";

type Vehicle = { id:string; fleet_number:string|null; model:string; plate:string|null; status:string; current_odometer:number };
type Person = { id:string; full_name:string; rank:string; linked_profile_id:string|null; status:string };
type Usage = { id:string; vehicle_id:string; personnel_id:string; destination:string; departure_at:string; return_at:string|null; odometer_out:number; odometer_in:number|null; status:string; vehicle?:{fleet_number:string|null;model:string}|null; personnel?:{full_name:string;rank:string}|null };

type Props = {
  profile: Profile;
  vehicles: Vehicle[];
  vehicleUsages: Usage[];
  personnel: Person[];
  onRefresh: () => Promise<void>;
  onNotice: (message:string) => void;
};

const today = () => new Date().toISOString().slice(0,10);
const money = (n:number) => n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

export default function VehicleOperations({profile,vehicles,vehicleUsages,personnel,onRefresh,onNotice}:Props) {
  const admin = profile.role === "admin";
  const [section,setSection] = useState<"fuel"|"maintenance">("fuel");
  const [fuelings,setFuelings] = useState<any[]>([]);
  const [maintenances,setMaintenances] = useState<any[]>([]);
  const [busy,setBusy] = useState(false);
  const [fuel,setFuel] = useState({vehicle_id:"",vehicle_usage_id:"",personnel_id:"",fueled_at:today(),odometer:"",fuel_type:"Gasolina",liters:"",unit_price:"",station_name:"",full_tank:false,notes:""});
  const [maintenance,setMaintenance] = useState({vehicle_id:"",maintenance_type:"Preventiva",description:"",workshop_name:"",status:"Agendada",scheduled_start:today(),expected_end_date:"",odometer:"",labor_cost:"0",parts_cost:"0",notes:""});

  async function loadRecords() {
    if (!supabase) return;
    setBusy(true);
    const [f,m] = await Promise.all([
      supabase.from("vehicle_fuelings").select("*, vehicle:vehicles(fleet_number,model,plate), personnel(full_name,rank)").order("fueled_at",{ascending:false}),
      admin ? supabase.from("vehicle_maintenance").select("*, vehicle:vehicles(fleet_number,model,plate)").order("created_at",{ascending:false}) : Promise.resolve({data:[],error:null} as any)
    ]);
    if (f.error) onNotice("Não foi possível carregar abastecimentos: "+f.error.message);
    if (m.error) onNotice("Não foi possível carregar manutenções: "+m.error.message);
    setFuelings(f.data||[]);
    setMaintenances(m.data||[]);
    setBusy(false);
  }

  useEffect(()=>{ loadRecords(); },[profile.id]);

  const ownPerson = personnel.find(p=>p.linked_profile_id===profile.id && p.status==="Ativo");
  const eligibleUsages = useMemo(()=>vehicleUsages.filter(u=>
    u.status!=="Cancelada" && (admin || (ownPerson && u.personnel_id===ownPerson.id))
  ),[vehicleUsages,admin,ownPerson?.id]);
  const fuelTotal = (Number(fuel.liters)||0)*(Number(fuel.unit_price)||0);

  async function saveFuel(e:React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (!admin && !ownPerson) { onNotice("Sua conta precisa estar vinculada a um cadastro funcional ativo."); return; }
    const usage = eligibleUsages.find(u=>u.id===fuel.vehicle_usage_id);
    const personId = admin ? (fuel.personnel_id || usage?.personnel_id) : ownPerson?.id;
    if (!usage || !personId || usage.vehicle_id!==fuel.vehicle_id || usage.personnel_id!==personId) {
      onNotice("Selecione uma utilização válida, vinculada à viatura e ao policial responsável."); return;
    }
    const odometer=Number(fuel.odometer), liters=Number(fuel.liters), unitPrice=Number(fuel.unit_price);
    if (!Number.isFinite(odometer)||odometer<0||!Number.isFinite(liters)||liters<=0||!Number.isFinite(unitPrice)||unitPrice<0) {
      onNotice("Confira a quilometragem, os litros e o preço por litro."); return;
    }
    const payload={
      vehicle_id:fuel.vehicle_id,vehicle_usage_id:fuel.vehicle_usage_id,personnel_id:personId,
      fueled_at:new Date(fuel.fueled_at+"T12:00:00").toISOString(),odometer,fuel_type:fuel.fuel_type,
      liters,unit_price:unitPrice,station_name:fuel.station_name.trim()||null,full_tank:fuel.full_tank,
      notes:fuel.notes.trim()||null,created_by:profile.id
    };
    const {error}=await supabase.from("vehicle_fuelings").insert(payload);
    if(error){onNotice("Não foi possível registrar o abastecimento: "+error.message);return;}
    onNotice("Abastecimento registrado.");
    setFuel({vehicle_id:"",vehicle_usage_id:"",personnel_id:"",fueled_at:today(),odometer:"",fuel_type:"Gasolina",liters:"",unit_price:"",station_name:"",full_tank:false,notes:""});
    await Promise.all([loadRecords(),onRefresh()]);
  }

  async function saveMaintenance(e:React.FormEvent) {
    e.preventDefault();
    if (!supabase||!admin) return;
    const vehicle=vehicles.find(v=>v.id===maintenance.vehicle_id);
    if (!vehicle) { onNotice("Selecione uma viatura."); return; }
    const odometer=maintenance.odometer?Number(maintenance.odometer):null;
    const labor=Number(maintenance.labor_cost),parts=Number(maintenance.parts_cost);
    if (!maintenance.description.trim()||!Number.isFinite(labor)||!Number.isFinite(parts)||labor<0||parts<0||(odometer!==null&&(!Number.isFinite(odometer)||odometer<0))) {
      onNotice("Confira a descrição, quilometragem e custos."); return;
    }
    const payload={
      vehicle_id:maintenance.vehicle_id,maintenance_type:maintenance.maintenance_type,
      description:maintenance.description.trim(),workshop_name:maintenance.workshop_name.trim()||null,
      status:maintenance.status,scheduled_start:maintenance.scheduled_start||null,
      expected_end_date:maintenance.expected_end_date||null,odometer,labor_cost:labor,parts_cost:parts,
      notes:maintenance.notes.trim()||null,created_by:profile.id,
      completed_at:maintenance.status==="Concluida"?new Date().toISOString():null
    };
    const {error}=await supabase.from("vehicle_maintenance").insert(payload);
    if(error){onNotice("Não foi possível registrar a manutenção: "+error.message);return;}
    if(["Agendada","Em andamento"].includes(maintenance.status)) {
      const update=await supabase.from("vehicles").update({status:"Em manutencao"}).eq("id",vehicle.id);
      if(update.error) onNotice("Manutenção registrada, mas não foi possível atualizar a situação da viatura: "+update.error.message);
    }
    onNotice("Manutenção registrada.");
    setMaintenance({vehicle_id:"",maintenance_type:"Preventiva",description:"",workshop_name:"",status:"Agendada",scheduled_start:today(),expected_end_date:"",odometer:"",labor_cost:"0",parts_cost:"0",notes:""});
    await Promise.all([loadRecords(),onRefresh()]);
  }

  async function changeMaintenanceStatus(row:any,status:string) {
    if(!supabase||!admin)return;
    const completedAt=status==="Concluida"?new Date().toISOString():null;
    const {error}=await supabase.from("vehicle_maintenance").update({status,completed_at:completedAt,updated_at:new Date().toISOString()}).eq("id",row.id);
    if(error){onNotice("Não foi possível atualizar a manutenção: "+error.message);return;}
    if(status==="Concluida"||status==="Cancelada") {
      const stillActive=maintenances.some(m=>m.id!==row.id&&m.vehicle_id===row.vehicle_id&&["Agendada","Em andamento"].includes(m.status));
      if(!stillActive) {
        const vehicle=vehicles.find(v=>v.id===row.vehicle_id);
        if(vehicle?.status==="Em manutencao") await supabase.from("vehicles").update({status:"Disponivel"}).eq("id",row.vehicle_id);
      }
    } else {
      await supabase.from("vehicles").update({status:"Em manutencao"}).eq("id",row.vehicle_id);
    }
    onNotice("Situação da manutenção atualizada.");
    await Promise.all([loadRecords(),onRefresh()]);
  }

  const totalFuel=fuelings.reduce((n,r)=>n+Number(r.total_amount||0),0);
  const totalMaintenance=maintenances.reduce((n,r)=>n+Number(r.total_cost||0),0);
  const vehicleLabel=(v:Vehicle|undefined)=>v?((v.fleet_number?v.fleet_number+" · ":"")+v.model):"Viatura";

  return <section>
    <div className="section-head"><div><h2>Abastecimento e manutenção</h2><p>Registros operacionais e custos por viatura.</p></div><button className="small-primary" onClick={()=>{loadRecords();onRefresh();}}><RefreshCw size={14}/> Atualizar</button></div>
    <div className="stats">
      <div className="stat-card"><div><span>Abastecimentos registrados</span><strong>{fuelings.length}</strong></div><div className="stat-icon"><Fuel size={20}/></div></div>
      {admin&&<div className="stat-card"><div><span>Custo total de combustível</span><strong>{money(totalFuel)}</strong></div><div className="stat-icon"><Fuel size={20}/></div></div>}
      {admin&&<div className="stat-card"><div><span>Custo total de manutenção</span><strong>{money(totalMaintenance)}</strong></div><div className="stat-icon"><Wrench size={20}/></div></div>}
    </div>
    <div className="actions" style={{marginBottom:16}}>
      <button className={section==="fuel"?"small-primary":"small-secondary"} onClick={()=>setSection("fuel")}><Fuel size={14}/> Abastecimentos</button>
      {admin&&<button className={section==="maintenance"?"small-primary":"small-secondary"} onClick={()=>setSection("maintenance")}><Wrench size={14}/> Manutenções</button>}
    </div>
    {section==="fuel"&&<>
      <form className="panel form" onSubmit={saveFuel}>
        <h3><Plus size={18}/> Registrar abastecimento</h3>
        {!admin&&!ownPerson&&<p className="notice">Sua conta não está vinculada a um cadastro funcional ativo.</p>}
        <div className="form-row">
          <Field label="Viatura"><select required value={fuel.vehicle_id} onChange={e=>setFuel({...fuel,vehicle_id:e.target.value,vehicle_usage_id:"",personnel_id:""})}><option value="">Selecione</option>{vehicles.filter(v=>admin||eligibleUsages.some(u=>u.vehicle_id===v.id)).map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></Field>
          <Field label="Utilização vinculada"><select required value={fuel.vehicle_usage_id} onChange={e=>{const u=eligibleUsages.find(x=>x.id===e.target.value);setFuel({...fuel,vehicle_usage_id:e.target.value,personnel_id:u?.personnel_id||""});}}><option value="">Selecione</option>{eligibleUsages.filter(u=>!fuel.vehicle_id||u.vehicle_id===fuel.vehicle_id).map(u=><option key={u.id} value={u.id}>{u.personnel?.full_name||"Policial"} · {new Date(u.departure_at).toLocaleDateString("pt-BR")} · {u.destination}</option>)}</select></Field>
        </div>
        {admin&&<Field label="Policial responsável"><select required value={fuel.personnel_id} onChange={e=>setFuel({...fuel,personnel_id:e.target.value})}><option value="">Selecione a utilização primeiro</option>{personnel.filter(p=>!fuel.vehicle_usage_id||p.id===eligibleUsages.find(u=>u.id===fuel.vehicle_usage_id)?.personnel_id).map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>}
        <div className="form-row">
          <Field label="Data"><input required type="date" value={fuel.fueled_at} onChange={e=>setFuel({...fuel,fueled_at:e.target.value})}/></Field>
          <Field label="Quilometragem no abastecimento"><input required type="number" min="0" step="0.1" value={fuel.odometer} onChange={e=>setFuel({...fuel,odometer:e.target.value})}/></Field>
        </div>
        <div className="form-row">
          <Field label="Combustível"><select value={fuel.fuel_type} onChange={e=>setFuel({...fuel,fuel_type:e.target.value})}><option>Gasolina</option><option>Etanol</option><option>Diesel</option><option>GNV</option><option>Outro</option></select></Field>
          <Field label="Litros"><input required type="number" min="0.001" step="0.001" value={fuel.liters} onChange={e=>setFuel({...fuel,liters:e.target.value})}/></Field>
          <Field label="Preço por litro (R$)"><input required type="number" min="0" step="0.001" value={fuel.unit_price} onChange={e=>setFuel({...fuel,unit_price:e.target.value})}/></Field>
        </div>
        <div className="form-row">
          <Field label="Posto"><input value={fuel.station_name} onChange={e=>setFuel({...fuel,station_name:e.target.value})}/></Field>
          <Field label="Valor total calculado"><input readOnly value={money(fuelTotal)}/></Field>
        </div>
        <label className="checkline"><input type="checkbox" checked={fuel.full_tank} onChange={e=>setFuel({...fuel,full_tank:e.target.checked})}/> Abastecimento com tanque completo</label>
        <Field label="Observações"><textarea value={fuel.notes} onChange={e=>setFuel({...fuel,notes:e.target.value})}/></Field>
        <button className="primary" disabled={busy||(!admin&&!ownPerson)}>Salvar abastecimento</button>
      </form>
      <div className="panel table-panel"><h3>Histórico de abastecimentos</h3>{fuelings.length===0?<p className="muted">Nenhum abastecimento registrado.</p>:<div className="table-wrap"><table><thead><tr><th>Data</th><th>Viatura</th><th>Responsável</th><th>Combustível</th><th>Litros</th><th>Km</th><th>Valor</th></tr></thead><tbody>{fuelings.map(r=><tr key={r.id}><td>{new Date(r.fueled_at).toLocaleDateString("pt-BR")}</td><td>{r.vehicle?.fleet_number||"Viatura"} · {r.vehicle?.model||""}</td><td>{r.personnel?.full_name||"Policial"}</td><td>{r.fuel_type}{r.full_tank?" · tanque completo":""}</td><td>{Number(r.liters).toLocaleString("pt-BR",{maximumFractionDigits:3})}</td><td>{Number(r.odometer).toLocaleString("pt-BR")}</td><td>{money(Number(r.total_amount||0))}</td></tr>)}</tbody></table></div>}</div>
    </>}
    {section==="maintenance"&&admin&&<>
      <form className="panel form" onSubmit={saveMaintenance}>
        <h3><Plus size={18}/> Registrar manutenção</h3>
        <div className="form-row">
          <Field label="Viatura"><select required value={maintenance.vehicle_id} onChange={e=>setMaintenance({...maintenance,vehicle_id:e.target.value})}><option value="">Selecione</option>{vehicles.filter(v=>v.status!=="Inativa").map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></Field>
          <Field label="Tipo"><select value={maintenance.maintenance_type} onChange={e=>setMaintenance({...maintenance,maintenance_type:e.target.value})}><option>Preventiva</option><option>Corretiva</option></select></Field>
        </div>
        <Field label="Descrição do serviço"><textarea required value={maintenance.description} onChange={e=>setMaintenance({...maintenance,description:e.target.value})}/></Field>
        <div className="form-row">
          <Field label="Oficina"><input value={maintenance.workshop_name} onChange={e=>setMaintenance({...maintenance,workshop_name:e.target.value})}/></Field>
          <Field label="Situação inicial"><select value={maintenance.status} onChange={e=>setMaintenance({...maintenance,status:e.target.value})}><option value="Agendada">Agendada</option><option value="Em andamento">Em andamento</option><option value="Concluida">Concluída</option></select></Field>
        </div>
        <div className="form-row">
          <Field label="Início previsto"><input type="date" value={maintenance.scheduled_start} onChange={e=>setMaintenance({...maintenance,scheduled_start:e.target.value})}/></Field>
          <Field label="Previsão de conclusão"><input type="date" value={maintenance.expected_end_date} onChange={e=>setMaintenance({...maintenance,expected_end_date:e.target.value})}/></Field>
          <Field label="Quilometragem"><input type="number" min="0" step="0.1" value={maintenance.odometer} onChange={e=>setMaintenance({...maintenance,odometer:e.target.value})}/></Field>
        </div>
        <div className="form-row">
          <Field label="Mão de obra (R$)"><input type="number" min="0" step="0.01" value={maintenance.labor_cost} onChange={e=>setMaintenance({...maintenance,labor_cost:e.target.value})}/></Field>
          <Field label="Peças (R$)"><input type="number" min="0" step="0.01" value={maintenance.parts_cost} onChange={e=>setMaintenance({...maintenance,parts_cost:e.target.value})}/></Field>
        </div>
        <Field label="Observações"><textarea value={maintenance.notes} onChange={e=>setMaintenance({...maintenance,notes:e.target.value})}/></Field>
        <button className="primary" disabled={busy}>Salvar manutenção</button>
      </form>
      <div className="panel table-panel"><h3>Histórico de manutenções</h3>{maintenances.length===0?<p className="muted">Nenhuma manutenção registrada.</p>:<div className="table-wrap"><table><thead><tr><th>Viatura</th><th>Serviço</th><th>Oficina</th><th>Período</th><th>Custos</th><th>Situação / ação</th></tr></thead><tbody>{maintenances.map(r=><tr key={r.id}><td>{r.vehicle?.fleet_number||"Viatura"} · {r.vehicle?.model||""}</td><td>{r.maintenance_type}<small>{r.description}</small></td><td>{r.workshop_name||"Não informada"}</td><td>{r.scheduled_start||"—"}<small>Previsão: {r.expected_end_date||"—"}</small></td><td>{money(Number(r.total_cost||0))}<small>Mão de obra: {money(Number(r.labor_cost||0))} · Peças: {money(Number(r.parts_cost||0))}</small></td><td><Status value={r.status}/>{["Agendada","Em andamento"].includes(r.status)&&<div className="actions"><button className="small-primary" onClick={()=>changeMaintenanceStatus(r,"Em andamento")}>Iniciar</button><button className="small-secondary" onClick={()=>changeMaintenanceStatus(r,"Concluida")}>Concluir</button><button className="small-danger" onClick={()=>changeMaintenanceStatus(r,"Cancelada")}>Cancelar</button></div>}</td></tr>)}</tbody></table></div>}</div>
    </>}
    <p className="muted small-note">Consumo médio em km/l será calculado somente entre abastecimentos consecutivos marcados como tanque completo, para evitar estimativas incorretas.</p>
  </section>;
}

function Field({label,children}:{label:string;children:React.ReactNode}) { return <label className="field"><span>{label}</span>{children}</label>; }
function Status({value}:{value:string}) { const cls=["Concluida","Concluída"].includes(value)?"green":["Cancelada"].includes(value)?"red":["Agendada","Em andamento"].includes(value)?"amber":"blue"; return <span className={`status ${cls}`}>{value==="Concluida"?"Concluída":value}</span>; }
