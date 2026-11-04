import { useEffect, useMemo, useState } from "react";
import {
  Activity as ActivityIcon, AlertCircle, ArrowRight, BookOpen, Check, CheckCircle2,
  ClipboardList, GraduationCap, LayoutDashboard, LogOut, Plus, RefreshCw, School as SchoolIcon,
  ShieldCheck, Users, X
} from "lucide-react";
import { configured, supabase, type Activity, type Demand, type Profile, type School } from "./lib";

type Tab = "dashboard" | "schools" | "demands" | "activities" | "reports" | "users";
const dateToday = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [schools, setSchools] = useState<School[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [roleSaving, setRoleSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [region, setRegion] = useState("Ceilândia");
  const [schoolType, setSchoolType] = useState("Pública");
  const [address, setAddress] = useState("");
  const [dSchool, setDSchool] = useState("");
  const [className, setClassName] = useState("5º ano A");
  const [activityType, setActivityType] = useState("PROERD 5º ano");
  const [preferredDate, setPreferredDate] = useState(dateToday());
  const [assignTo, setAssignTo] = useState("");
  const [activityDemand, setActivityDemand] = useState("");
  const [students, setStudents] = useState("25");
  const [activityResult, setActivityResult] = useState("Realizada integralmente");
  const [activityNotes, setActivityNotes] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) { setProfile(null); return; }
    loadProfile();
  }, [session]);

  useEffect(() => {
    if (profile) refresh();
  }, [profile]);

  async function loadProfile() {
    if (!supabase || !session) return;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (error) { setNotice("Não foi possível carregar seu perfil. Verifique a configuração do banco."); return; }
    setProfile(data as Profile);
  }

  async function refresh() {
    if (!supabase || !profile) return;
    setLoading(true);
    const [s, d, a, u] = await Promise.all([
      supabase.from("schools").select("*").order("name"),
      supabase.from("demands").select("*, schools(name,region), assignee:profiles!demands_assigned_to_fkey(full_name)").order("created_at", { ascending: false }),
      supabase.from("activities").select("*, demands(protocol,class_name,schools(name)), instructor:profiles!activities_instructor_id_fkey(full_name)").order("created_at", { ascending: false }),
      profile.role === "admin" ? supabase.from("profiles").select("*").order("full_name") : Promise.resolve({ data: [], error: null } as any)
    ]);
    const errors = [s.error, d.error, a.error].filter(Boolean);
    if (errors.length) setNotice("Alguns dados não foram carregados. Confira as políticas e a migração do Supabase.");
    setSchools((s.data || []) as School[]);
    setDemands((d.data || []) as Demand[]);
    setActivities((a.data || []) as Activity[]);
    setUsers((u.data || []) as Profile[]);
    setLoading(false);
  }

  async function authenticate(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setNotice("");
    const result = authMode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (result.error) setNotice(result.error.message);
    else if (authMode === "signup") setNotice("Cadastro recebido. Confirme o e-mail, se a confirmação estiver habilitada, e depois entre. O perfil inicial é instrutor.");
  }

  async function addSchool(e: React.FormEvent) {
    e.preventDefault(); if (!supabase) return;
    const { error } = await supabase.from("schools").insert({ name: schoolName, region, school_type: schoolType, address });
    setNotice(error ? error.message : "Escola cadastrada.");
    if (!error) { setSchoolName(""); setAddress(""); refresh(); }
  }

  async function addDemand(e: React.FormEvent) {
    e.preventDefault(); if (!supabase) return;
    const { error } = await supabase.from("demands").insert({
      school_id: dSchool, class_name: className, activity_type: activityType,
      preferred_date: preferredDate || null, status: "Pendente"
    });
    setNotice(error ? error.message : "Demanda criada e protocolada.");
    if (!error) refresh();
  }

  async function assignDemand(id: string) {
    if (!supabase || !assignTo) return;
    const { error } = await supabase.from("demands").update({ assigned_to: assignTo, status: "Aguardando aceite" }).eq("id", id);
    setNotice(error ? error.message : "Instrutor designado. Aguardando resposta.");
    setAssignTo(""); refresh();
  }

  async function respondDemand(id: string, accepted: boolean) {
    if (!supabase) return;
    const reason = accepted ? null : window.prompt("Informe a justificativa da recusa:");
    if (!accepted && !reason?.trim()) { setNotice("A justificativa é obrigatória."); return; }
    const { error } = await supabase.rpc("respond_to_demand", {
      p_demand_id: id, p_accept: accepted, p_reason: accepted ? null : reason
    });
    setNotice(error ? error.message : accepted ? "Designação aceita." : "Recusa registrada. Demanda retornou à fila administrativa.");
    refresh();
  }

  async function submitActivity(e: React.FormEvent) {
    e.preventDefault(); if (!supabase || !activityDemand) return;
    const { error } = await supabase.from("activities").insert({
      demand_id: activityDemand, instructor_id: session.user.id, performed_on: dateToday(),
      students_present: Number(students), result: activityResult, notes: activityNotes || null,
      status: "Pendente de validação"
    });
    setNotice(error ? error.message : "Registro de atividade enviado para validação.");
    if (!error) { setActivityNotes(""); refresh(); }
  }

  async function validateActivity(id: string, approved: boolean) {
    if (!supabase) return;
    if (!approved && !reviewNote.trim()) { setNotice("Informe o motivo da devolução."); return; }
    const { error } = await supabase.from("activities").update({
      status: approved ? "Validada" : "Devolvida", validation_note: approved ? null : reviewNote,
      validated_by: session.user.id, validated_at: new Date().toISOString()
    }).eq("id", id);
    setNotice(error ? error.message : approved ? "Atividade validada." : "Atividade devolvida para correção.");
    setReviewNote(""); refresh();
  }

  async function changeUserRole(user: Profile, nextRole: "admin" | "instructor") {
    if (!supabase || !profile?.is_primary_admin) return;
    if (user.is_primary_admin) { setNotice("A conta do administrador principal não pode ser alterada."); return; }
    if (user.id === session.user.id) { setNotice("Você não pode alterar o próprio perfil principal."); return; }
    if (user.role === nextRole) return;
    const confirmed = window.confirm(`Confirma alterar ${user.full_name} para ${nextRole === "admin" ? "Administrador" : "Instrutor"}?`);
    if (!confirmed) return;
    setRoleSaving(user.id);
    const { error } = await supabase.rpc("manage_user_role", { p_user_id: user.id, p_role: nextRole });
    setRoleSaving(null);
    setNotice(error ? `Não foi possível alterar o perfil: ${error.message}` : `Perfil de ${user.full_name} atualizado para ${nextRole === "admin" ? "Administrador" : "Instrutor"}.`);
    if (!error) await refresh();
  }

  const visibleDemands = useMemo(() => profile?.role === "admin" ? demands : demands.filter(d => d.assigned_to === profile?.id), [demands, profile]);
  const visibleActivities = useMemo(() => profile?.role === "admin" ? activities : activities.filter(a => (a as any).instructor_id === profile?.id), [activities, profile]);
  const pending = demands.filter(d => d.status === "Pendente" || d.status === "Aguardando aceite").length;
  const validated = activities.filter(a => a.status === "Validada").length;

  if (!configured) return <SetupScreen />;
  if (!session) return <div className="auth-wrap"><div className="auth-card">
    <Brand />
    <h1>{authMode === "login" ? "Acesse sua conta" : "Criar acesso de teste"}</h1>
    <p className="muted">Ambiente de prova de conceito. Utilize somente dados fictícios.</p>
    <form onSubmit={authenticate} className="form">
      {authMode === "signup" && <Field label="Nome completo"><input required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nome fictício" /></Field>}
      <Field label="E-mail"><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@exemplo.com" /></Field>
      <Field label="Senha"><input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres" /></Field>
      <button className="primary full">{authMode === "login" ? "Entrar" : "Cadastrar"}</button>
    </form>
    <button className="link-btn" onClick={()=>setAuthMode(authMode === "login" ? "signup" : "login")}>{authMode === "login" ? "Ainda não tenho acesso. Criar conta" : "Já tenho conta. Entrar"}</button>
    {notice && <p className="notice">{notice}</p>}
  </div></div>;

  if (!profile) return <div className="loading-screen"><RefreshCw className="spin" /> Carregando perfil...</div>;

  const menu: {id:Tab; label:string; icon:any}[] = [
    {id:"dashboard",label:"Painel inicial",icon:LayoutDashboard},
    ...(profile.role === "admin" ? [{id:"schools" as Tab,label:"Escolas",icon:SchoolIcon}] : []),
    {id:"demands",label:profile.role === "admin" ? "Central de demandas" : "Minhas designações",icon:ClipboardList},
    {id:"activities",label:profile.role === "admin" ? "Validação de atividades" : "Minhas atividades",icon:BookOpen},
    ...(profile.role === "admin" ? [{id:"reports" as Tab,label:"Relatórios",icon:ActivityIcon}] : []),
    ...(profile.is_primary_admin ? [{id:"users" as Tab,label:"Gerenciamento de usuários",icon:Users}] : [])
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="profile-mini"><div className="avatar">{profile.full_name?.slice(0,1).toUpperCase() || "U"}</div><div><b>{profile.full_name}</b><small>{profile.role === "admin" ? "Administrador" : "Instrutor"}</small></div></div>
      <nav>{menu.map(item=><button key={item.id} className={tab===item.id?"nav-item active":"nav-item"} onClick={()=>setTab(item.id)}><item.icon size={18}/>{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><span className="env"><span/> Ambiente de testes</span><button className="nav-item" onClick={()=>supabase?.auth.signOut()}><LogOut size={18}/> Sair</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">PLATAFORMA INTEGRADA DE GESTÃO</div><h1>{menu.find(m=>m.id===tab)?.label}</h1></div><div className="top-actions"><span className="role-tag">{profile.role === "admin" ? "ADMINISTRAÇÃO" : "INSTRUTOR"}</span><button className="icon-btn" onClick={refresh} title="Atualizar"><RefreshCw size={18}/></button></div></header>
      {notice && <div className="notice-bar"><AlertCircle size={17}/>{notice}<button onClick={()=>setNotice("")}><X size={16}/></button></div>}
      {loading && <div className="loading-line"/>}
      {tab==="dashboard" && <section>
        <div className="welcome"><div><h2>Bem-vindo ao PROERD DIGITAL</h2><p>Ambiente controlado para validar o fluxo administrativo antes de uma implantação institucional.</p></div><ShieldCheck size={42}/></div>
        <div className="stats">
          <Stat label="Escolas cadastradas" value={schools.length} icon={SchoolIcon} onClick={() => setTab(profile.role === "admin" ? "schools" : "dashboard")} disabled={profile.role !== "admin"}/>
          <Stat label="Demandas em andamento" value={pending} icon={ClipboardList} onClick={() => setTab("demands")}/>
          <Stat label="Atividades registradas" value={activities.length} icon={BookOpen} onClick={() => setTab("activities")}/>
          <Stat label="Atividades validadas" value={validated} icon={CheckCircle2} onClick={() => setTab("activities")}/>
        </div>
        <div className="section-head"><div><h2>Fluxo da prova de conceito</h2><p>Selecione uma etapa para abrir a funcionalidade correspondente.</p></div></div>
        <div className="flow-grid">{[
          {label:"Cadastro da escola", tab:"schools" as Tab, adminOnly:true},
          {label:"Abertura da demanda", tab:"demands" as Tab},
          {label:"Triagem e designação", tab:"demands" as Tab, adminOnly:true},
          {label:"Aceite do instrutor", tab:"demands" as Tab},
          {label:"Execução da atividade", tab:"activities" as Tab},
          {label:"Validação administrativa", tab:"activities" as Tab, adminOnly:true},
          {label:"Relatório consolidado", tab:"reports" as Tab, adminOnly:true}
        ].map((step,i)=><button type="button" className="flow-step" key={step.label} disabled={!!step.adminOnly && profile.role !== "admin"} onClick={()=>setTab(step.tab)} title={step.adminOnly && profile.role !== "admin" ? "Disponível para administradores" : `Abrir ${step.label}`}><span>{i+1}</span><b>{step.label}</b>{i!==6&&<ArrowRight size={15}/>}</button>)}</div>
        <div className="info-panel"><AlertCircle size={19}/><div><b>Importante</b><p>Esta versão não substitui sistemas oficiais e não deve receber dados pessoais reais, informações de crianças ou documentos institucionais.</p></div></div>
      </section>}
      {tab==="schools" && <section>
        <div className="section-head"><div><h2>Cadastro de escolas</h2><p>Cadastro único para relacionar demandas e turmas.</p></div></div>
        <div className="two-col"><form className="panel form" onSubmit={addSchool}><h3><Plus size={18}/> Nova escola</h3><Field label="Nome da escola"><input required value={schoolName} onChange={e=>setSchoolName(e.target.value)} placeholder="Escola Exemplo" /></Field><div className="form-row"><Field label="Região administrativa"><input required value={region} onChange={e=>setRegion(e.target.value)} /></Field><Field label="Tipo"><select value={schoolType} onChange={e=>setSchoolType(e.target.value)}><option>Pública</option><option>Privada</option><option>Federal</option></select></Field></div><Field label="Endereço fictício"><input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Endereço para simulação" /></Field><button className="primary">Salvar escola</button></form>
        <div className="panel"><h3>Escolas cadastradas <span className="count">{schools.length}</span></h3>{schools.length===0?<Empty text="Nenhuma escola cadastrada."/>:<div className="records">{schools.map(s=><div className="record" key={s.id}><div className="record-icon"><SchoolIcon size={18}/></div><div><b>{s.name}</b><small>{s.region} · {s.school_type}</small></div></div>)}</div>}</div></div>
      </section>}
      {tab==="demands" && <section>
        {profile.role==="admin" && <div className="panel form demand-form"><h3><Plus size={18}/> Abrir nova demanda</h3><form onSubmit={addDemand}><div className="form-row"><Field label="Escola"><select required value={dSchool} onChange={e=>setDSchool(e.target.value)}><option value="">Selecione</option>{schools.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></Field><Field label="Turma"><input required value={className} onChange={e=>setClassName(e.target.value)}/></Field></div><div className="form-row"><Field label="Tipo de atividade"><select value={activityType} onChange={e=>setActivityType(e.target.value)}><option>PROERD 5º ano</option><option>PROERD 7º ano</option><option>PROERD Kids</option><option>Palestra</option></select></Field><Field label="Data preferencial"><input type="date" value={preferredDate} onChange={e=>setPreferredDate(e.target.value)}/></Field></div><button className="primary" disabled={!schools.length}>Criar demanda</button></form></div>}
        <div className="section-head"><div><h2>{profile.role==="admin"?"Fila de demandas":"Designações recebidas"}</h2><p>Protocolos e andamento do atendimento.</p></div><span className="count">{visibleDemands.length} registros</span></div>
        <div className="panel table-panel">{visibleDemands.length===0?<Empty text="Nenhuma demanda disponível."/>:<div className="table-wrap"><table><thead><tr><th>Protocolo</th><th>Escola / turma</th><th>Atividade</th><th>Data</th><th>Status</th><th>Responsável / ação</th></tr></thead><tbody>{visibleDemands.map(d=><tr key={d.id}><td><b>{d.protocol}</b></td><td>{d.schools?.name || "Escola"}<small>{d.class_name}</small></td><td>{d.activity_type}</td><td>{d.preferred_date || "A definir"}</td><td><Status value={d.status}/></td><td>{profile.role==="admin"?d.assigned_to?<span>{d.assignee?.full_name || "Instrutor"}</span>:<div className="assign"><select value={assignTo} onChange={e=>setAssignTo(e.target.value)}><option value="">Designar instrutor</option>{users.filter(u=>u.role === "instructor").map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select><button className="small-primary" disabled={!assignTo} onClick={()=>assignDemand(d.id)}>Designar</button></div>:d.status==="Aguardando aceite"?<div className="actions"><button className="small-primary" onClick={()=>respondDemand(d.id,true)}>Aceitar</button><button className="small-danger" onClick={()=>respondDemand(d.id,false)}>Recusar</button></div>:d.refusal_reason?<small>Recusa anterior: {d.refusal_reason}</small>:"-"}</td></tr>)}</tbody></table></div>}</div>
      </section>}
      {tab==="activities" && <section>
        {profile.role==="instructor" && <div className="panel form demand-form"><h3><Plus size={18}/> Registrar atividade executada</h3><form onSubmit={submitActivity}><div className="form-row"><Field label="Designação aceita"><select required value={activityDemand} onChange={e=>setActivityDemand(e.target.value)}><option value="">Selecione</option>{visibleDemands.filter(d=>d.status==="Aceita").map(d=><option key={d.id} value={d.id}>{d.protocol} · {d.schools?.name} · {d.class_name}</option>)}</select></Field><Field label="Alunos presentes (número fictício)"><input type="number" min="0" value={students} onChange={e=>setStudents(e.target.value)}/></Field></div><Field label="Resultado"><select value={activityResult} onChange={e=>setActivityResult(e.target.value)}><option>Realizada integralmente</option><option>Realizada parcialmente</option><option>Não realizada</option></select></Field><Field label="Observações"><textarea value={activityNotes} onChange={e=>setActivityNotes(e.target.value)} placeholder="Informações fictícias para o teste."/></Field><button className="primary">Enviar para validação</button></form></div>}
        <div className="section-head"><div><h2>{profile.role==="admin"?"Registros para validação":"Histórico de atividades"}</h2><p>Somente atividades validadas integram os indicadores consolidados.</p></div></div>
        <div className="panel table-panel">{visibleActivities.length===0?<Empty text="Nenhuma atividade registrada."/>:<div className="table-wrap"><table><thead><tr><th>Protocolo</th><th>Escola / turma</th><th>Data</th><th>Alunos</th><th>Status</th><th>Validação</th></tr></thead><tbody>{visibleActivities.map(a=><tr key={a.id}><td>{a.demands?.protocol || "—"}</td><td>{a.demands?.schools?.name || "Escola"}<small>{a.demands?.class_name}</small></td><td>{a.performed_on}</td><td>{a.students_present}</td><td><Status value={a.status}/></td><td>{profile.role==="admin" && a.status==="Pendente de validação"?<div className="review"><input placeholder="Motivo se devolver" value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/><button className="small-primary" onClick={()=>validateActivity(a.id,true)}><Check size={14}/> Validar</button><button className="small-danger" onClick={()=>validateActivity(a.id,false)}>Devolver</button></div>:a.validation_note || (profile.role==="admin"?(a as any).instructor?.full_name:"")}</td></tr>)}</tbody></table></div>}</div>
      </section>}
      {tab==="reports" && profile.role==="admin" && <section>
        <div className="section-head"><div><h2>Relatório gerencial</h2><p>Indicadores demonstrativos calculados a partir dos registros validados.</p></div></div>
        <div className="stats"><Stat label="Escolas" value={schools.length} icon={SchoolIcon}/><Stat label="Demandas totais" value={demands.length} icon={ClipboardList}/><Stat label="Atividades validadas" value={validated} icon={CheckCircle2}/><Stat label="Alunos registrados nas validadas" value={activities.filter(a=>a.status==="Validada").reduce((n,a)=>n+a.students_present,0)} icon={Users}/></div>
        <div className="panel"><h3>Consolidação por situação</h3>{["Pendente de validação","Validada","Devolvida"].map(status=><div className="bar-row" key={status}><span>{status}</span><div className="bar"><i style={{width:`${activities.length?activities.filter(a=>a.status===status).length/activities.length*100:0}%`}}/></div><b>{activities.filter(a=>a.status===status).length}</b></div>)}<p className="muted small-note">Exportação Excel/PDF será incluída em etapa posterior. Este painel não é relatório oficial.</p></div>
      </section>}
      {tab==="users" && profile.is_primary_admin && <section>
        <div className="section-head"><div><h2>Gerenciamento de usuários</h2><p>Somente o administrador principal pode alterar os perfis de acesso.</p></div><span className="count">{users.length} usuários</span></div>
        <div className="info-panel users-info"><ShieldCheck size={19}/><div><b>Administrador principal</b><p>Sua conta possui proteção especial. Ela não pode ser rebaixada ou alterada por esta tela. Novos usuários devem criar sua própria conta; inicialmente, serão instrutores.</p></div></div>
        <div className="panel users-panel">
          <div className="users-heading"><div><h3>Contas cadastradas</h3><p>Promova instrutores a administradores ou ajuste permissões existentes.</p></div><button className="small-primary" onClick={refresh}><RefreshCw size={13}/> Atualizar lista</button></div>
          {users.length===0 ? <Empty text="Nenhum usuário encontrado."/> : <div className="table-wrap"><table className="users-table"><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil atual</th><th>Alterar perfil</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><b>{u.full_name || "Usuário sem nome"}</b>{u.is_primary_admin && <small>Administrador principal</small>}</td><td>{u.email || "E-mail não disponível"}</td><td>{u.is_primary_admin ? <span className="status green">Principal</span> : <span className={`status ${u.role === "admin" ? "blue" : "amber"}`}>{u.role === "admin" ? "Administrador" : "Instrutor"}</span>}</td><td>{u.is_primary_admin ? <span className="muted">Protegido</span> : <div className="role-actions"><button className={u.role === "admin" ? "small-primary selected" : "small-secondary"} disabled={roleSaving===u.id || u.role === "admin"} onClick={()=>changeUserRole(u,"admin")}>{roleSaving===u.id ? "Salvando..." : "Tornar administrador"}</button><button className={u.role === "instructor" ? "small-secondary selected" : "small-danger"} disabled={roleSaving===u.id || u.role === "instructor"} onClick={()=>changeUserRole(u,"instructor")}>{roleSaving===u.id ? "Salvando..." : "Tornar instrutor"}</button></div>}</td></tr>)}</tbody></table></div>}
        </div>
        <div className="panel form user-create-note"><h3><Plus size={18}/> Como adicionar uma pessoa</h3><ol><li>A pessoa acessa a tela inicial e escolhe “Criar conta”.</li><li>Após confirmar o e-mail, se essa exigência estiver ativa, ela entra no sistema.</li><li>O cadastro aparece nesta lista com o perfil inicial de instrutor.</li><li>Você escolhe se mantém como instrutor ou promove a administrador.</li></ol><p className="muted">Esta versão não envia convites por e-mail. A criação da conta é feita pelo próprio usuário.</p></div>
      </section>}
      <footer>PROERD DIGITAL · PoC 0.2 · Dados fictícios · Não é sistema oficial da PMDF</footer>
    </main>
  </div>;
}

function Brand(){return <div className="brand"><div className="brand-mark"><ShieldCheck size={23}/></div><div><b>PROERD DIGITAL</b><small>PLATAFORMA INTEGRADA</small></div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
function Stat({label,value,icon:Icon,onClick,disabled=false}:{label:string;value:number;icon:any;onClick:()=>void;disabled?:boolean}){return <button type="button" className="stat-card" onClick={onClick} disabled={disabled} aria-label={`Abrir ${label}`}><div><span>{label}</span><strong>{value}</strong></div><div className="stat-icon"><Icon size={20}/></div></button>}
function Status({value}:{value:string}){const cls=value==="Validada"||value==="Aceita"?"green":value==="Devolvida"?"red":value==="Pendente"||value==="Pendente de validação"?"amber":"blue";return <span className={`status ${cls}`}>{value}</span>}
function Empty({text}:{text:string}){return <div className="empty"><ClipboardList size={26}/><span>{text}</span></div>}
function SetupScreen(){return <div className="auth-wrap"><div className="auth-card setup"><Brand/><h1>Configuração inicial</h1><p>O código da aplicação está pronto. Para conectar ao banco de dados, crie o projeto no Supabase e configure as duas variáveis de ambiente.</p><ol><li>Execute o arquivo <code>supabase/migrations/001_initial_schema.sql</code> no SQL Editor do Supabase.</li><li>Copie a URL do projeto e a chave publicável (anon) para um arquivo <code>.env</code>.</li><li>Reinicie a aplicação com <code>npm run dev</code>.</li></ol><p className="muted">Não coloque a chave service_role no frontend, no GitHub ou neste chat.</p><div className="notice">O projeto ainda não está conectado a um banco. Nenhum dado será gravado até concluir esta configuração.</div></div></div>}
