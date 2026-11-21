import { useEffect, useMemo, useState } from "react";
import { supabase, type Profile, type Demand } from "./lib";
import { Users, Plus, CalendarCheck, Trophy, Upload, Download, School } from "lucide-react";

type Props = { profile: Profile; demands: Demand[]; schools?: any[] };
type ClassRow = { id:string; demand_id:string; class_name:string; start_date:string; end_date:string; instructor_id:string; notes?:string|null; created_at?:string };
type Student = { id:string; class_id:string; full_name:string; age:number|null; sex:string|null; status:string; final_grade:number|null; notes?:string|null };
type Attendance = { id:string; student_id:string; class_id:string; attendance_date:string; present:boolean; notes?:string|null };
const today = () => new Date().toISOString().slice(0,10);
const fmt = (d:string) => d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";

export default function StudentManagement({profile,demands}:Props){
  const [classes,setClasses]=useState<ClassRow[]>([]); const [students,setStudents]=useState<Student[]>([]); const [attendance,setAttendance]=useState<Attendance[]>([]);
  const [selectedClass,setSelectedClass]=useState(""); const [loading,setLoading]=useState(false); const [notice,setNotice]=useState("");
  const [classForm,setClassForm]=useState({demand_id:"",class_name:"",start_date:"",end_date:""});
  const [studentForm,setStudentForm]=useState({full_name:"",age:"",sex:"",notes:""});
  const [attendanceDate,setAttendanceDate]=useState(today()); const [attendanceDraft,setAttendanceDraft]=useState<Record<string,boolean>>({});
  const [rankingFilter,setRankingFilter]=useState("class"); const [search,setSearch]=useState(""); const [csvText,setCsvText]=useState("");
  const isAdmin=profile.role==="admin";
  const ownDemands=useMemo(()=>isAdmin?demands:demands.filter(d=>d.assigned_to===profile.id || (d as any).created_by===profile.id),[demands,isAdmin,profile.id]);
  const activeClass=classes.find(c=>c.id===selectedClass);
  const classStudents=students.filter(s=>s.class_id===selectedClass);
  const visibleRanking=useMemo(()=>{
    let pool=students;
    if(rankingFilter==="class") pool=students.filter(s=>s.class_id===selectedClass);
    else if(rankingFilter==="school") { const selectedDemand=ownDemands.find(d=>d.id===activeClass?.demand_id); const schoolId=(selectedDemand as any)?.school_id; const demandIds=ownDemands.filter(d=>(d as any).school_id===schoolId).map(d=>d.id); pool=students.filter(s=>classes.some(c=>c.id===s.class_id&&demandIds.includes(c.demand_id))); }
    return pool.filter(s=>s.final_grade!==null && s.final_grade!==undefined && s.full_name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>(b.final_grade||0)-(a.final_grade||0));
  },[students,rankingFilter,selectedClass,classes,ownDemands,activeClass,search]);
  async function load(){ if(!supabase)return; setLoading(true);
    const {data:c,error:ce}=await supabase.from("proerd_classes").select("*").order("start_date",{ascending:false});
    if(ce){setNotice(`Erro ao carregar turmas: ${ce.message}`);setLoading(false);return;}
    const classData=(c||[]) as ClassRow[];setClasses(classData);
    const ids=classData.map(x=>x.id); if(!ids.length){setStudents([]);setAttendance([]);setLoading(false);return;}
    const [{data:s,error:se},{data:a,error:ae}]=await Promise.all([
      supabase.from("proerd_students").select("*").in("class_id",ids).order("full_name"),
      supabase.from("proerd_attendance").select("*").in("class_id",ids).order("attendance_date",{ascending:false})
    ]);
    if(se||ae) setNotice(`Erro ao carregar dados de alunos/chamada: ${(se||ae)?.message}`);
    setStudents((s||[]) as Student[]);setAttendance((a||[]) as Attendance[]);setLoading(false);
  }
  useEffect(()=>{load();},[profile.id]);
  useEffect(()=>{ if(selectedClass){ const existing=attendance.filter(a=>a.class_id===selectedClass && a.attendance_date===attendanceDate); setAttendanceDraft(Object.fromEntries(classStudents.map(s=>[s.id,existing.find(a=>a.student_id===s.id)?.present ?? true]))); } },[selectedClass,attendanceDate,students,attendance]);
  async function createClass(e:React.FormEvent){e.preventDefault();if(!supabase)return;
    const d=ownDemands.find(x=>x.id===classForm.demand_id);if(!d){setNotice("Selecione uma demanda vinculada ao seu perfil.");return;}
    const {data,error}=await supabase.from("proerd_classes").insert({...classForm,instructor_id:profile.id}).select().single();
    if(error){setNotice(`Não foi possível criar turma: ${error.message}`);return;} setClassForm({demand_id:"",class_name:"",start_date:"",end_date:""});setNotice("Turma criada com sucesso.");await load();setSelectedClass(data.id);
  }
  async function addStudent(e:React.FormEvent){e.preventDefault();if(!supabase||!selectedClass)return;
    const {error}=await supabase.from("proerd_students").insert({class_id:selectedClass,full_name:studentForm.full_name,age:studentForm.age?Number(studentForm.age):null,sex:studentForm.sex||null,notes:studentForm.notes||null});
    if(error){setNotice(`Erro ao cadastrar aluno: ${error.message}`);return;}setStudentForm({full_name:"",age:"",sex:"",notes:""});setNotice("Aluno cadastrado.");await load();
  }
  async function saveGrade(student:Student,value:string){if(!supabase)return;const n=value===""?null:Number(value);if(n!==null&&(n<0||n>10)){setNotice("A nota deve estar entre 0 e 10.");return;}const {error}=await supabase.from("proerd_students").update({final_grade:n}).eq("id",student.id);if(error)setNotice(error.message);else setStudents(prev=>prev.map(s=>s.id===student.id?{...s,final_grade:n}:s));}
  function toggleAll(present:boolean){setAttendanceDraft(Object.fromEntries(classStudents.map(s=>[s.id,present])));}
  async function saveAttendance(){if(!supabase||!selectedClass)return;const payload=classStudents.map(s=>({student_id:s.id,class_id:selectedClass,attendance_date:attendanceDate,present:attendanceDraft[s.id]??true}));if(!payload.length)return;const {error}=await supabase.from("proerd_attendance").upsert(payload,{onConflict:"student_id,attendance_date"});if(error){setNotice(`Erro ao salvar chamada: ${error.message}`);return;}setNotice("Chamada salva.");await load();}
  async function deleteStudent(student:Student){if(!supabase)return;if(!confirm(`Excluir o cadastro de ${student.full_name}?`))return;const {error}=await supabase.from("proerd_students").delete().eq("id",student.id);if(error)setNotice(error.message);else{setNotice("Aluno removido.");await load();}}
  async function importCsv(){if(!supabase||!selectedClass||!csvText.trim())return;const rows=csvText.trim().split(/\r?\n/).map(r=>r.split(/[;,\t]/).map(x=>x.trim()));const data=rows.slice(1).filter(r=>r[0]).map(r=>({class_id:selectedClass,full_name:r[0],age:r[1]?Number(r[1]):null,sex:r[2]||null,final_grade:r[3]?Number(r[3]):null}));if(!data.length){setNotice("Não encontrei linhas válidas. Use: Nome,Idade,Sexo,Nota");return;}const {error}=await supabase.from("proerd_students").insert(data);if(error)setNotice(`Falha na importação: ${error.message}`);else{setNotice(`${data.length} aluno(s) importados.`);setCsvText("");await load();}}
  function downloadRanking(){const rows=[["Posição","Aluno","Turma","Idade","Sexo","Nota"],...visibleRanking.map((s,i)=>[i+1,s.full_name,classes.find(c=>c.id===s.class_id)?.class_name||"",s.age??"",s.sex??"",s.final_grade??""])];const csv=rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="ranking_proerd.csv";a.click();URL.revokeObjectURL(a.href);}
  return <section>
    <div className="section-head"><div><h2>Turmas, alunos e avaliações</h2><p>Gerencie turmas vinculadas às demandas, cadastre alunos, registre frequência e notas.</p></div><button className="small-secondary" onClick={load}>Atualizar</button></div>
    {notice&&<div className="notice">{notice}</div>}
    <div className="stats"><div className="stat"><Users/><span>Turmas</span><b>{classes.length}</b></div><div className="stat"><School/><span>Alunos</span><b>{students.length}</b></div><div className="stat"><CalendarCheck/><span>Frequência lançada</span><b>{attendance.length}</b></div><div className="stat"><Trophy/><span>Nota média</span><b>{students.filter(s=>s.final_grade!==null).length?(students.filter(s=>s.final_grade!==null).reduce((sum,s)=>sum+(s.final_grade||0),0)/students.filter(s=>s.final_grade!==null).length).toFixed(1):"—"}</b></div></div>
    <div className="two-col">
      <form className="panel form" onSubmit={createClass}><h3><Plus size={18}/> Nova turma</h3><Field label="Demanda / Escola"><select required value={classForm.demand_id} onChange={e=>setClassForm({...classForm,demand_id:e.target.value})}><option value="">Selecione demanda</option>{ownDemands.map(d=><option key={d.id} value={d.id}>{d.protocol} · {(d as any).schools?.name||"Escola"} · {d.class_name}</option>)}</select></Field><Field label="Nome da turma"><input required value={classForm.class_name} onChange={e=>setClassForm({...classForm,class_name:e.target.value})} placeholder="Ex.: Turma A - 5º ano"/></Field><div className="form-row"><Field label="Data de início"><input type="date" required value={classForm.start_date} onChange={e=>setClassForm({...classForm,start_date:e.target.value})}/></Field><Field label="Data de término"><input type="date" required min={classForm.start_date} value={classForm.end_date} onChange={e=>setClassForm({...classForm,end_date:e.target.value})}/></Field></div><button className="primary">Criar turma</button></form>
      <div className="panel form"><h3>Turmas cadastradas</h3>{classes.length===0?<p className="muted">Nenhuma turma cadastrada.</p>:<div className="records">{classes.map(c=><button className="record" style={{textAlign:"left",width:"100%",background:selectedClass===c.id?"#eef4ff":"transparent"}} key={c.id} onClick={()=>{setSelectedClass(c.id);setAttendanceDraft({});}}><div className="record-icon"><School size={18}/></div><div><b>{c.class_name}</b><small>{fmt(c.start_date)} até {fmt(c.end_date)}</small><small>{ownDemands.find(d=>d.id===c.demand_id)?.schools?.name||"Demanda"}</small></div></button>)}</div>}</div>
    </div>
    {activeClass&&<>
      <div className="section-head"><div><h3>{activeClass.class_name}</h3><p>Período: {fmt(activeClass.start_date)} a {fmt(activeClass.end_date)} · {classStudents.length} aluno(s)</p></div></div>
      <div className="two-col">
        <form className="panel form" onSubmit={addStudent}><h3><Plus size={18}/> Cadastrar aluno</h3><Field label="Nome completo"><input required value={studentForm.full_name} onChange={e=>setStudentForm({...studentForm,full_name:e.target.value})}/></Field><div className="form-row"><Field label="Idade"><input type="number" min="3" max="25" value={studentForm.age} onChange={e=>setStudentForm({...studentForm,age:e.target.value})}/></Field><Field label="Sexo"><select value={studentForm.sex} onChange={e=>setStudentForm({...studentForm,sex:e.target.value})}><option value="">Não informado</option><option value="Feminino">Feminino</option><option value="Masculino">Masculino</option><option value="Outro/Não informar">Outro/Não informar</option></select></Field></div><Field label="Observações (opcional)"><textarea value={studentForm.notes} onChange={e=>setStudentForm({...studentForm,notes:e.target.value})}/></Field><button className="primary">Cadastrar aluno</button></form>
        <div className="panel form"><h3><Upload size={18}/> Importar alunos CSV</h3><p className="muted">Formato: Nome,Idade,Sexo,Nota. A primeira linha deve ser o cabeçalho.</p><textarea rows={4} placeholder="Nome,Idade,Sexo,Nota\nAna,10,Feminino,9.5" value={csvText} onChange={e=>setCsvText(e.target.value)}/><button className="small-primary" onClick={importCsv}>Importar lista</button></div>
      </div>
      <div className="panel table-panel"><div className="section-head"><div><h3>Alunos e notas</h3><p>Notas finais de 0 a 10. Salve alterando o campo.</p></div></div>{!classStudents.length?<p className="muted">Cadastre alunos para iniciar.</p>:<div className="table-wrap"><table><thead><tr><th>Aluno</th><th>Idade</th><th>Sexo</th><th>Nota final</th><th>Frequência</th><th></th></tr></thead><tbody>{classStudents.map(s=><tr key={s.id}><td>{s.full_name}</td><td>{s.age??"—"}</td><td>{s.sex||"—"}</td><td><input type="number" min="0" max="10" step="0.1" defaultValue={s.final_grade??""} onBlur={e=>saveGrade(s,e.target.value)} style={{width:80}}/></td><td>{attendance.filter(a=>a.student_id===s.id&&a.present).length}/{attendance.filter(a=>a.student_id===s.id).length}</td><td><button className="small-danger" onClick={()=>deleteStudent(s)}>Excluir</button></td></tr>)}</tbody></table></div>}</div>
      <div className="panel form"><h3><CalendarCheck size={18}/> Lista de chamada</h3><div className="form-row"><Field label="Data da aula"><input type="date" value={attendanceDate} onChange={e=>setAttendanceDate(e.target.value)}/></Field><div className="actions"><button type="button" className="small-secondary" onClick={()=>toggleAll(true)}>Todos presentes</button><button type="button" className="small-secondary" onClick={()=>toggleAll(false)}>Todos ausentes</button></div></div>{classStudents.map(s=><label key={s.id} className="record"><span><b>{s.full_name}</b><small>{s.age??"idade não informada"} anos</small></span><input type="checkbox" checked={attendanceDraft[s.id]??true} onChange={e=>setAttendanceDraft({...attendanceDraft,[s.id]:e.target.checked})}/> Presente</label>)}<button className="primary" onClick={saveAttendance}>Salvar chamada</button></div>
    </>}
    <div className="panel table-panel"><div className="section-head"><div><h3><Trophy size={18}/> Ranking de notas</h3><p>Ranking calculado com alunos que possuem nota final.</p></div><button className="small-secondary" onClick={downloadRanking}><Download size={15}/> Exportar CSV</button></div><div className="form-row"><Field label="Abrangência"><select value={rankingFilter} onChange={e=>setRankingFilter(e.target.value)}><option value="class">Turma selecionada</option><option value="school">Escola da demanda selecionada</option><option value="all">Todas as turmas visíveis</option></select></Field><Field label="Buscar aluno"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome do aluno"/></Field></div>{!visibleRanking.length?<p className="muted">Nenhuma nota cadastrada para os filtros.</p>:<div className="table-wrap"><table><thead><tr><th>Posição</th><th>Aluno</th><th>Turma</th><th>Idade</th><th>Sexo</th><th>Nota</th></tr></thead><tbody>{visibleRanking.map((s,i)=><tr key={s.id}><td>{i+1}</td><td>{s.full_name}</td><td>{classes.find(c=>c.id===s.class_id)?.class_name||"—"}</td><td>{s.age??"—"}</td><td>{s.sex||"—"}</td><td><b>{s.final_grade?.toFixed(1)}</b></td></tr>)}</tbody></table></div>}</div>
  </section>;
}
function Field({label,children}:{label:string;children:any}){return <label className="field"><span>{label}</span>{children}</label>}
