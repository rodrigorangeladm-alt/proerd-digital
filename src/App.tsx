import { useEffect, useMemo, useState } from "react";
import {
  Activity as ActivityIcon, AlertCircle, ArrowRight, BookOpen, Check, CheckCircle2, CalendarDays, Clock,
  ClipboardList, GraduationCap, LayoutDashboard, LogOut, Plus, RefreshCw, School as SchoolIcon, Car,
  ShieldCheck, Users, X
} from "lucide-react";
import { configured, supabase, type Activity, type Demand, type Profile, type School } from "./lib";

type Tab = "dashboard" | "personnel" | "instructors" | "leave" | "vehicles" | "vehicleUsage" | "schools" | "demands" | "activities" | "reports" | "users";
type Personnel = {
  id: string;
  full_name: string;
  war_name: string | null;
  service_number: string | null;
  rank: string;
  career_track: string | null;
  function_name: string | null;
  sector: string;
  status: "Ativo" | "Afastado" | "Agregado" | "Inativo";
  linked_profile_id: string | null;
  notes: string | null;
  created_at?: string;
};
type Vehicle = {
  id: string; fleet_number: string | null; plate: string | null; make: string | null;
  model: string; manufacture_year: number | null; model_year: number | null; color: string | null;
  status: "Disponivel" | "Em uso" | "Em manutencao" | "Inativa";
  current_odometer: number; notes: string | null; created_at?: string;
};
type VehicleReservation = {
  id: string; vehicle_id: string; personnel_id: string; destination: string; purpose: string;
  scheduled_start: string; scheduled_end: string; requester_note: string | null;
  status: "Solicitada" | "Autorizada" | "Indeferida" | "Cancelada" | "Utilizada";
  administrative_note: string | null; reviewed_at: string | null; sgpol_registered: boolean;
  vehicle?: { fleet_number: string | null; make: string | null; model: string; plate: string | null } | null;
  personnel?: { full_name: string; war_name: string | null; rank: string } | null;
};
type VehicleUsage = {
  id: string;
  vehicle_id: string;
  personnel_id: string;
  destination: string;
  purpose: string;
  departure_at: string;
  return_at: string | null;
  odometer_out: number;
  odometer_in: number | null;
  status: "Em andamento" | "Finalizada" | "Cancelada";
  notes: string | null;
  return_notes?: string | null;
  vehicle?: { fleet_number: string | null; make: string | null; model: string; plate: string | null } | null;
  personnel?: { full_name: string; war_name: string | null; rank: string } | null;
};

type InstructorAvailability = { id?: string; profile_id: string; weekday: number; start_time: string; end_time: string; is_available: boolean; notes: string | null };
type LeaveRequest = {
  id: string; personnel_id: string; requester_profile_id: string;
  request_type: "Ferias" | "Licenca" | "Afastamento"; start_date: string; end_date: string;
  requester_note: string | null; status: string; sei_process_number: string | null;
  sei_status: string | null; administrative_note: string | null; decision_note: string | null;
  reviewed_by: string | null; reviewed_at: string | null; created_at: string;
  document_path?: string | null; document_name?: string | null; document_mime_type?: string | null; external_document_url?: string | null;
  personnel?: { full_name: string; war_name: string | null; rank: string } | null;
};
const dateToday = () => new Date().toISOString().slice(0, 10);
const dateTimeLocalNow = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [schools, setSchools] = useState<School[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [instructorAvailability, setInstructorAvailability] = useState<InstructorAvailability[]>([]);
  const [availabilityDraft, setAvailabilityDraft] = useState<Record<number, {start_time:string;end_time:string;is_available:boolean;notes:string}>>({});
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleUsages, setVehicleUsages] = useState<VehicleUsage[]>([]);
  const [vehicleReservations, setVehicleReservations] = useState<VehicleReservation[]>([]);
  const [reservationForm, setReservationForm] = useState({ vehicle_id: "", destination: "", purpose: "", scheduled_start: dateTimeLocalNow(), scheduled_end: "", requester_note: "" });
  const [reservationStartValues, setReservationStartValues] = useState<Record<string,{departure_at:string;odometer_out:string;sgpol_registered:boolean;notes:string}>>({});
  const [reservationReviewNotes, setReservationReviewNotes] = useState<Record<string,string>>({});
  const [usageForm, setUsageForm] = useState({
    vehicle_id: "", personnel_id: "", destination: "", purpose: "",
    departure_at: dateTimeLocalNow(), odometer_out: "", notes: ""
  });
  const [usageReturnValues, setUsageReturnValues] = useState<Record<string, { return_at: string; odometer_in: string; return_notes?: string }>>({});
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [editingVehicle, setEditingVehicle] = useState<string | null>(null);
  const emptyVehicleForm = { fleet_number: "", plate: "", make: "", model: "", manufacture_year: "", model_year: "", color: "", status: "Disponivel" as Vehicle["status"], current_odometer: "0", notes: "" };
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [leaveForm, setLeaveForm] = useState({ request_type: "Ferias" as LeaveRequest["request_type"], start_date: dateToday(), end_date: dateToday(), requester_note: "" });
  const [leaveDocument, setLeaveDocument] = useState<File | null>(null);
  const [leaveDocumentUrl, setLeaveDocumentUrl] = useState("");
  const [documentBusy, setDocumentBusy] = useState<string | null>(null);
  const [leaveEdit, setLeaveEdit] = useState<Record<string, {status:string; sei_process_number:string; sei_status:string; administrative_note:string; decision_note:string}>>({});
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [editingPersonnel, setEditingPersonnel] = useState<string | null>(null);
  const emptyPersonnelForm = { full_name: "", war_name: "", service_number: "", rank: "", career_track: "", function_name: "", sector: "PROERD", status: "Ativo" as Personnel["status"], linked_profile_id: "", notes: "" };
  const [personnelForm, setPersonnelForm] = useState(emptyPersonnelForm);
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
    const [s, d, a, u, p, lr, v, vu, vr, av] = await Promise.all([
      supabase.from("schools").select("*").order("name"),
      supabase.from("demands").select("*, schools(name,region), assignee:profiles!demands_assigned_to_fkey(full_name)").order("created_at", { ascending: false }),
      supabase.from("activities").select("*, demands(protocol,class_name,schools(name)), instructor:profiles!activities_instructor_id_fkey(full_name)").order("created_at", { ascending: false }),
      profile.role === "admin" ? supabase.from("profiles").select("*").order("full_name") : Promise.resolve({ data: [], error: null } as any),
      profile.role === "admin" ? supabase.from("personnel").select("*").order("full_name") : supabase.from("personnel").select("*").eq("linked_profile_id", profile.id),
      supabase.from("leave_requests").select("*, personnel(full_name,war_name,rank)").order("created_at", { ascending: false }),
      supabase.from("vehicles").select("*").order("fleet_number"),
      supabase.from("vehicle_usage").select("*, vehicle:vehicles(fleet_number,make,model,plate), personnel(full_name,war_name,rank)").order("departure_at", { ascending: false }),
      supabase.from("vehicle_reservations").select("*, vehicle:vehicles(fleet_number,make,model,plate), personnel(full_name,war_name,rank)").order("scheduled_start", { ascending: false }),
      supabase.from("instructor_weekly_availability").select("*").order("weekday")
    ]);
    const errors = [s.error, d.error, a.error, p.error, lr.error, v.error, vu.error, vr.error, av.error].filter(Boolean);
    if (errors.length) setNotice("Alguns dados não foram carregados. Confira as políticas e a migração do Supabase.");
    setSchools((s.data || []) as School[]);
    setDemands((d.data || []) as Demand[]);
    setActivities((a.data || []) as Activity[]);
    setUsers((u.data || []) as Profile[]);
    setPersonnel((p.data || []) as Personnel[]);
    setLeaveRequests((lr.data || []) as LeaveRequest[]);
    setVehicles((v.data || []) as Vehicle[]);
    setVehicleUsages((vu.data || []) as VehicleUsage[]);
    setVehicleReservations((vr.data || []) as VehicleReservation[]);
    setInstructorAvailability((av.data || []) as InstructorAvailability[]);
    const ownAvailability = (av.data || []).filter((row:any) => row.profile_id === profile.id);
    const draft: Record<number,{start_time:string;end_time:string;is_available:boolean;notes:string}> = {};
    for (let day=0; day<7; day++) {
      const row = ownAvailability.find((x:any)=>x.weekday===day);
      draft[day] = row ? {start_time:row.start_time?.slice(0,5) || "08:00",end_time:row.end_time?.slice(0,5) || "17:00",is_available:row.is_available,notes:row.notes || ""} : {start_time:"08:00",end_time:"17:00",is_available:day>=1 && day<=5,notes:""};
    }
    setAvailabilityDraft(draft);
    setLeaveEdit(Object.fromEntries(((lr.data || []) as LeaveRequest[]).map(r => [r.id, { status:r.status, sei_process_number:r.sei_process_number || "", sei_status:r.sei_status || "", administrative_note:r.administrative_note || "", decision_note:r.decision_note || "" }])));
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

  function startPersonnelEdit(person: Personnel) {
    setEditingPersonnel(person.id);
    setPersonnelForm({
      full_name: person.full_name || "", war_name: person.war_name || "",
      service_number: person.service_number || "", rank: person.rank || "",
      career_track: person.career_track || "", function_name: person.function_name || "",
      sector: person.sector || "PROERD", status: person.status || "Ativo",
      linked_profile_id: person.linked_profile_id || "", notes: person.notes || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetPersonnelForm() {
    setEditingPersonnel(null);
    setPersonnelForm(emptyPersonnelForm);
  }

  async function savePersonnel(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || profile?.role !== "admin") return;
    const payload = {
      full_name: personnelForm.full_name.trim(),
      war_name: personnelForm.war_name.trim() || null,
      service_number: personnelForm.service_number.trim() || null,
      rank: personnelForm.rank.trim(),
      career_track: personnelForm.career_track.trim() || null,
      function_name: personnelForm.function_name.trim() || null,
      sector: personnelForm.sector.trim() || "PROERD",
      status: personnelForm.status,
      linked_profile_id: personnelForm.linked_profile_id || null,
      notes: personnelForm.notes.trim() || null
    };
    const result = editingPersonnel
      ? await supabase.from("personnel").update(payload).eq("id", editingPersonnel)
      : await supabase.from("personnel").insert(payload);
    if (result.error) {
      setNotice(`Não foi possível salvar o cadastro: ${result.error.message}`);
      return;
    }
    setNotice(editingPersonnel ? "Cadastro funcional atualizado." : "Policial cadastrado no efetivo.");
    resetPersonnelForm();
    await refresh();
  }

  async function deactivatePersonnel(person: Personnel) {
    if (!supabase || profile?.role !== "admin") return;
    if (!window.confirm(`Confirma inativar o cadastro de ${person.full_name}? O registro será preservado no histórico.`)) return;
    const { error } = await supabase.from("personnel").update({ status: "Inativo" }).eq("id", person.id);
    setNotice(error ? `Não foi possível inativar: ${error.message}` : "Cadastro inativado. O histórico foi preservado.");
    if (!error) await refresh();
  }


  function startVehicleEdit(vehicle: Vehicle) {
    setEditingVehicle(vehicle.id);
    setVehicleForm({
      fleet_number: vehicle.fleet_number || "", plate: vehicle.plate || "", make: vehicle.make || "",
      model: vehicle.model || "", manufacture_year: vehicle.manufacture_year?.toString() || "",
      model_year: vehicle.model_year?.toString() || "", color: vehicle.color || "",
      status: vehicle.status, current_odometer: String(vehicle.current_odometer ?? 0), notes: vehicle.notes || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetVehicleForm() { setEditingVehicle(null); setVehicleForm(emptyVehicleForm); }

  async function saveVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || profile?.role !== "admin") return;
    const payload = {
      fleet_number: vehicleForm.fleet_number.trim() || null,
      plate: vehicleForm.plate.trim() || null,
      make: vehicleForm.make.trim() || null,
      model: vehicleForm.model.trim(),
      manufacture_year: vehicleForm.manufacture_year ? Number(vehicleForm.manufacture_year) : null,
      model_year: vehicleForm.model_year ? Number(vehicleForm.model_year) : null,
      color: vehicleForm.color.trim() || null,
      status: vehicleForm.status,
      current_odometer: Number(vehicleForm.current_odometer || 0),
      notes: vehicleForm.notes.trim() || null
    };
    if (!payload.model) { setNotice("Informe o modelo da viatura."); return; }
    if (!Number.isFinite(payload.current_odometer) || payload.current_odometer < 0) { setNotice("Informe uma quilometragem válida."); return; }
    const result = editingVehicle
      ? await supabase.from("vehicles").update(payload).eq("id", editingVehicle)
      : await supabase.from("vehicles").insert(payload);
    if (result.error) { setNotice(`Não foi possível salvar a viatura: ${result.error.message}`); return; }
    setNotice(editingVehicle ? "Cadastro da viatura atualizado." : "Viatura cadastrada.");
    resetVehicleForm();
    await refresh();
  }

  async function deactivateVehicle(vehicle: Vehicle) {
    if (!supabase || profile?.role !== "admin") return;
    if (!window.confirm(`Confirma inativar a viatura ${vehicle.fleet_number || vehicle.model}? O registro será preservado.`)) return;
    const { error } = await supabase.from("vehicles").update({ status: "Inativa" }).eq("id", vehicle.id);
    setNotice(error ? `Não foi possível inativar: ${error.message}` : "Viatura inativada. O histórico foi preservado.");
    if (!error) await refresh();
  }

  async function submitVehicleReservation(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !profile) return;
    const person = personnel.find(p => p.linked_profile_id === profile.id && p.status === "Ativo");
    if (!person) { setNotice("Sua conta precisa estar vinculada a um cadastro funcional ativo."); return; }
    if (!reservationForm.scheduled_end || new Date(reservationForm.scheduled_end) <= new Date(reservationForm.scheduled_start)) {
      setNotice("Informe um horário final posterior ao horário inicial."); return;
    }
    const { error } = await supabase.rpc("request_vehicle_reservation", {
      p_vehicle_id: reservationForm.vehicle_id, p_personnel_id: person.id,
      p_destination: reservationForm.destination.trim(), p_purpose: reservationForm.purpose.trim(),
      p_scheduled_start: new Date(reservationForm.scheduled_start).toISOString(),
      p_scheduled_end: new Date(reservationForm.scheduled_end).toISOString(),
      p_requester_note: reservationForm.requester_note.trim() || null
    });
    setNotice(error ? `Não foi possível enviar a pré-reserva: ${error.message}` : "Pré-reserva enviada para análise administrativa.");
    if (!error) {
      setReservationForm({vehicle_id:"",destination:"",purpose:"",scheduled_start:dateTimeLocalNow(),scheduled_end:"",requester_note:""});
      await refresh();
    }
  }

  async function reviewVehicleReservation(id: string, decision: "Autorizada" | "Indeferida") {
    if (!supabase || profile?.role !== "admin") return;
    const note = (reservationReviewNotes[id] || "").trim();
    if (decision === "Indeferida" && !note) { setNotice("Informe a justificativa antes de indeferir."); return; }
    const { error } = await supabase.rpc("review_vehicle_reservation", {p_reservation_id:id,p_decision:decision,p_administrative_note:note || null});
    setNotice(error ? `Não foi possível analisar a solicitação: ${error.message}` : `Pré-reserva ${decision.toLowerCase()} com sucesso.`);
    if (!error) await refresh();
  }

  async function startReservedVehicleUsage(id: string) {
    if (!supabase) return;
    const values = reservationStartValues[id];
    if (!values || !values.odometer_out) { setNotice("Informe a quilometragem de saída."); return; }
    if (!values.sgpol_registered) { setNotice("Confirme o registro no SGPol/PMDF, aba Motorista/Vistoria."); return; }
    const { error } = await supabase.rpc("start_reserved_vehicle_usage", {
      p_reservation_id:id, p_departure_at:new Date(values.departure_at).toISOString(),
      p_odometer_out:Number(values.odometer_out), p_sgpol_registered:true, p_notes:values.notes.trim() || null
    });
    setNotice(error ? `Não foi possível registrar a saída: ${error.message}` : "Saída registrada. A viatura agora consta como Em uso.");
    if (!error) await refresh();
  }

  async function startVehicleUsage(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !profile) return;
    const vehicle = vehicles.find(v => v.id === usageForm.vehicle_id);
    const person = profile.role === "admin"
      ? personnel.find(p => p.id === usageForm.personnel_id && p.status === "Ativo")
      : personnel.find(p => p.linked_profile_id === profile.id && p.status === "Ativo");
    if (!vehicle || vehicle.status !== "Disponivel") {
      setNotice("Selecione uma viatura disponível.");
      return;
    }
    if (!person) {
      setNotice("Selecione um policial com cadastro funcional ativo.");
      return;
    }
    if (vehicleUsages.some(u => u.vehicle_id === vehicle.id && u.status === "Em andamento")) {
      setNotice("Esta viatura já possui uma utilização em andamento.");
      return;
    }
    const odometer = Number(usageForm.odometer_out);
    if (!Number.isFinite(odometer) || odometer < Number(vehicle.current_odometer)) {
      setNotice("A quilometragem de saída não pode ser inferior à quilometragem atual da viatura.");
      return;
    }
    const { error } = await supabase.rpc("start_vehicle_usage", {
      p_vehicle_id: vehicle.id,
      p_personnel_id: person.id,
      p_destination: usageForm.destination.trim(),
      p_purpose: usageForm.purpose.trim(),
      p_departure_at: new Date(usageForm.departure_at).toISOString(),
      p_odometer_out: odometer,
      p_notes: usageForm.notes.trim() || null
    });
    if (error) {
      setNotice(`Não foi possível registrar a saída: ${error.message}`);
      return;
    }
    setNotice("Solicitação atendida. Saída da viatura registrada.");
    setUsageForm({ vehicle_id: "", personnel_id: "", destination: "", purpose: "", departure_at: dateTimeLocalNow(), odometer_out: "", notes: "" });
    await refresh();
  }

  async function finishVehicleUsage(id: string) {
    if (!supabase || !profile) return;
    const usage = vehicleUsages.find(u => u.id === id);
    const values = usageReturnValues[id];
    if (!usage || !values) return;
    const odometer = Number(values.odometer_in);
    if (!values.odometer_in || !Number.isFinite(odometer) || odometer < Number(usage.odometer_out)) {
      setNotice("A quilometragem de retorno deve ser igual ou superior à quilometragem de saída.");
      return;
    }
    if (!values.return_at) {
      setNotice("Informe a data e hora do retorno.");
      return;
    }
    const returnAt = new Date(values.return_at).toISOString();
    if (new Date(returnAt) < new Date(usage.departure_at)) {
      setNotice("A data e hora de retorno não podem ser anteriores à saída.");
      return;
    }
    const { error } = await supabase.rpc("finish_vehicle_usage", {
      p_usage_id: id,
      p_return_at: returnAt,
      p_odometer_in: odometer,
      p_return_notes: values.return_notes?.trim() || null
    });
    if (error) {
      setNotice(`Não foi possível finalizar a utilização: ${error.message}`);
      return;
    }
    setNotice("Retorno registrado e utilização finalizada.");
    await refresh();
  }

  async function cancelVehicleUsage(id: string) {
    if (!supabase || profile?.role !== "admin") return;
    const usage = vehicleUsages.find(u => u.id === id);
    if (!usage || usage.status !== "Em andamento") return;
    if (!window.confirm("Confirma cancelar este registro de utilização?")) return;
    const { error } = await supabase.from("vehicle_usage").update({ status: "Cancelada" }).eq("id", id);
    if (error) {
      setNotice(`Não foi possível cancelar o registro: ${error.message}`);
      return;
    }
    const vehicleUpdate = await supabase.from("vehicles").update({ status: "Disponivel" }).eq("id", usage.vehicle_id);
    setNotice(vehicleUpdate.error
      ? `Registro cancelado, mas não foi possível atualizar a situação da viatura: ${vehicleUpdate.error.message}`
      : "Registro de utilização cancelado.");
    await refresh();
  }

  async function saveAvailability() {
    if (!supabase || !profile) return;
    const rows = Object.entries(availabilityDraft).map(([weekday, value]) => ({
      profile_id: profile.id, weekday: Number(weekday), start_time: value.start_time,
      end_time: value.end_time, is_available: value.is_available, notes: value.notes.trim() || null,
      updated_at: new Date().toISOString()
    }));
    for (const row of rows) {
      if (row.is_available && row.end_time <= row.start_time) {
        setNotice(`Confira os horários de ${weekdayNames[row.weekday]}: o término deve ser posterior ao início.`);
        return;
      }
    }
    const { error } = await supabase.from("instructor_weekly_availability").upsert(rows, { onConflict: "profile_id,weekday" });
    setNotice(error ? `Não foi possível salvar a disponibilidade: ${error.message}` : "Disponibilidade semanal salva.");
    if (!error) await refresh();
  }

  async function submitLeaveRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !session?.user?.id) return;
    const linked = personnel.find(p => p.linked_profile_id === session.user.id && p.status === "Ativo");
    if (!linked) { setNotice("Sua conta precisa estar vinculada a um cadastro funcional ativo para solicitar afastamento."); return; }
    if (leaveForm.end_date < leaveForm.start_date) { setNotice("A data final não pode ser anterior à data inicial."); return; }
    const externalUrl = leaveDocumentUrl.trim();
    if (externalUrl) {
      try {
        const parsed = new URL(externalUrl);
        if (parsed.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(parsed.hostname)) {
          setNotice("Informe um link HTTPS válido do Google Drive ou Google Docs."); return;
        }
      } catch { setNotice("O link informado não é válido."); return; }
    }
    if (leaveDocument) {
      const allowed = ["application/pdf", "image/jpeg", "image/png"];
      if (!allowed.includes(leaveDocument.type)) { setNotice("Formato não permitido. Envie PDF, JPG ou PNG."); return; }
      if (leaveDocument.size > 10 * 1024 * 1024) { setNotice("O arquivo excede o limite de 10 MB."); return; }
    }
    let uploadedPath: string | null = null;
    if (leaveDocument) {
      const safeName = leaveDocument.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
      uploadedPath = `${session.user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("leave-documents").upload(uploadedPath, leaveDocument, { contentType: leaveDocument.type, upsert: false });
      if (uploadError) { setNotice(`Não foi possível anexar o documento: ${uploadError.message}`); return; }
    }
    const { error } = await supabase.from("leave_requests").insert({
      personnel_id: linked.id, requester_profile_id: session.user.id,
      request_type: leaveForm.request_type, start_date: leaveForm.start_date,
      end_date: leaveForm.end_date, requester_note: leaveForm.requester_note.trim() || null,
      document_path: uploadedPath, document_name: leaveDocument?.name || null,
      document_mime_type: leaveDocument?.type || null, external_document_url: externalUrl || null
    });
    if (error && uploadedPath) await supabase.storage.from("leave-documents").remove([uploadedPath]);
    setNotice(error ? `Não foi possível enviar a solicitação: ${error.message}` : "Solicitação enviada para análise administrativa.");
    if (!error) { setLeaveForm({ request_type:"Ferias", start_date:dateToday(), end_date:dateToday(), requester_note:"" }); setLeaveDocument(null); setLeaveDocumentUrl(""); await refresh(); }
  }

  async function openLeaveDocument(request: LeaveRequest, download = false) {
    if (!supabase || !request.document_path) return;
    setDocumentBusy(request.id);
    const { data, error } = await supabase.storage.from("leave-documents").createSignedUrl(request.document_path, 60, download ? { download: request.document_name || true } : undefined);
    setDocumentBusy(null);
    if (error || !data?.signedUrl) { setNotice(`Não foi possível acessar o documento: ${error?.message || "link indisponível"}`); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function updateLeaveRequest(id: string) {
    if (!supabase || profile?.role !== "admin") return;
    const values = leaveEdit[id];
    if (!values) return;
    const { error } = await supabase.from("leave_requests").update({
      status: values.status, sei_process_number: values.sei_process_number.trim() || null,
      sei_status: values.sei_status.trim() || null, administrative_note: values.administrative_note.trim() || null,
      decision_note: values.decision_note.trim() || null,
      reviewed_by: session.user.id, reviewed_at: new Date().toISOString()
    }).eq("id", id);
    setNotice(error ? `Não foi possível atualizar a solicitação: ${error.message}` : "Solicitação atualizada.");
    if (!error) await refresh();
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
    ...(profile.role === "admin" ? [{id:"personnel" as Tab,label:"Gestão de Pessoal",icon:Users}] : []),
    {id:"instructors",label:profile.role === "admin" ? "Disponibilidade dos instrutores" : "Minha disponibilidade",icon:CalendarDays},
    {id:"leave",label:"Férias, licenças e afastamentos",icon:ClipboardList},
    ...(profile.role === "admin" ? [{id:"vehicles" as Tab,label:"Gestão de Viaturas",icon:Car}] : []),
    {id:"vehicleUsage" as Tab,label:"Histórico de utilização",icon:ClipboardList},
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
          {profile.role === "admin" && <Stat label="Policiais cadastrados" value={personnel.length} icon={Users} onClick={() => setTab("personnel")}/>}
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
      {tab==="personnel" && profile.role==="admin" && <section>
        <div className="section-head"><div><h2>Cadastro do efetivo</h2><p>Gerencie os registros funcionais e vincule cada policial a uma conta de acesso, quando houver.</p></div><span className="count">{personnel.length} registros</span></div>
        <div className="two-col">
          <form className="panel form" onSubmit={savePersonnel}>
            <h3><Plus size={18}/>{editingPersonnel ? "Editar cadastro funcional" : "Novo policial"}</h3>
            <Field label="Nome completo"><input required value={personnelForm.full_name} onChange={e=>setPersonnelForm({...personnelForm,full_name:e.target.value})} placeholder="Nome fictício completo"/></Field>
            <div className="form-row">
              <Field label="Nome de guerra"><input value={personnelForm.war_name} onChange={e=>setPersonnelForm({...personnelForm,war_name:e.target.value})}/></Field>
              <Field label="Matrícula fictícia"><input value={personnelForm.service_number} onChange={e=>setPersonnelForm({...personnelForm,service_number:e.target.value})}/></Field>
            </div>
            <div className="form-row">
              <Field label="Posto/graduação"><input required value={personnelForm.rank} onChange={e=>setPersonnelForm({...personnelForm,rank:e.target.value})} placeholder="Ex.: 2º Sargento"/></Field>
              <Field label="Quadro"><input value={personnelForm.career_track} onChange={e=>setPersonnelForm({...personnelForm,career_track:e.target.value})} placeholder="Ex.: QPPMC"/></Field>
            </div>
            <div className="form-row">
              <Field label="Função"><input value={personnelForm.function_name} onChange={e=>setPersonnelForm({...personnelForm,function_name:e.target.value})} placeholder="Função administrativa"/></Field>
              <Field label="Setor/lotação"><input required value={personnelForm.sector} onChange={e=>setPersonnelForm({...personnelForm,sector:e.target.value})}/></Field>
            </div>
            <div className="form-row">
              <Field label="Situação funcional"><select value={personnelForm.status} onChange={e=>setPersonnelForm({...personnelForm,status:e.target.value as Personnel["status"]})}><option>Ativo</option><option>Afastado</option><option>Agregado</option><option>Inativo</option></select></Field>
              <Field label="Vincular conta de acesso"><select value={personnelForm.linked_profile_id} onChange={e=>setPersonnelForm({...personnelForm,linked_profile_id:e.target.value})}><option value="">Sem vínculo</option>{users.map(u=><option key={u.id} value={u.id}>{u.full_name || u.email || "Usuário"} ({u.role==="admin"?"Administrador":"Instrutor"})</option>)}</select></Field>
            </div>
            <Field label="Observações"><textarea value={personnelForm.notes} onChange={e=>setPersonnelForm({...personnelForm,notes:e.target.value})} placeholder="Somente informações fictícias para a PoC."/></Field>
            <div className="actions"><button className="primary" type="submit">{editingPersonnel ? "Salvar alterações" : "Cadastrar policial"}</button>{editingPersonnel && <button type="button" className="small-secondary" onClick={resetPersonnelForm}>Cancelar edição</button>}</div>
            <p className="muted small-note">Use exclusivamente dados fictícios nesta prova de conceito.</p>
          </form>
          <div className="panel">
            <div className="users-heading"><div><h3>Efetivo cadastrado</h3><p>Pesquise por nome, nome de guerra, matrícula ou posto/graduação.</p></div></div>
            <Field label="Pesquisar efetivo"><input value={personnelSearch} onChange={e=>setPersonnelSearch(e.target.value)} placeholder="Digite para pesquisar..."/></Field>
            {personnel.filter(p=>[p.full_name,p.war_name,p.service_number,p.rank,p.sector].some(v=>(v||"").toLowerCase().includes(personnelSearch.toLowerCase()))).length===0
              ? <Empty text="Nenhum policial encontrado."/>
              : <div className="records">{personnel.filter(p=>[p.full_name,p.war_name,p.service_number,p.rank,p.sector].some(v=>(v||"").toLowerCase().includes(personnelSearch.toLowerCase()))).map(p=><div className="record" key={p.id}>
                <div className="record-icon"><Users size={18}/></div><div className="record-main"><b>{p.full_name}</b><small>{p.war_name ? `${p.war_name} · ` : ""}{p.rank} · {p.sector}</small><small>{p.service_number || "Sem matrícula"} · {p.status} · {p.linked_profile_id ? "Conta vinculada" : "Sem conta vinculada"}</small>
                <div className="actions"><button type="button" className="small-secondary" onClick={()=>startPersonnelEdit(p)}>Editar</button>{p.status!=="Inativo" && <button type="button" className="small-danger" onClick={()=>deactivatePersonnel(p)}>Inativar</button>}</div></div>
              </div>)}</div>}
          </div>
        </div>
      </section>}
      {tab==="instructors" && <section>
        <div className="section-head"><div><h2>{profile.role === "admin" ? "Disponibilidade e carga de trabalho" : "Minha disponibilidade semanal"}</h2><p>Informe os períodos habituais de disponibilidade. Férias, licenças e afastamentos continuam sendo registrados no módulo próprio.</p></div></div>
        {profile.role === "instructor" ? <>
          <div className="info-panel"><CalendarDays size={19}/><div><b>Agenda semanal</b><p>Marque os dias em que costuma estar disponível e informe a faixa de horário. Esta informação auxilia a distribuição, mas não substitui a confirmação do instrutor.</p></div></div>
          <div className="panel form">
            <div className="table-wrap"><table><thead><tr><th>Dia</th><th>Disponível</th><th>Início</th><th>Término</th><th>Observações</th></tr></thead><tbody>{weekdayNames.map((day,index)=><tr key={day}><td><b>{day}</b></td><td><input aria-label={`Disponível ${day}`} type="checkbox" checked={availabilityDraft[index]?.is_available ?? false} onChange={e=>setAvailabilityDraft({...availabilityDraft,[index]:{...(availabilityDraft[index]||{start_time:"08:00",end_time:"17:00",notes:""}),is_available:e.target.checked}})}/></td><td><input type="time" disabled={!availabilityDraft[index]?.is_available} value={availabilityDraft[index]?.start_time || "08:00"} onChange={e=>setAvailabilityDraft({...availabilityDraft,[index]:{...availabilityDraft[index],start_time:e.target.value}})}/></td><td><input type="time" disabled={!availabilityDraft[index]?.is_available} value={availabilityDraft[index]?.end_time || "17:00"} onChange={e=>setAvailabilityDraft({...availabilityDraft,[index]:{...availabilityDraft[index],end_time:e.target.value}})}/></td><td><input value={availabilityDraft[index]?.notes || ""} onChange={e=>setAvailabilityDraft({...availabilityDraft,[index]:{...availabilityDraft[index],notes:e.target.value}})} placeholder="Opcional"/></td></tr>)}</tbody></table></div>
            <button className="primary" type="button" onClick={saveAvailability}>Salvar minha disponibilidade</button>
          </div>
          <div className="panel"><h3>Ausências e afastamentos</h3><p className="muted">Para registrar férias, licenças ou afastamentos, utilize o módulo “Férias, licenças e afastamentos”. Solicitações deferidas serão consideradas na análise administrativa.</p><button className="small-secondary" onClick={()=>setTab("leave")}>Abrir solicitações</button></div>
        </> : <>
          <div className="stats"><Stat label="Instrutores cadastrados" value={users.filter(u=>u.role==="instructor").length} icon={Users}/><Stat label="Disponíveis hoje" value={users.filter(u=>u.role==="instructor" && personnel.some(p=>p.linked_profile_id===u.id && p.status==="Ativo") && instructorAvailability.some(a=>a.profile_id===u.id && a.weekday===new Date().getDay() && a.is_available) && !leaveRequests.some(l=>personnel.some(p=>p.id===l.personnel_id && p.linked_profile_id===u.id) && l.status==="Deferida" && l.start_date<=dateToday() && l.end_date>=dateToday())).length} icon={CheckCircle2}/><Stat label="Designações em aberto" value={demands.filter(d=>["Aguardando aceite","Aceita"].includes(d.status)).length} icon={ClipboardList}/></div>
          <div className="panel table-panel"><div className="users-heading"><div><h3>Quadro de instrutores</h3><p>Resumo calculado a partir das designações e atividades registradas. A disponibilidade semanal é informativa.</p></div><button className="small-primary" onClick={refresh}><RefreshCw size={13}/> Atualizar</button></div>
            {users.filter(u=>u.role==="instructor").length===0 ? <Empty text="Nenhum instrutor cadastrado."/> : <div className="table-wrap"><table><thead><tr><th>Instrutor</th><th>Situação funcional</th><th>Disponibilidade hoje</th><th>Designações em aberto</th><th>Atividades registradas</th><th>Ausência deferida hoje</th></tr></thead><tbody>{users.filter(u=>u.role==="instructor").map(u=>{const person=personnel.find(p=>p.linked_profile_id===u.id);const day=instructorAvailability.find(a=>a.profile_id===u.id && a.weekday===new Date().getDay());const open=demands.filter(d=>d.assigned_to===u.id && ["Aguardando aceite","Aceita"].includes(d.status)).length;const done=activities.filter(a=>(a as any).instructor_id===u.id).length;const absent=leaveRequests.some(l=>l.personnel_id===person?.id && l.status==="Deferida" && l.start_date<=dateToday() && l.end_date>=dateToday());return <tr key={u.id}><td><b>{u.full_name}</b><small>{person?.rank || "Sem ficha funcional vinculada"}</small></td><td>{person?.status || "Sem cadastro"}</td><td>{absent?"Indisponível · ausência deferida":day?.is_available?`${day.start_time.slice(0,5)} às ${day.end_time.slice(0,5)}`:"Não informado / indisponível"}</td><td>{open}</td><td>{done}</td><td>{absent?"Sim":"Não"}</td></tr>})}</tbody></table></div>}
          </div>
          <div className="panel"><h3>Gestão de ausências</h3><p className="muted">Consulte e analise férias, licenças e afastamentos no módulo específico. Somente pedidos deferidos são tratados como ausência confirmada neste quadro.</p><button className="small-secondary" onClick={()=>setTab("leave")}>Abrir férias, licenças e afastamentos</button></div>
        </>}
      </section>}

      {tab==="leave" && <section>
        <div className="section-head"><div><h2>{profile.role === "admin" ? "Solicitações de férias, licenças e afastamentos" : "Minhas solicitações"}</h2><p>Registre pedidos e acompanhe a análise administrativa e a tramitação.</p></div><span className="count">{leaveRequests.length} registros</span></div>
        <div className="panel form demand-form">
          <h3><Plus size={18}/> Nova solicitação</h3>
          {personnel.some(p=>p.linked_profile_id===session.user.id && p.status==="Ativo") ? <form onSubmit={submitLeaveRequest}>
            <div className="form-row"><Field label="Tipo de solicitação"><select value={leaveForm.request_type} onChange={e=>setLeaveForm({...leaveForm,request_type:e.target.value as LeaveRequest["request_type"]})}><option value="Ferias">Férias</option><option value="Licenca">Licença</option><option value="Afastamento">Afastamento</option></select></Field><Field label="Data inicial"><input type="date" required value={leaveForm.start_date} onChange={e=>setLeaveForm({...leaveForm,start_date:e.target.value})}/></Field><Field label="Data final"><input type="date" required min={leaveForm.start_date} value={leaveForm.end_date} onChange={e=>setLeaveForm({...leaveForm,end_date:e.target.value})}/></Field></div>
            <Field label="Observação do solicitante"><textarea value={leaveForm.requester_note} onChange={e=>setLeaveForm({...leaveForm,requester_note:e.target.value})} placeholder="Informações administrativas complementares."/></Field>
            <div className="panel" style={{padding:14,marginTop:8}}>
              <h3>Documentação comprobatória (opcional)</h3>
              <p className="muted">Anexe PDF, JPG ou PNG de até 10 MB. Envie apenas documentos necessários à análise. O acesso será restrito aos perfis autorizados.</p>
              <Field label="Anexar arquivo (PDF, JPG ou PNG)"><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setLeaveDocument(e.target.files?.[0] || null)}/></Field>
              {leaveDocument && <div className="muted"><b>Arquivo selecionado:</b> {leaveDocument.name} ({(leaveDocument.size/1024/1024).toFixed(2)} MB) <button type="button" className="small-secondary" onClick={()=>setLeaveDocument(null)}>Remover arquivo</button></div>}
              <Field label="Ou link do Google Drive (opcional)"><input type="url" value={leaveDocumentUrl} onChange={e=>setLeaveDocumentUrl(e.target.value)} placeholder="https://drive.google.com/..."/></Field>
              <small className="muted">Se usar o link, compartilhe o arquivo apenas com os administradores autorizados. Não utilize acesso público. Se anexar um arquivo, não é necessário informar link.</small>
            </div>
            <button className="primary">Enviar solicitação</button>
          </form> : <div className="info-panel"><AlertCircle size={19}/><div><b>Cadastro funcional ativo necessário</b><p>Para solicitar, sua conta precisa estar vinculada a uma ficha funcional com situação Ativo. Peça ao administrador para conferir o vínculo e a situação.</p></div></div>}
        </div>
        <div className="panel table-panel"><div className="users-heading"><div><h3>{profile.role === "admin" ? "Fila administrativa" : "Histórico de solicitações"}</h3><p>{profile.role === "admin" ? "Analise os pedidos e registre o andamento do processo SEI/GDF." : "Acompanhe a situação dos seus pedidos."}</p></div></div>
          {leaveRequests.length===0 ? <Empty text="Nenhuma solicitação registrada."/> : <div className="table-wrap"><table><thead><tr><th>Policial</th><th>Tipo</th><th>Período</th><th>Situação</th><th>Documentação</th>{profile.role === "admin" && <th>Tramitação e análise</th>}</tr></thead><tbody>{leaveRequests.map(r=><tr key={r.id}><td><b>{r.personnel?.full_name || "Cadastro funcional"}</b><small>{r.personnel?.rank || ""}</small>{r.requester_note && <small>{r.requester_note}</small>}</td><td>{r.request_type}</td><td>{r.start_date} a {r.end_date}</td><td><Status value={r.status}/>{r.sei_process_number && <small>SEI: {r.sei_process_number}</small>}{r.sei_status && <small>{r.sei_status}</small>}{r.decision_note && <small>{r.decision_note}</small>}</td><td>{r.document_path ? <div className="form"><small>{r.document_name || "Arquivo anexado"}</small><button type="button" className="small-secondary" disabled={documentBusy===r.id} onClick={()=>openLeaveDocument(r,false)}>Visualizar</button><button type="button" className="small-secondary" disabled={documentBusy===r.id} onClick={()=>openLeaveDocument(r,true)}>Baixar</button></div> : r.external_document_url ? <a href={r.external_document_url} target="_blank" rel="noreferrer">Abrir link externo</a> : <small>Não apresentado</small>}</td>{profile.role === "admin" && <td><div className="form"><Field label="Situação"><select value={leaveEdit[r.id]?.status || r.status} onChange={e=>setLeaveEdit({...leaveEdit,[r.id]:{...leaveEdit[r.id],status:e.target.value}})}>{["Solicitada","Em analise","Aguardando documentacao","Em tramitacao SEI","Deferida","Indeferida","Cancelada"].map(v=><option key={v}>{v}</option>)}</select></Field><Field label="Número do processo SEI/GDF"><input value={leaveEdit[r.id]?.sei_process_number || ""} onChange={e=>setLeaveEdit({...leaveEdit,[r.id]:{...leaveEdit[r.id],sei_process_number:e.target.value}})} placeholder="Número fictício"/></Field><Field label="Andamento administrativo"><input value={leaveEdit[r.id]?.sei_status || ""} onChange={e=>setLeaveEdit({...leaveEdit,[r.id]:{...leaveEdit[r.id],sei_status:e.target.value}})} placeholder="Ex.: encaminhado para análise"/></Field><Field label="Observação administrativa"><input value={leaveEdit[r.id]?.administrative_note || ""} onChange={e=>setLeaveEdit({...leaveEdit,[r.id]:{...leaveEdit[r.id],administrative_note:e.target.value}})}/></Field><Field label="Fundamentação/observação da decisão"><input value={leaveEdit[r.id]?.decision_note || ""} onChange={e=>setLeaveEdit({...leaveEdit,[r.id]:{...leaveEdit[r.id],decision_note:e.target.value}})}/></Field><button className="small-primary" onClick={()=>updateLeaveRequest(r.id)}>Salvar análise</button></div></td>}</tr>)}</tbody></table></div>}
        </div>
      </section>}

      {tab==="vehicles" && profile.role==="admin" && <section>
        <div className="section-head"><div><h2>Cadastro de viaturas</h2><p>Gerencie a frota vinculada ao PROERD. Utilize somente dados fictícios nesta prova de conceito.</p></div><span className="count">{vehicles.filter(v=>v.status!=="Inativa").length} ativas</span></div>
        <div className="two-col">
          <form className="panel form" onSubmit={saveVehicle}>
            <h3><Plus size={18}/>{editingVehicle ? "Editar viatura" : "Nova viatura"}</h3>
            <div className="form-row">
              <Field label="Número de frota"><input value={vehicleForm.fleet_number} onChange={e=>setVehicleForm({...vehicleForm,fleet_number:e.target.value})} placeholder="Ex.: PROERD-01"/></Field>
              <Field label="Placa fictícia"><input value={vehicleForm.plate} onChange={e=>setVehicleForm({...vehicleForm,plate:e.target.value})} placeholder="Ex.: ABC1D23"/></Field>
            </div>
            <div className="form-row">
              <Field label="Marca"><input value={vehicleForm.make} onChange={e=>setVehicleForm({...vehicleForm,make:e.target.value})} placeholder="Ex.: Chevrolet"/></Field>
              <Field label="Modelo"><input required value={vehicleForm.model} onChange={e=>setVehicleForm({...vehicleForm,model:e.target.value})} placeholder="Ex.: Spin"/></Field>
            </div>
            <div className="form-row">
              <Field label="Ano de fabricação"><input type="number" min="1980" max="2100" value={vehicleForm.manufacture_year} onChange={e=>setVehicleForm({...vehicleForm,manufacture_year:e.target.value})}/></Field>
              <Field label="Ano do modelo"><input type="number" min="1980" max="2100" value={vehicleForm.model_year} onChange={e=>setVehicleForm({...vehicleForm,model_year:e.target.value})}/></Field>
            </div>
            <div className="form-row">
              <Field label="Cor"><input value={vehicleForm.color} onChange={e=>setVehicleForm({...vehicleForm,color:e.target.value})}/></Field>
              <Field label="Quilometragem atual"><input type="number" min="0" step="0.1" value={vehicleForm.current_odometer} onChange={e=>setVehicleForm({...vehicleForm,current_odometer:e.target.value})}/></Field>
            </div>
            <Field label="Situação"><select value={vehicleForm.status} onChange={e=>setVehicleForm({...vehicleForm,status:e.target.value as Vehicle["status"]})}><option value="Disponivel">Disponível</option><option value="Em uso">Em uso</option><option value="Em manutencao">Em manutenção</option><option value="Inativa">Inativa</option></select></Field>
            <Field label="Observações"><textarea value={vehicleForm.notes} onChange={e=>setVehicleForm({...vehicleForm,notes:e.target.value})} placeholder="Informações fictícias para a PoC."/></Field>
            <div className="actions"><button className="primary">{editingVehicle ? "Salvar alterações" : "Cadastrar viatura"}</button>{editingVehicle && <button type="button" className="small-secondary" onClick={resetVehicleForm}>Cancelar edição</button>}</div>
          </form>
          <div className="panel">
            <h3>Frota cadastrada</h3><p className="muted">Pesquise por frota, placa, marca ou modelo.</p>
            <Field label="Pesquisar viaturas"><input value={vehicleSearch} onChange={e=>setVehicleSearch(e.target.value)} placeholder="Digite para pesquisar..."/></Field>
            {vehicles.filter(v=>[v.fleet_number,v.plate,v.make,v.model].some(x=>(x||"").toLowerCase().includes(vehicleSearch.toLowerCase()))).length===0
              ? <Empty text="Nenhuma viatura encontrada."/>
              : <div className="records">{vehicles.filter(v=>[v.fleet_number,v.plate,v.make,v.model].some(x=>(x||"").toLowerCase().includes(vehicleSearch.toLowerCase()))).map(v=><div className="record" key={v.id}>
                <div className="record-icon"><Car size={18}/></div><div className="record-main">
                  <b>{v.fleet_number || "Sem número de frota"} · {v.make ? `${v.make} ` : ""}{v.model}</b>
                  <small>{v.plate || "Sem placa"} · {v.manufacture_year || "Ano não informado"}/{v.model_year || "—"}</small>
                  <small>{Number(v.current_odometer).toLocaleString("pt-BR")} km · <Status value={v.status}/></small>
                  {v.notes && <small>{v.notes}</small>}
                  <div className="actions"><button className="small-secondary" onClick={()=>startVehicleEdit(v)}>Editar</button>{v.status!=="Inativa" && <button className="small-danger" onClick={()=>deactivateVehicle(v)}>Inativar</button>}</div>
                </div>
              </div>)}</div>}
          </div>
        </div>
      </section>}

      {tab==="vehicleUsage" && <section>
        <div className="section-head"><div><h2>Histórico de utilização de viaturas</h2><p>{profile.role==="admin" ? "Gerencie saídas, retornos e registros de toda a equipe." : "Consulte a disponibilidade, registre sua saída e informe o retorno da viatura."} Utilize somente dados fictícios nesta PoC.</p></div><span className="count">{vehicleUsages.length} registros</span></div>
        {profile.role === "instructor" ? <>
          <div className="panel form demand-form">
            <h3><Plus size={18}/> Solicitar pré-reserva de viatura</h3>
            {!personnel.some(p=>p.linked_profile_id===profile.id && p.status==="Ativo") && <p className="notice">Sua conta ainda não está vinculada a um cadastro funcional ativo. Solicite o vínculo ao administrador.</p>}
            <form onSubmit={submitVehicleReservation}>
              <div className="form-row"><Field label="Viatura"><select required value={reservationForm.vehicle_id} onChange={e=>setReservationForm({...reservationForm,vehicle_id:e.target.value})}><option value="">Selecione uma viatura disponível</option>{vehicles.filter(v=>v.status==="Disponivel").map(v=><option key={v.id} value={v.id}>{v.fleet_number || "Sem frota"} · {v.make || ""} {v.model} · {v.plate || "Sem placa"}</option>)}</select></Field><Field label="Destino"><input required value={reservationForm.destination} onChange={e=>setReservationForm({...reservationForm,destination:e.target.value})}/></Field></div>
              <Field label="Finalidade"><input required value={reservationForm.purpose} onChange={e=>setReservationForm({...reservationForm,purpose:e.target.value})}/></Field>
              <div className="form-row"><Field label="Início previsto"><input type="datetime-local" required value={reservationForm.scheduled_start} onChange={e=>setReservationForm({...reservationForm,scheduled_start:e.target.value})}/></Field><Field label="Término previsto"><input type="datetime-local" required min={reservationForm.scheduled_start} value={reservationForm.scheduled_end} onChange={e=>setReservationForm({...reservationForm,scheduled_end:e.target.value})}/></Field></div>
              <Field label="Observação do solicitante"><textarea value={reservationForm.requester_note} onChange={e=>setReservationForm({...reservationForm,requester_note:e.target.value})}/></Field>
              <button className="primary" disabled={!vehicles.some(v=>v.status==="Disponivel") || !personnel.some(p=>p.linked_profile_id===profile.id && p.status==="Ativo")}>Enviar pré-reserva</button>
            </form>
          </div>
          <div className="panel table-panel"><div className="users-heading"><div><h3>Minhas pré-reservas</h3><p>A saída somente poderá ser registrada após autorização administrativa e confirmação do SGPol.</p></div></div>
            {vehicleReservations.length===0 ? <Empty text="Nenhuma pré-reserva registrada."/> : <div className="table-wrap"><table><thead><tr><th>Viatura / período</th><th>Destino / finalidade</th><th>Situação / análise</th><th>Saída autorizada</th></tr></thead><tbody>{vehicleReservations.map(r=><tr key={r.id}>
              <td><b>{r.vehicle?.fleet_number || "Viatura"} · {r.vehicle?.model || ""}</b><small>{new Date(r.scheduled_start).toLocaleString("pt-BR")} a {new Date(r.scheduled_end).toLocaleString("pt-BR")}</small></td>
              <td>{r.destination}<small>{r.purpose}</small>{r.requester_note && <small>{r.requester_note}</small>}</td>
              <td><Status value={r.status}/>{r.administrative_note && <small>Administração: {r.administrative_note}</small>}</td>
              <td>{r.status==="Autorizada" ? <div className="form"><Field label="Data e hora da saída"><input type="datetime-local" value={reservationStartValues[r.id]?.departure_at || dateTimeLocalNow()} onChange={e=>setReservationStartValues({...reservationStartValues,[r.id]:{departure_at:e.target.value,odometer_out:reservationStartValues[r.id]?.odometer_out || String(vehicles.find(v=>v.id===r.vehicle_id)?.current_odometer ?? ""),sgpol_registered:reservationStartValues[r.id]?.sgpol_registered || false,notes:reservationStartValues[r.id]?.notes || ""}})}/></Field><Field label="Quilometragem de saída"><input type="number" min="0" step="0.1" value={reservationStartValues[r.id]?.odometer_out ?? String(vehicles.find(v=>v.id===r.vehicle_id)?.current_odometer ?? "")} onChange={e=>setReservationStartValues({...reservationStartValues,[r.id]:{departure_at:reservationStartValues[r.id]?.departure_at || dateTimeLocalNow(),odometer_out:e.target.value,sgpol_registered:reservationStartValues[r.id]?.sgpol_registered || false,notes:reservationStartValues[r.id]?.notes || ""}})}/></Field><label className="checkline"><input type="checkbox" checked={reservationStartValues[r.id]?.sgpol_registered || false} onChange={e=>setReservationStartValues({...reservationStartValues,[r.id]:{departure_at:reservationStartValues[r.id]?.departure_at || dateTimeLocalNow(),odometer_out:reservationStartValues[r.id]?.odometer_out || String(vehicles.find(v=>v.id===r.vehicle_id)?.current_odometer ?? ""),sgpol_registered:e.target.checked,notes:reservationStartValues[r.id]?.notes || ""}})}/> Confirmo que registrei a viatura no SGPol/PMDF, aba Motorista/Vistoria.</label><Field label="Observações de saída"><input value={reservationStartValues[r.id]?.notes || ""} onChange={e=>setReservationStartValues({...reservationStartValues,[r.id]:{departure_at:reservationStartValues[r.id]?.departure_at || dateTimeLocalNow(),odometer_out:reservationStartValues[r.id]?.odometer_out || String(vehicles.find(v=>v.id===r.vehicle_id)?.current_odometer ?? ""),sgpol_registered:reservationStartValues[r.id]?.sgpol_registered || false,notes:e.target.value}})}/></Field><button className="small-primary" disabled={!reservationStartValues[r.id]?.sgpol_registered} onClick={()=>startReservedVehicleUsage(r.id)}>Registrar saída</button></div> : "—"}</td>
            </tr>)}</tbody></table></div>}
          </div>
        </> : null}
        {profile.role === "admin" && <div className="panel table-panel"><div className="users-heading"><div><h3>Fila de pré-reservas</h3><p>Verifique conflitos e disponibilidade antes de autorizar. O indeferimento exige justificativa.</p></div></div>
          {vehicleReservations.length===0 ? <Empty text="Nenhuma pré-reserva recebida."/> : <div className="table-wrap"><table><thead><tr><th>Solicitante</th><th>Viatura / período</th><th>Destino / finalidade</th><th>Análise administrativa</th></tr></thead><tbody>{vehicleReservations.map(r=><tr key={r.id}><td><b>{r.personnel?.full_name || "Policial"}</b><small>{r.personnel?.rank || ""}</small></td><td><b>{r.vehicle?.fleet_number || "Viatura"} · {r.vehicle?.model || ""}</b><small>{new Date(r.scheduled_start).toLocaleString("pt-BR")} a {new Date(r.scheduled_end).toLocaleString("pt-BR")}</small></td><td>{r.destination}<small>{r.purpose}</small></td><td>{r.status==="Solicitada" ? <div className="form"><Field label="Justificativa / observação"><textarea value={reservationReviewNotes[r.id] || ""} onChange={e=>setReservationReviewNotes({...reservationReviewNotes,[r.id]:e.target.value})}/></Field><div className="actions"><button className="small-primary" onClick={()=>reviewVehicleReservation(r.id,"Autorizada")}>Autorizar</button><button className="small-danger" onClick={()=>reviewVehicleReservation(r.id,"Indeferida")}>Indeferir</button></div></div> : <><Status value={r.status}/>{r.administrative_note && <small>{r.administrative_note}</small>}{r.reviewed_at && <small>Analisada em {new Date(r.reviewed_at).toLocaleString("pt-BR")}</small>}</>}</td></tr>)}</tbody></table></div>}
        </div>}
        <div className="panel table-panel">
          <div className="users-heading"><div><h3>Registros de utilização</h3><p>As utilizações em andamento podem ser finalizadas com os dados de retorno.</p></div></div>
          {vehicleUsages.length===0 ? <Empty text="Nenhuma utilização registrada."/> : <div className="table-wrap"><table><thead><tr><th>Viatura</th><th>Responsável</th><th>Destino / finalidade</th><th>Saída</th><th>Retorno / situação</th><th>Ações</th></tr></thead><tbody>{vehicleUsages.map(u=><tr key={u.id}>
            <td><b>{u.vehicle?.fleet_number || "Sem frota"}</b><small>{u.vehicle?.make || ""} {u.vehicle?.model || ""} · {u.vehicle?.plate || "Sem placa"}</small></td>
            <td><b>{u.personnel?.full_name || "Cadastro funcional"}</b><small>{u.personnel?.rank || ""}</small></td>
            <td>{u.destination}<small>{u.purpose}</small>{u.notes && <small>{u.notes}</small>}</td>
            <td>{new Date(u.departure_at).toLocaleString("pt-BR")}<small>{Number(u.odometer_out).toLocaleString("pt-BR")} km</small></td>
            <td><Status value={u.status}/>{u.return_at && <small>{new Date(u.return_at).toLocaleString("pt-BR")}</small>}{u.odometer_in !== null && <small>{Number(u.odometer_in).toLocaleString("pt-BR")} km</small>}{u.return_notes && <small>Retorno: {u.return_notes}</small>}
              {u.status==="Em andamento" && <div className="form"><Field label="Data e hora do retorno"><input type="datetime-local" value={usageReturnValues[u.id]?.return_at || dateTimeLocalNow()} onChange={e=>setUsageReturnValues({...usageReturnValues,[u.id]:{return_at:e.target.value,odometer_in:usageReturnValues[u.id]?.odometer_in || ""}})}/></Field><Field label="Quilometragem de retorno"><input type="number" min={u.odometer_out} step="0.1" value={usageReturnValues[u.id]?.odometer_in || ""} onChange={e=>setUsageReturnValues({...usageReturnValues,[u.id]:{...usageReturnValues[u.id],return_at:usageReturnValues[u.id]?.return_at || dateTimeLocalNow(),odometer_in:e.target.value}})}/></Field><Field label="Ocorrências / observações do retorno"><input value={usageReturnValues[u.id]?.return_notes || ""} onChange={e=>setUsageReturnValues({...usageReturnValues,[u.id]:{...usageReturnValues[u.id],return_at:usageReturnValues[u.id]?.return_at || dateTimeLocalNow(),odometer_in:usageReturnValues[u.id]?.odometer_in || "",return_notes:e.target.value}})}/></Field></div>}
            </td>
            <td>{u.status==="Em andamento" ? <div className="actions"><button className="small-primary" onClick={()=>finishVehicleUsage(u.id)}>Registrar retorno</button>{profile.role==="admin" && <button className="small-danger" onClick={()=>cancelVehicleUsage(u.id)}>Cancelar</button>}</div> : "—"}</td>
          </tr>)}</tbody></table></div>}
        </div>
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
      <footer>PROERD DIGITAL · PoC 0.7 · Dados fictícios · Não é sistema oficial da PMDF</footer>
    </main>
  </div>;
}

const weekdayNames = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];

function Brand(){return <div className="brand"><div className="brand-mark"><ShieldCheck size={23}/></div><div><b>PROERD DIGITAL</b><small>PLATAFORMA INTEGRADA</small></div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
function Stat({label,value,icon:Icon,onClick,disabled=false}:{label:string;value:number;icon:any;onClick?:()=>void;disabled?:boolean}){return <button type="button" className="stat-card" onClick={onClick} disabled={disabled || !onClick} aria-label={`Abrir ${label}`}><div><span>{label}</span><strong>{value}</strong></div><div className="stat-icon"><Icon size={20}/></div></button>}
function Status({value}:{value:string}){const cls=["Validada","Aceita","Autorizada"].includes(value)?"green":["Devolvida","Indeferida","Cancelada"].includes(value)?"red":["Pendente","Pendente de validação","Solicitada"].includes(value)?"amber":"blue";return <span className={`status ${cls}`}>{value}</span>}
function Empty({text}:{text:string}){return <div className="empty"><ClipboardList size={26}/><span>{text}</span></div>}
function SetupScreen(){return <div className="auth-wrap"><div className="auth-card setup"><Brand/><h1>Configuração inicial</h1><p>O código da aplicação está pronto. Para conectar ao banco de dados, crie o projeto no Supabase e configure as duas variáveis de ambiente.</p><ol><li>Execute o arquivo <code>supabase/migrations/001_initial_schema.sql</code> no SQL Editor do Supabase.</li><li>Copie a URL do projeto e a chave publicável (anon) para um arquivo <code>.env</code>.</li><li>Reinicie a aplicação com <code>npm run dev</code>.</li></ol><p className="muted">Não coloque a chave service_role no frontend, no GitHub ou neste chat.</p><div className="notice">O projeto ainda não está conectado a um banco. Nenhum dado será gravado até concluir esta configuração.</div></div></div>}
