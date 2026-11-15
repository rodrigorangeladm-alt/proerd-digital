import { useEffect, useState } from "react";
import { Bell, Check, X } from "lucide-react";

type NotificationRow = { id:string; message:string; actor_name:string|null; entity_label:string; created_at:string; is_read:boolean };
export default function AdminNotifications({supabase, profile}:{supabase:any;profile:any}) {
  const [items,setItems] = useState<NotificationRow[]>([]);
  const [open,setOpen] = useState(false);
  const [toast,setToast] = useState<NotificationRow|null>(null);
  const unread = items.filter(x=>!x.is_read).length;
  useEffect(()=>{
    if (!supabase || profile?.role !== "admin") return;
    let alive = true;
    supabase.from("admin_notifications").select("id,message,actor_name,entity_label,created_at,is_read").eq("recipient_id",profile.id).order("created_at",{ascending:false}).limit(30)
      .then(({data}:any)=>{if(alive)setItems(data||[])});
    const channel = supabase.channel(`admin-notifications-${profile.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"admin_notifications",filter:`recipient_id=eq.${profile.id}`},(payload:any)=>{
        const row=payload.new as NotificationRow;
        setItems(prev=>[row,...prev].slice(0,30)); setToast(row);
      }).subscribe();
    return ()=>{alive=false;supabase.removeChannel(channel)};
  },[supabase,profile?.id,profile?.role]);
  async function markRead(id:string){
    const {error}=await supabase.from("admin_notifications").update({is_read:true}).eq("id",id).eq("recipient_id",profile.id);
    if(!error)setItems(prev=>prev.map(x=>x.id===id?{...x,is_read:true}:x));
  }
  async function markAll(){
    const ids=items.filter(x=>!x.is_read).map(x=>x.id); if(!ids.length)return;
    const {error}=await supabase.from("admin_notifications").update({is_read:true}).in("id",ids).eq("recipient_id",profile.id);
    if(!error)setItems(prev=>prev.map(x=>({...x,is_read:true})));
  }
  if(profile?.role!=="admin")return null;
  return <div className="admin-notifications">
    <button className="notification-trigger" onClick={()=>setOpen(v=>!v)} aria-label={`Notificações: ${unread} não lidas`}><Bell size={18}/>{unread>0&&<span className="notification-count">{unread>99?"99+":unread}</span>}</button>
    {open&&<div className="notification-popover"><div className="notification-head"><b>Atualizações dos instrutores</b><button onClick={()=>setOpen(false)} aria-label="Fechar"><X size={16}/></button></div><div className="notification-actions"><span>{unread} não lidas</span><button onClick={markAll} disabled={!unread}>Marcar todas como lidas</button></div>
      {items.length===0?<p className="notification-empty">Nenhuma atualização recebida.</p>:<div className="notification-list">{items.map(item=><button key={item.id} className={`notification-item ${item.is_read?"read":"unread"}`} onClick={()=>markRead(item.id)}><span className="notification-message">{item.message}</span><small>{new Date(item.created_at).toLocaleString("pt-BR")}</small>{!item.is_read&&<span className="notification-dot"/>}</button>)}</div>}
    </div>}
    {toast&&<div className="notification-toast" role="status"><div><b>Nova atualização</b><p>{toast.message}</p><small>{new Date(toast.created_at).toLocaleTimeString("pt-BR")}</small></div><button onClick={()=>setToast(null)} aria-label="Dispensar aviso"><X size={16}/></button></div>}
  </div>;
}
