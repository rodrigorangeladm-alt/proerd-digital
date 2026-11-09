import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, MessageSquare, Plus, Send, RefreshCw } from "lucide-react";
import { supabase, type Profile, type School } from "./lib";

type Message = { id:string; title:string; body:string; audience:"all"|"instructor"|"school"; school_id:string|null; created_at:string; created_by:string; author?:{full_name:string}|null; school?:{name:string}|null };
type ReadRow = { message_id:string };

export default function CommunicationCenter({profile,schools}:{profile:Profile;schools:School[]}) {
  const [messages,setMessages]=useState<Message[]>([]);
  const [readIds,setReadIds]=useState<string[]>([]);
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [audience,setAudience]=useState<"all"|"instructor"|"school">("all");
  const [schoolId,setSchoolId]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const isAdmin=profile.role==="admin";
  const unread=useMemo(()=>messages.filter(m=>!readIds.includes(m.id)).length,[messages,readIds]);

  async function load(){
    if(!supabase)return;
    setBusy(true);
    const {data,error}=await supabase.from("proerd_messages").select("*, author:profiles!proerd_messages_created_by_fkey(full_name), school:schools(name)").order("created_at",{ascending:false});
    if(error){setNotice("Não foi possível carregar os comunicados. Verifique a migração 010 e as permissões do Supabase.");setBusy(false);return;}
    setMessages((data||[]) as Message[]);
    const {data:reads}=await supabase.from("proerd_message_reads").select("message_id").eq("profile_id",profile.id);
    setReadIds(((reads||[]) as ReadRow[]).map(r=>r.message_id));
    setBusy(false);
  }
  useEffect(()=>{load();},[profile.id]);

  async function publish(e:React.FormEvent){
    e.preventDefault(); if(!supabase)return;
    if(audience==="school"&&!schoolId){setNotice("Selecione a escola destinatária.");return;}
    setBusy(true);
    const {error}=await supabase.from("proerd_messages").insert({title:title.trim(),body:body.trim(),audience,school_id:audience==="school"?schoolId:null,created_by:profile.id});
    setNotice(error?error.message:"Comunicado publicado.");
    if(!error){setTitle("");setBody("");setAudience("all");setSchoolId("");await load();}
    setBusy(false);
  }
  async function markRead(id:string){
    if(!supabase||readIds.includes(id))return;
    const {error}=await supabase.from("proerd_message_reads").insert({message_id:id,profile_id:profile.id});
    if(!error)setReadIds(prev=>[...prev,id]);
  }
  async function markAllRead(){
    for(const m of messages){if(!readIds.includes(m.id))await markRead(m.id);}
  }

  return <section>
    <div className="section-head"><div><h2>Comunicação e notificações</h2><p>Comunicados oficiais internos, avisos e histórico de mensagens do PROERD DIGITAL.</p></div><div className="actions"><span className="count">{unread} não lidas</span><button className="small-secondary" onClick={load} disabled={busy}><RefreshCw size={14}/> Atualizar</button></div></div>
    {isAdmin&&<form className="panel form demand-form" onSubmit={publish}>
      <h3><Plus size={18}/> Novo comunicado</h3>
      <Field label="Título"><input required maxLength={140} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Reunião de alinhamento do PROERD"/></Field>
      <div className="form-row"><Field label="Destinatários"><select value={audience} onChange={e=>setAudience(e.target.value as any)}><option value="all">Todos os usuários</option><option value="instructor">Somente instrutores</option><option value="school">Uma escola específica</option></select></Field>
      {audience==="school"&&<Field label="Escola"><select required value={schoolId} onChange={e=>setSchoolId(e.target.value)}><option value="">Selecione</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}</div>
      <Field label="Mensagem"><textarea required rows={4} maxLength={5000} value={body} onChange={e=>setBody(e.target.value)} placeholder="Digite o comunicado ou aviso..."/></Field>
      <button className="primary" disabled={busy||!title.trim()||!body.trim()}><Send size={15}/> Publicar comunicado</button>
    </form>}
    {notice&&<p className="notice">{notice}</p>}
    <div className="section-head"><div><h2>{isAdmin?"Comunicados publicados":"Caixa de entrada"}</h2><p>{isAdmin?"Mensagens disponíveis conforme o público definido.":"Avisos direcionados ao seu perfil."}</p></div>{unread>0&&<button className="small-secondary" onClick={markAllRead}><CheckCheck size={14}/> Marcar todas como lidas</button>}</div>
    <div className="records">{messages.length===0?<div className="panel"><p className="muted">Nenhum comunicado disponível.</p></div>:messages.map(m=><article className="panel" key={m.id} style={{marginBottom:12,borderLeft:!readIds.includes(m.id)?"4px solid #245783":undefined}}>
      <div className="section-head"><div><h3><MessageSquare size={17}/> {m.title}</h3><p className="muted">{new Date(m.created_at).toLocaleString("pt-BR")} · {m.author?.full_name||"Administração"}{m.audience==="school"&&m.school?.name?` · ${m.school.name}`:m.audience==="instructor"?" · Instrutores":" · Todos"}</p></div>{!readIds.includes(m.id)&&<span className="status amber">Nova</span>}</div>
      <p style={{whiteSpace:"pre-wrap"}}>{m.body}</p>
      {!readIds.includes(m.id)&&<button className="small-secondary" onClick={()=>markRead(m.id)}><CheckCheck size={14}/> Marcar como lida</button>}
    </article>)}</div>
  </section>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
