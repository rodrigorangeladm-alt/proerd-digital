import { useEffect, useMemo, useState } from "react";
import { FileText, FolderOpen, Download, Plus, Trash2, Search, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase, type Profile } from "./lib";

type DocumentRow = {
  id: string; title: string; description: string | null; category: string; visibility: "all" | "instructor" | "school" | "admin";
  school_id: string | null; file_path: string; file_name: string; mime_type: string | null; file_size: number | null;
  created_at: string; created_by: string;
};
type SchoolOption = { id: string; name: string };
const categories = ["Normas e orientações", "Material pedagógico", "Formulários", "Planejamento", "Relatórios", "Modelos e documentos", "Outros"];

export default function DocumentsLibrary({ profile, schools = [] }: { profile: Profile; schools?: SchoolOption[] }) {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [visibility, setVisibility] = useState<"all" | "instructor" | "school" | "admin">("all");
  const [schoolId, setSchoolId] = useState("");
  const isAdmin = profile.role === "admin";

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.from("institutional_documents").select("*").order("created_at", { ascending: false });
    if (error) setNotice("Não foi possível carregar os documentos. Confira a migração 011 e as permissões do Supabase.");
    else setRows((data || []) as DocumentRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [profile.id]);

  const visible = useMemo(() => rows.filter(r =>
    (categoryFilter === "Todas" || r.category === categoryFilter) &&
    `${r.title} ${r.description || ""} ${r.file_name}`.toLowerCase().includes(query.toLowerCase())
  ), [rows, categoryFilter, query]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !file || !title.trim()) return;
    setNotice("");
    const safeName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${crypto.randomUUID()}-${safeName}`;
    const { error: storageError } = await supabase.storage.from("institutional-documents").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (storageError) { setNotice(`Falha no envio do arquivo: ${storageError.message}`); return; }
    const { error } = await supabase.from("institutional_documents").insert({
      title: title.trim(), description: description.trim() || null, category, visibility,
      school_id: visibility === "school" ? schoolId || null : null,
      file_path: path, file_name: file.name, mime_type: file.type || null, file_size: file.size, created_by: profile.id
    });
    if (error) {
      await supabase.storage.from("institutional-documents").remove([path]);
      setNotice(`Arquivo enviado, mas o cadastro não foi concluído: ${error.message}`); return;
    }
    setTitle(""); setDescription(""); setFile(null); setVisibility("all"); setSchoolId("");
    const input = document.getElementById("institutional-file") as HTMLInputElement | null; if (input) input.value = "";
    setNotice("Documento publicado na biblioteca."); await load();
  }

  async function download(row: DocumentRow) {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from("institutional-documents").createSignedUrl(row.file_path, 60);
    if (error || !data?.signedUrl) { setNotice("Não foi possível gerar o acesso ao arquivo."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  async function remove(row: DocumentRow) {
    if (!supabase || !isAdmin || !window.confirm(`Excluir o documento “${row.title}”?`)) return;
    const { error } = await supabase.from("institutional_documents").delete().eq("id", row.id);
    if (error) { setNotice("Não foi possível excluir o registro."); return; }
    await supabase.storage.from("institutional-documents").remove([row.file_path]);
    setNotice("Documento excluído."); await load();
  }

  return <section>
    <div className="section-head"><div><h2>Biblioteca de documentos</h2><p>Arquivos institucionais organizados por categoria e perfil de acesso.</p></div><span className="count">{visible.length} documentos</span></div>
    {notice && <div className="notice-bar">{notice}<button onClick={() => setNotice("")}>×</button></div>}
    {isAdmin && <form className="panel form" onSubmit={upload}>
      <h3><Plus size={18}/> Publicar novo documento</h3>
      <div className="form-row"><label>Título<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Orientações para aplicação do PROERD"/></label><label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div>
      <label>Descrição<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Informações sobre o documento"/></label>
      <div className="form-row"><label>Disponibilidade<select value={visibility} onChange={e=>setVisibility(e.target.value as any)}><option value="all">Todos os usuários</option><option value="instructor">Somente instrutores</option><option value="school">Escolas</option><option value="admin">Somente administração</option></select></label>{visibility === "school" && <label>Escola específica (opcional)<select value={schoolId} onChange={e=>setSchoolId(e.target.value)}><option value="">Todas as escolas</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}</div>
      <label>Arquivo<input id="institutional-file" type="file" required onChange={e=>setFile(e.target.files?.[0] || null)}/></label>
      <button className="primary" disabled={!file || !title.trim()}><Plus size={16}/> Publicar documento</button>
    </form>}
    <div className="panel">
      <div className="form-row"><label><Search size={15}/> Buscar documento<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Título, descrição ou nome do arquivo"/></label><label>Categoria<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option>Todas</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label><button className="small-secondary" type="button" onClick={load}><RefreshCw size={15}/> Atualizar</button></div>
      {loading ? <p>Carregando documentos...</p> : visible.length === 0 ? <div className="empty"><FolderOpen size={24}/><p>Nenhum documento disponível nesta categoria.</p></div> : <div className="records">{visible.map(row=><div className="record" key={row.id}><div className="record-icon"><FileText size={19}/></div><div className="record-main"><b>{row.title}</b><small>{row.category} · {row.file_name} · {row.file_size ? `${(row.file_size/1024/1024).toFixed(2)} MB` : "Tamanho não informado"}</small>{row.description && <small>{row.description}</small>}<small><ShieldCheck size={12}/> {row.visibility === "all" ? "Todos os usuários" : row.visibility === "instructor" ? "Instrutores" : row.visibility === "school" ? "Escolas" : "Administração"}</small></div><div className="actions"><button className="small-primary" type="button" onClick={()=>download(row)}><Download size={14}/> Abrir</button>{isAdmin && <button className="small-danger" type="button" onClick={()=>remove(row)}><Trash2 size={14}/></button>}</div></div>)}</div>}
    </div>
  </section>;
}
