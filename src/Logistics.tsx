import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, PackagePlus, RefreshCw, Search, Truck, X } from "lucide-react";
import { supabase } from "./lib";
import "./logistics.css";

type Material = {
  id: string; name: string; category: string; unit: string;
  minimum_stock: number; current_stock: number; storage_location: string | null;
  active: boolean; notes: string | null;
};
type Movement = {
  id: string; material_id: string; movement_type: "Entrada"|"Saída"|"Ajuste";
  quantity: number; stock_before: number; stock_after: number; movement_date: string;
  destination: string|null; recipient_name: string|null; reference_document: string|null; notes: string|null;
  material?: { name:string; unit:string } | null;
};

export default function Logistics() {
  const [materials,setMaterials]=useState<Material[]>([]);
  const [movements,setMovements]=useState<Movement[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [search,setSearch]=useState("");
  const [view,setView]=useState<"stock"|"movements">("stock");
  const [modal,setModal]=useState<"material"|"movement"|null>(null);
  const [formMaterial,setFormMaterial]=useState({name:"",category:"Material didático",unit:"unidade",minimum_stock:"0",storage_location:"",notes:""});
  const [formMovement,setFormMovement]=useState({material_id:"",movement_type:"Entrada" as Movement["movement_type"],quantity:"",destination:"",recipient_name:"",reference_document:"",notes:""});
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    const [m,mv]=await Promise.all([
      supabase.from("logistics_materials").select("*").eq("active",true).order("name"),
      supabase.from("logistics_movements").select("*, material:logistics_materials(name,unit)").order("movement_date",{ascending:false}).limit(100)
    ]);
    if(m.error){setError(m.error.message);} else if(mv.error){setError(mv.error.message);} else {setMaterials((m.data||[]) as Material[]);setMovements((mv.data||[]) as Movement[]);}
    setLoading(false);
  },[]);
  useEffect(()=>{void load();},[load]);
  const filtered=useMemo(()=>materials.filter(m=>`${m.name} ${m.category} ${m.storage_location||""}`.toLowerCase().includes(search.toLowerCase())),[materials,search]);
  const lowStock=materials.filter(m=>Number(m.current_stock)<=Number(m.minimum_stock));
  const totalUnits=materials.reduce((acc,m)=>acc+Number(m.current_stock),0);
  async function addMaterial(e:FormEvent){
    e.preventDefault();setSaving(true);setError("");setNotice("");
    const payload={...formMaterial,minimum_stock:Number(formMaterial.minimum_stock),current_stock:0,created_by:(await supabase.auth.getUser()).data.user?.id};
    const {error:err}=await supabase.from("logistics_materials").insert(payload);
    if(err)setError(err.message);else{setNotice("Material cadastrado.");setModal(null);setFormMaterial({name:"",category:"Material didático",unit:"unidade",minimum_stock:"0",storage_location:"",notes:""});await load();}
    setSaving(false);
  }
  async function addMovement(e:FormEvent){
    e.preventDefault();setSaving(true);setError("");setNotice("");
    const {data,error:err}=await supabase.rpc("register_logistics_movement",{
      p_material_id:formMovement.material_id,p_movement_type:formMovement.movement_type,
      p_quantity:Number(formMovement.quantity),p_destination:formMovement.destination||null,
      p_recipient_profile_id:null,p_recipient_name:formMovement.recipient_name||null,
      p_reference_document:formMovement.reference_document||null,p_notes:formMovement.notes||null
    });
    if(err)setError(err.message);else{setNotice("Movimentação registrada e saldo atualizado.");setModal(null);setFormMovement({material_id:"",movement_type:"Entrada",quantity:"",destination:"",recipient_name:"",reference_document:"",notes:""});await load();}
    setSaving(false);
  }
  return <main className="logistics-page">
    <header className="logistics-header">
      <div><h1>Logística</h1><p>Controle de materiais, entradas, saídas e distribuição.</p></div>
      <button className="logistics-button secondary" onClick={()=>void load()}><RefreshCw size={16}/> Atualizar</button>
    </header>
    {error&&<div className="logistics-alert error">{error}</div>}
    {notice&&<div className="logistics-alert success">{notice}</div>}
    <section className="logistics-summary">
      <article className="logistics-summary-card"><Boxes/><span>Materiais cadastrados</span><strong>{materials.length}</strong></article>
      <article className="logistics-summary-card"><PackagePlus/><span>Saldo total (unidades somadas)</span><strong>{totalUnits.toLocaleString("pt-BR")}</strong></article>
      <article className={`logistics-summary-card ${lowStock.length?"warning":""}`}><AlertTriangle/><span>Estoque baixo ou no mínimo</span><strong>{lowStock.length}</strong></article>
    </section>
    <section className="logistics-panel">
      <div className="logistics-panel-head">
        <div className="logistics-tabs"><button className={view==="stock"?"active":""} onClick={()=>setView("stock")}>Estoque</button><button className={view==="movements"?"active":""} onClick={()=>setView("movements")}>Movimentações</button></div>
        <div className="logistics-actions"><label className="logistics-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar material"/></label><button className="logistics-button secondary" onClick={()=>setModal("material")}><PackagePlus size={16}/> Novo material</button><button className="logistics-button primary" onClick={()=>setModal("movement")}><ArrowUpFromLine size={16}/> Registrar movimentação</button></div>
      </div>
      {loading?<div className="logistics-empty">Carregando...</div>:view==="stock"?<div className="logistics-table-wrap"><table className="logistics-table"><thead><tr><th>Material</th><th>Categoria</th><th>Saldo</th><th>Estoque mínimo</th><th>Localização</th><th>Situação</th></tr></thead><tbody>{filtered.map(m=><tr key={m.id}><td><b>{m.name}</b></td><td>{m.category}</td><td>{Number(m.current_stock).toLocaleString("pt-BR")} {m.unit}</td><td>{Number(m.minimum_stock).toLocaleString("pt-BR")} {m.unit}</td><td>{m.storage_location||"—"}</td><td><span className={`logistics-stock-pill ${Number(m.current_stock)<=Number(m.minimum_stock)?"low":"ok"}`}>{Number(m.current_stock)<=Number(m.minimum_stock)?"Repor estoque":"Adequado"}</span></td></tr>)}</tbody></table>{filtered.length===0&&<div className="logistics-empty">Nenhum material encontrado.</div>}</div>:<div className="logistics-table-wrap"><table className="logistics-table"><thead><tr><th>Data</th><th>Material</th><th>Movimento</th><th>Qtd.</th><th>Saldo anterior</th><th>Saldo atual</th><th>Destino / destinatário</th></tr></thead><tbody>{movements.filter(m=>!search||m.material?.name?.toLowerCase().includes(search.toLowerCase())).map(m=><tr key={m.id}><td>{new Date(m.movement_date).toLocaleString("pt-BR")}</td><td><b>{m.material?.name||"Material"}</b></td><td><span className={`logistics-movement-type ${m.movement_type.toLowerCase()}`}>{m.movement_type}</span></td><td>{m.quantity} {m.material?.unit}</td><td>{m.stock_before}</td><td>{m.stock_after}</td><td>{[m.destination,m.recipient_name].filter(Boolean).join(" · ")||"—"}</td></tr>)}</tbody></table>{movements.length===0&&<div className="logistics-empty">Ainda não há movimentações registradas.</div>}</div>}
    </section>
    {modal&&<div className="logistics-modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><section className="logistics-modal"><header><h2>{modal==="material"?"Cadastrar material":"Registrar movimentação"}</h2><button type="button" className="icon-button" onClick={()=>setModal(null)}><X/></button></header>
      {modal==="material"?<form onSubmit={addMaterial} className="logistics-form"><label>Nome do material<input required value={formMaterial.name} onChange={e=>setFormMaterial({...formMaterial,name:e.target.value})}/></label><label>Categoria<input value={formMaterial.category} onChange={e=>setFormMaterial({...formMaterial,category:e.target.value})}/></label><label>Unidade<select value={formMaterial.unit} onChange={e=>setFormMaterial({...formMaterial,unit:e.target.value})}>{["unidade","pacote","caixa","resma","kit","metro","litro","kg"].map(u=><option key={u}>{u}</option>)}</select></label><label>Estoque mínimo<input type="number" min="0" step="0.01" value={formMaterial.minimum_stock} onChange={e=>setFormMaterial({...formMaterial,minimum_stock:e.target.value})}/></label><label>Local de armazenamento<input value={formMaterial.storage_location} onChange={e=>setFormMaterial({...formMaterial,storage_location:e.target.value})}/></label><label className="full">Observações<textarea value={formMaterial.notes} onChange={e=>setFormMaterial({...formMaterial,notes:e.target.value})}/></label><footer><button type="button" className="logistics-button secondary" onClick={()=>setModal(null)}>Cancelar</button><button disabled={saving} className="logistics-button primary">{saving?"Salvando...":"Cadastrar material"}</button></footer></form>:<form onSubmit={addMovement} className="logistics-form"><label className="full">Material<select required value={formMovement.material_id} onChange={e=>setFormMovement({...formMovement,material_id:e.target.value})}><option value="">Selecione...</option>{materials.map(m=><option key={m.id} value={m.id}>{m.name} · saldo {m.current_stock} {m.unit}</option>)}</select></label><label>Tipo<select value={formMovement.movement_type} onChange={e=>setFormMovement({...formMovement,movement_type:e.target.value as Movement["movement_type"]})}><option>Entrada</option><option>Saída</option><option>Ajuste</option></select></label><label>Quantidade {formMovement.movement_type==="Ajuste"?"(novo saldo)":"(movimentada)"}<input required type="number" min="0.01" step="0.01" value={formMovement.quantity} onChange={e=>setFormMovement({...formMovement,quantity:e.target.value})}/></label><label>Destino<input value={formMovement.destination} onChange={e=>setFormMovement({...formMovement,destination:e.target.value})} placeholder="Escola, setor..."/></label><label>Destinatário<input value={formMovement.recipient_name} onChange={e=>setFormMovement({...formMovement,recipient_name:e.target.value})} placeholder="Nome do responsável"/></label><label>Documento de referência<input value={formMovement.reference_document} onChange={e=>setFormMovement({...formMovement,reference_document:e.target.value})}/></label><label className="full">Observações<textarea value={formMovement.notes} onChange={e=>setFormMovement({...formMovement,notes:e.target.value})}/></label><footer><button type="button" className="logistics-button secondary" onClick={()=>setModal(null)}>Cancelar</button><button disabled={saving} className="logistics-button primary">{saving?"Registrando...":"Registrar"}</button></footer></form>}
    </section></div>}
  </main>;
}
