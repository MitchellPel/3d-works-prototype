"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileBox,
  Layers3,
  LogOut,
  Menu,
  Plus,
  UploadCloud,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { AuthPanel } from "@/components/auth-panel";
import { AdminPanel } from "@/components/admin-panel";
import { MeshCanvas } from "@/components/mesh-view";
import { PriceBreakdown } from "@/components/price-breakdown";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import {
  jobColumns,
  jobGuardColumns,
  toJob,
  toInvoice,
  stages,
  productionStages,
  type Job,
  type Invoice,
  type Profile,
  type Stage,
} from "@/lib/app-data";
import { studioWhatsApp, whatsappHrefFor } from "@/lib/studio";
import { scanDefaults, scanServices, scanTotalCents, type ScanKind } from "@/lib/scans";
import logo from "../Workslogo.jpg";
import modelPrint from "../assets/services/model-print.png";
import modelScan from "../assets/services/model-scan.png";
import signagePrint from "../assets/services/signage-print.png";

type Route =
  "home" | "quote" | "tracking" | "board" | "detail" | "admin" | "account";
type Option = { material_type: string; colour: string };
type MachineOption = { id: string; name: string };
type PublicStudio = {
  scan_file_cents: number;
  scan_print_cents: number;
  vat_percent: number;
  whatsapp: string;
};
const money = (value: number) =>
  "R " +
  value.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const dropoffText = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
    : "";
const modelFile = (name: string) => /\.(stl|obj|3mf)$/i.test(name);

async function functionError(error: unknown, fallback = "Calculation failed. Please try again.") {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      return String(body.error ?? body.message ?? fallback);
    } catch { return fallback; }
  }
  return error instanceof Error ? error.message : fallback;
}

function Logo() {
  return (
    <span className="logo">
      <img src={logo.src} alt="3D Craftworx East London" />
    </span>
  );
}

function Model({ small = false }: { small?: boolean }) {
  return (
    <div className={`model${small ? " small" : ""}`}>
      <div className="model-grid" />
      <div className="model-shape">
        <span className="shape-top" />
        <span className="shape-front"><i /><i /></span>
        <span className="shape-side" />
      </div>
      {!small && <span className="model-axis">X <b>Y</b> Z</span>}
    </div>
  );
}

export default function Home() {
  const supabase = getSupabase();
  const [route, setRoute] = useState<Route>("quote");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [staffOptions, setStaffOptions] = useState<Profile[]>([]);
  const [machineOptions, setMachineOptions] = useState<MachineOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [material, setMaterial] = useState("");
  const [colour, setColour] = useState("");
  const [quality, setQuality] = useState("Standard · 0.20 mm");
  const [infill, setInfill] = useState(20);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [offer, setOffer] = useState<"choose" | "print" | "scan" | "signage">("choose");
  const [scanKind, setScanKind] = useState<ScanKind>("scan-file");
  const [scanPhoto, setScanPhoto] = useState<File | null>(null);
  const [scanDay, setScanDay] = useState("");
  const [scanTime, setScanTime] = useState("");
  const [publicStudio, setPublicStudio] = useState<PublicStudio | null>(null);
  const [companyInvoice, setCompanyInvoice] = useState(false);
  const [bill, setBill] = useState({ company: "", address: "", vat: "", registration: "", email: "", po: "" });
  const [invoiceId, setInvoiceId] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [assignedStaffId, setAssignedStaffId] = useState("");
  const [assignedMachineId, setAssignedMachineId] = useState("");
  const [editMaterial, setEditMaterial] = useState("");
  const [editColour, setEditColour] = useState("");
  const [editQuality, setEditQuality] = useState("");
  const [editInfill, setEditInfill] = useState(20);
  const [editQty, setEditQty] = useState(1);
  const [progress, setProgress] = useState(0);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [menu, setMenu] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const isStaff =
    profile?.active && (profile.role === "staff" || profile.role === "admin");
  const materialTypes = useMemo(
    () => [...new Set(options.map((o) => o.material_type))],
    [options],
  );
  const chosenMaterial = materialTypes.includes(material)
    ? material
    : (materialTypes[0] ?? "");
  const colours = useMemo(
    () =>
      options
        .filter((o) => o.material_type === chosenMaterial)
        .map((o) => o.colour),
    [options, chosenMaterial],
  );
  const chosenColour = colours.includes(colour) ? colour : (colours[0] ?? "");
  const visibleJobs = jobs.filter((job) => job.archived === showArchived);
  const customerJobs = visibleJobs.filter((job) => job.customerId === user?.id);
  const selectableJobs = route === "tracking" ? customerJobs : visibleJobs;
  const selected = selectableJobs.find((job) => job.id === selectedId) ?? selectableJobs[0];

  const load = useCallback(async () => {
    if (!supabase) return;
    const studio = await supabase.rpc("studio_public");
    if (!studio.error && studio.data) setPublicStudio(studio.data as PublicStudio);
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUser = sessionData.session?.user ?? null;
    setUser(currentUser);
    if (!currentUser) {
      setProfile(null);
      setJobs([]);
      return;
    }
    const [profileResult, firstJobs] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", currentUser.id).single(),
      supabase
        .from("jobs")
        .select(`${jobColumns},${jobGuardColumns}`)
        .order("created_at", { ascending: false }),
    ]);
    const jobsResult = firstJobs.error && /geometry_guess|paid_at|guess_accepted_at|kind|dropoff_at|bill_company/.test(firstJobs.error.message)
      ? await supabase.from("jobs").select(jobColumns).order("created_at", { ascending: false })
      : firstJobs;
    if (profileResult.error) setMessage(profileResult.error.message);
    if (profileResult.error) setMessage(profileResult.error.message);
    else setProfile(profileResult.data as Profile);
    if (profileResult.data?.active && ["staff", "admin"].includes(profileResult.data.role)) {
      const [people, machines] = await Promise.all([
        supabase.from("profiles").select("id,display_name,role,active").in("role", ["staff", "admin"]).eq("active", true),
        supabase.rpc("list_active_machine_names"),
      ]);
      if (people.error || machines.error)
        setMessage(people.error?.message ?? machines.error?.message ?? "Could not load assignments");
      else {
        setStaffOptions((people.data ?? []) as Profile[]);
        setMachineOptions((machines.data ?? []) as MachineOption[]);
      }
    } else {
      setStaffOptions([]);
      setMachineOptions([]);
    }
    if (jobsResult.error) {
      setMessage(jobsResult.error.message);
      return;
    }
    let rows = jobsResult.data ?? [];
    if (profileResult.data?.active && ["staff", "admin"].includes(profileResult.data.role)) {
      const summaries = await supabase.rpc("staff_job_summaries");
      if (!summaries.error) {
        const byId = new Map(
          ((summaries.data ?? []) as { id: string; pricing_summary: unknown }[]).map((row) => [row.id, row.pricing_summary]),
        );
        rows = rows.map((row) => ({
          ...row,
          pricing_summary: byId.get(row.id) ?? null,
        }));
      }
    }
    const events = rows.length
      ? await supabase
          .from("job_events")
          .select("job_id,message,created_at")
          .in(
            "job_id",
            rows.map((row) => row.id),
          )
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (events.error) setMessage(events.error.message);
    const converted = rows.map((row) =>
      toJob(
        row,
        (events.data ?? [])
          .filter((event) => event.job_id === row.id)
          .map((event) => event.message),
      ),
    );
    if (converted.length) {
      const invoices = await supabase
        .from("invoices")
        .select("job_id,invoice_number,issued_at,heading,studio,buyer,description,ex_vat_cents,vat_percent,vat_cents,total_cents")
        .in("job_id", converted.map((job) => job.id));
      if (!invoices.error) {
        const byJob = new Map((invoices.data ?? []).map((row) => [String(row.job_id), toInvoice(row)]));
        for (const job of converted) job.invoice = byJob.get(job.id) ?? null;
      }
    }
    setJobs(converted);
    setSelectedId((current) =>
      current && converted.some((job) => job.id === current)
        ? current
        : (converted.find((job) => job.customerId === currentUser.id)?.id ??
          converted[0]?.id ??
          ""),
    );
  }, [supabase]);

  useEffect(() => {
    if (!selected) return;
    setCompanyInvoice(Boolean(selected.billCompany));
    setBill({
      company: selected.billCompany,
      address: selected.billAddress,
      vat: selected.billVat,
      registration: selected.billRegistration,
      email: selected.billEmail,
      po: selected.billPo,
    });
  }, [selected?.id]);

  useEffect(() => {
    const valid: Route[] = [
      "home",
      "quote",
      "tracking",
      "board",
      "detail",
      "admin",
      "account",
    ];
    const syncRoute = () => {
      const hash = location.hash.slice(1) as Route;
      setRoute(valid.includes(hash) ? hash : "quote");
    };
    syncRoute();
    if (new URLSearchParams(location.search).has("invite")) {
      setTimeout(() => {
        setRecovery(true);
        location.hash = "account";
      }, 0);
    }
    window.addEventListener("hashchange", syncRoute);
    if (!supabase)
      return () => window.removeEventListener("hashchange", syncRoute);
    const initialLoad = setTimeout(() => {
      void load();
    }, 0);
    void supabase.rpc("list_material_options").then(({ data, error }) => {
      if (error) setMessage(error.message);
      else setOptions((data ?? []) as Option[]);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        location.hash = "account";
      }
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED"
      )
        setTimeout(() => {
          void load();
        }, 0);
    });
    return () => {
      clearTimeout(initialLoad);
      window.removeEventListener("hashchange", syncRoute);
      listener.subscription.unsubscribe();
    };
  }, [load, supabase]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setStaffNote(selected?.note ?? "");
      setAssignedStaffId(selected?.assignedStaffId ?? "");
      setAssignedMachineId(selected?.assignedMachineId ?? "");
      setEditMaterial(selected?.material ?? "");
      setEditColour(selected?.colour ?? "");
      setEditQuality(selected?.quality ?? "Standard · 0.20 mm");
      setEditInfill(selected?.infill ?? 20);
      setEditQty(selected?.qty ?? 1);
      setProgress(selected?.progress ?? 0);
      setDue(
        selected?.due && selected.due !== "To be confirmed" ? selected.due : "",
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [selected?.id, selected?.note, selected?.progress, selected?.due,
    selected?.assignedStaffId, selected?.assignedMachineId,
    selected?.material, selected?.colour, selected?.quality,
    selected?.infill, selected?.qty]);

  function go(next: Route) {
    location.hash = next;
    setRoute(next);
    setMenu(false);
    setMessage("");
    window.scrollTo(0, 0);
  }
  function pick(next: File | undefined) {
    if (!next) return;
    if (!modelFile(next.name)) {
      setMessage("Choose an STL, OBJ, or 3MF model file.");
      return;
    }
    if (next.size > 50 * 1024 * 1024) {
      setMessage("The model must be under 50 MB.");
      return;
    }
    setFile(next);
    setBuffer(null);
    setPreviewError(false);
    void next
      .arrayBuffer()
      .then(setBuffer)
      .catch(() => {
        setPreviewError(true);
        setMessage("Could not preview the file. You can still submit it for pricing.");
      });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !user) {
      go("account");
      return;
    }
    if (!profile?.active || !file || !chosenMaterial || !chosenColour) {
      setMessage("Choose a model, material, and colour.");
      return;
    }
    setBusy(true);
    setMessage("");
    let path = "";
    let saved = false;
    try {
      path = `${user.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const upload = await supabase.storage.from("models").upload(path, file, {
        contentType: "application/octet-stream",
        upsert: false,
      });
      if (upload.error) throw upload.error;
      const created = await supabase
        .from("jobs")
        .insert({
          customer_id: user.id,
          customer_name: profile.display_name || user.email || "Customer",
          customer_email: user.email,
          file_path: path,
          file_name: file.name,
          material: chosenMaterial,
          colour: chosenColour,
          quality,
          infill,
          qty,
          customer_note: note.trim(),
        })
        .select("id")
        .single();
      if (created.error || !created.data)
        throw created.error ?? new Error("Could not create order");
      saved = true;
      setShowArchived(false);
      setSelectedId(created.data.id);
      const quote = await supabase.functions.invoke("estimate-quote", {
        body: { jobId: created.data.id },
      });
      await load();
      setFile(null);
      setBuffer(null);
      setNote("");
      go("tracking");
      if (quote.error || quote.data?.error)
        setMessage(
          "Request saved. Automatic pricing is pending: " +
            (quote.data?.error ?? await functionError(quote.error)),
        );
      else if (quote.data?.provisional)
        setMessage(
          "Your sample estimate is ready. Checkout opens after the studio approves its pricing settings.",
        );
      else
        setMessage(
          "Your automatic estimate is ready. Review it before confirming the order.",
        );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not submit the request.",
      );
      if (path && !saved) await supabase.storage.from("models").remove([path]);
    } finally {
      setBusy(false);
    }
  }

  async function submitScan(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !user) {
      go("account");
      return;
    }
    if (!profile?.active || !scanDay || !scanTime) {
      setMessage("Choose the day and time you will drop the object off.");
      return;
    }
    const dropoff = new Date(`${scanDay}T${scanTime}`);
    if (Number.isNaN(dropoff.getTime()) || dropoff.getTime() <= Date.now()) {
      setMessage("Choose a drop-off day and time in the future.");
      return;
    }
    if (scanPhoto && !/^image\/(jpeg|png|webp|gif)$/.test(scanPhoto.type)) {
      setMessage("Use a JPG, PNG, or WebP photo.");
      return;
    }
    if (scanPhoto && scanPhoto.size > 15 * 1024 * 1024) {
      setMessage("The photo must be under 15 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    let path: string | null = null;
    try {
      if (scanPhoto) {
        path = `${user.id}/${crypto.randomUUID()}/${scanPhoto.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const upload = await supabase.storage.from("models").upload(path, scanPhoto, {
          contentType: scanPhoto.type || "image/jpeg",
          upsert: false,
        });
        if (upload.error) throw upload.error;
      }
      const placed = await supabase.rpc("place_scan_order", {
        kind: scanKind,
        dropoff: dropoff.toISOString(),
        picture_path: path,
        picture_name: scanPhoto?.name ?? "",
        note: note.trim(),
      });
      if (placed.error) throw placed.error;
      await load();
      setScanPhoto(null);
      setNote("");
      go("tracking");
      const total = typeof placed.data === "number" ? placed.data / 100 : null;
      const chosen = scanServices.find((item) => item.kind === scanKind);
      setMessage(
        total === null
          ? "Scan order placed."
          : `${chosen?.label ?? "Scan"} placed at ${money(total)} including VAT.`,
      );
    } catch (error) {
      if (path) await supabase.storage.from("models").remove([path]);
      setMessage(error instanceof Error ? error.message : "Could not place the scan order.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(job: Job) {
    if (
      !supabase ||
      job.price === null ||
      job.status !== "Quoted" ||
      job.pricingProvisional ||
      (job.geometryGuess && !job.guessAccepted)
    )
      return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("approve_quote", {
      target_job_id: job.id,
    });
    if (error) setMessage(error.message);
    else {
      await load();
      setMessage("Order placed at the displayed price. The studio can now arrange payment and production.");
    }
    setBusy(false);
  }
  async function acceptGuess(job: Job) {
    if (!supabase || !isStaff) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("accept_volume_guess", { target_job_id: job.id });
    if (error) setMessage(error.message);
    else {
      await load();
      setMessage("Volume estimate accepted. The customer can place the order.");
    }
    setBusy(false);
  }
  async function setPaid(job: Job, paid: boolean) {
    if (!supabase || !isStaff) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("set_job_paid", { target_job_id: job.id, paid });
    if (error) setMessage(error.message);
    else {
      await load();
      setMessage(paid ? "Marked paid. The invoice is ready to print." : job.invoice ? "Marked unpaid. The invoice already issued stays on the order." : "Marked unpaid.");
    }
    setBusy(false);
  }
  async function saveBilling(job: Job) {
    if (!supabase) return;
    if (companyInvoice && !bill.company.trim()) {
      setMessage("Enter the company name for the invoice.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("save_order_billing", {
      target_job_id: job.id,
      company: companyInvoice ? bill.company : "",
      address: companyInvoice ? bill.address : "",
      vat: companyInvoice ? bill.vat : "",
      registration: companyInvoice ? bill.registration : "",
      accounts_email: companyInvoice ? bill.email : "",
      po: companyInvoice ? bill.po : "",
    });
    if (error) setMessage(error.message);
    else {
      await load();
      setMessage("Invoice details saved.");
    }
    setBusy(false);
  }
  async function refreshEstimate(job: Job) {
    if (
      !supabase ||
      job.customerId !== user?.id ||
      !["Submitted", "Quoted"].includes(job.status)
    )
      return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("estimate-quote", {
      body: { jobId: job.id },
    });
    await load();
    setMessage(
      error
        ? await functionError(error)
        : data?.error
          ? String(data.error)
          : data?.provisional
            ? "Sample estimate refreshed. The studio must approve pricing before checkout."
            : "Estimate refreshed. Review the amount before confirming.",
    );
    setBusy(false);
  }
  async function cancelOrder(job: Job) {
    if (!supabase || !window.confirm(`Cancel ${job.code}? You can archive it afterwards to remove it from the active list.`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("cancel_order", { target_job_id: job.id });
      if (error) throw error;
      await load();
      setMessage("Order cancelled. You can now archive it.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String((error as {message?: string})?.message ?? "Could not cancel order")); }
    finally { setBusy(false); }
  }
  async function archiveOrder(job: Job) {
    if (!supabase) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_order_archived", { target_job_id: job.id, archive: !job.archived });
      if (error) throw error;
      await load();
      setSelectedId("");
      if (route === "detail") go("board");
      setMessage(job.archived ? "Order restored to the active list." : "Order archived. Open Archived orders to restore it.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String((error as {message?: string})?.message ?? "Could not archive order")); }
    finally { setBusy(false); }
  }
  async function saveJob(job: Job, nextStage: Stage) {
    if (!supabase || !isStaff) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("jobs")
      .update({
        status: nextStage,
        progress: Number(progress),
        due_date: due || null,
        staff_note: staffNote.trim(),
        assigned_staff_id: assignedStaffId || null,
        assigned_machine_id: assignedMachineId || null,
      })
      .eq("id", job.id).select("id").single();
    if (error) setMessage(error.message);
    else {
      await load();
      setMessage("Job updated.");
    }
    setBusy(false);
  }
  async function saveOrderDetails(job: Job) {
    if (!supabase || !isStaff || !["Submitted", "Quoted"].includes(job.status)) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("staff_update_unconfirmed_order", {
      target_job_id: job.id,
      next_material: editMaterial,
      next_colour: editColour,
      next_quality: editQuality,
      next_infill: editInfill,
      next_qty: editQty,
    });
    if (error) {
      setMessage(error.message);
    } else {
      const quote = await supabase.functions.invoke("estimate-quote", {
        body: { jobId: job.id },
      });
      await load();
      setMessage(quote.error || quote.data?.error
        ? `Order updated. Repricing failed: ${quote.data?.error ?? await functionError(quote.error)}`
        : "Order updated and repriced. The customer can review the new price.");
    }
    setBusy(false);
  }
  async function download(job: Job) {
    if (!supabase) return;
    const { data, error } = await supabase.storage
      .from("models")
      .download(job.filePath);
    if (error || !data) {
      setMessage(error?.message ?? "Could not download file.");
      return;
    }
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = job.file;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    go("home");
  }

  const nav = (
    <>
      <button
        className={route === "home" ? "active" : ""}
        onClick={() => go("home")}
      >
        Home
      </button>
      <button
        className={route === "quote" ? "active" : ""}
        onClick={() => go("quote")}
      >
        Get an estimate
      </button>
      {user && (
        <button
          className={route === "tracking" ? "active" : ""}
          onClick={() => go("tracking")}
        >
          My orders
        </button>
      )}
      {isStaff && (
        <button
          className={route === "board" ? "active" : ""}
          onClick={() => go("board")}
        >
          Staff workspace
        </button>
      )}
      {profile?.role === "admin" && (
        <button
          className={route === "admin" ? "active" : ""}
          onClick={() => go("admin")}
        >
          Admin
        </button>
      )}
    </>
  );
  function billingFields(job: Job) {
    if (job.status === "Cancelled") return null;
    if (job.invoice) {
      const buyer = job.invoice.buyer;
      return (
        <div className="bill-saved">
          <p>
            {buyer.company ? `Company invoice · ${buyer.company}` : "Personal invoice"} · {job.invoice.number}
          </p>
          <button className="btn outline" type="button" onClick={() => setInvoiceId(job.id)}>View invoice</button>
        </div>
      );
    }
    return (
      <div className="bill-form">
        <p>Company details are printed on the invoice when the order is marked paid.</p>
        <label className="bill-check">
          <input type="checkbox" checked={companyInvoice} onChange={(event) => setCompanyInvoice(event.target.checked)} />
          Company invoice
        </label>
        {companyInvoice && (
          <div className="fields">
            <label className="wide">Company name<input value={bill.company} onChange={(event) => setBill({ ...bill, company: event.target.value })} /></label>
            <label className="wide">Billing address<textarea rows={2} value={bill.address} onChange={(event) => setBill({ ...bill, address: event.target.value })} /></label>
            <label>VAT number<input value={bill.vat} onChange={(event) => setBill({ ...bill, vat: event.target.value })} /></label>
            <label>Registration number<input value={bill.registration} onChange={(event) => setBill({ ...bill, registration: event.target.value })} /></label>
            <label>Accounts email<input type="email" value={bill.email} onChange={(event) => setBill({ ...bill, email: event.target.value })} /></label>
            <label>Purchase order<input value={bill.po} onChange={(event) => setBill({ ...bill, po: event.target.value })} /></label>
          </div>
        )}
        <button className="btn outline" type="button" disabled={busy} onClick={() => saveBilling(job)}>Save company details</button>
      </div>
    );
  }
  const studioNumber = publicStudio ? publicStudio.whatsapp : studioWhatsApp;
  const whatsappHref = whatsappHrefFor(studioNumber, "Hi, I would like to ask about a 3D print.");
  const signageWhatsAppHref = whatsappHrefFor(studioNumber, "Hi, I would like a quote for signage or print.");
  const scanVat = Number(publicStudio?.vat_percent ?? 15);
  const scanExVat = (kind: ScanKind) =>
    publicStudio
      ? Number(kind === "scan-file" ? publicStudio.scan_file_cents : publicStudio.scan_print_cents)
      : scanDefaults[kind];
  return (
    <div className="app">
      <a
        className="whatsapp-fab"
        href={whatsappHref || undefined}
        target={whatsappHref ? "_blank" : undefined}
        rel={whatsappHref ? "noreferrer" : undefined}
        aria-disabled={whatsappHref ? undefined : true}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M20.5 3.5A11 11 0 0 0 2.1 17.8L1 23l5.4-1.1A11 11 0 0 0 20.5 3.5zm-8.5 17a9.1 9.1 0 0 1-4.6-1.3l-.3-.2-3.2.8.8-3.1-.2-.3A9.1 9.1 0 0 1 12 20.5zm5-6.8c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.6.1a7.4 7.4 0 0 1-2.2-1.4 8.2 8.2 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6l.4-.4.2-.4a.5.5 0 0 0 0-.5c-.1-.1-.6-1.4-.8-1.9s-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.6 4c.5.2 1 .4 1.5.5a3.6 3.6 0 0 0 1.7.1 2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.3c-.1-.2-.3-.2-.6-.4z"/></svg>
        WhatsApp
      </a>
      <header className="public-header">
        <div className="wrap header-in">
          <button className="plain" onClick={() => go("home")}>
            <Logo />
          </button>
          <nav>{nav}</nav>
          <div className="header-end">
            {user ? (
              <button className="btn outline" onClick={signOut}>
                <LogOut size={15} /> Sign out
              </button>
            ) : (
              <button className="btn outline" onClick={() => go("account")}>
                Sign in <ArrowUpRight size={15} />
              </button>
            )}
            <button className="btn" onClick={() => go("quote")}>
              Get an estimate <ArrowRight size={16} />
            </button>
          </div>
          <button
            className="mobile-menu plain"
            aria-label="Open menu"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
        {menu && (
          <nav className="mobile-nav">
            {nav}
            {user ? (
              <button onClick={signOut}>Sign out</button>
            ) : (
              <button onClick={() => go("account")}>Sign in</button>
            )}
          </nav>
        )}
      </header>
      {message && (
        <div className="site-message wrap" role="status">
          {message}
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {route === "home" && (
        <main>
          <section className="hero">
            <div className="wrap hero-grid">
              <div className="hero-copy">
                <span className="eyebrow">MADE REAL, LAYER BY LAYER</span>
                <h1>
                  3D Printing
                  <br />
                  <em>Services.</em>
                </h1>
                <p>
                  From one-off prototypes to useful parts. Upload your 3D model,
                  see an automatic estimate, and follow your order through
                  production.
                </p>
                <div className="hero-actions">
                  <button className="btn" onClick={() => go("quote")}>
                    Start a project <ArrowRight size={17} />
                  </button>
                  <button
                    className="btn outline"
                    onClick={() => go("tracking")}
                  >
                    Track an order <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="hero-proof">
                  <span className="avatars"><i>MP</i><i>DN</i><i>AJ</i></span>
                  <span>For makers, studios &amp; businesses<br /><b>built with care, every time.</b></span>
                </div>
              </div>
              <div className="hero-art">
                <div className="art-top">
                  <span>3D CRAFTWORX / PRINT STUDIO</span>
                  <span>01 — 04</span>
                </div>
                <Model />
                <div className="art-bottom">
                  <span>
                    <b>Make it possible.</b>
                    <small>Custom parts. Thoughtful results.</small>
                  </span>
                  <span className="circle-arrow">
                    <ArrowUpRight />
                  </span>
                </div>
              </div>
            </div>
            <div className="wrap hero-benefits">
              <div><span>✦</span><b>High quality prints</b><small>Careful results for every project</small></div>
              <div><span>⬡</span><b>Wide material range</b><small>From prototypes to end-use parts</small></div>
              <div><span>▣</span><b>Fast turnaround</b><small>Get your parts sooner</small></div>
              <div><span>✓</span><b>Real human support</b><small>Help from the studio team</small></div>
            </div>
            <div className="wrap hero-bottom">
              <span>DESIGNED TO FIT YOUR IDEA</span>
              <span>01 / UPLOAD &nbsp;&nbsp; 02 / ESTIMATE &nbsp;&nbsp; 03 / PRINT</span>
              <span>SCROLL TO EXPLORE ↓</span>
            </div>
          </section>
          <section className="section light">
            <div className="wrap">
              <div className="section-head">
                <div>
                  <span className="overline">THE PROCESS</span>
                  <h2>Simple from the first file.</h2>
                </div>
                <p>
                  Your account keeps every project, model, estimate and status
                  update in one place.
                </p>
              </div>
              <div className="steps">
                {[
                  [
                    "01",
                    <UploadCloud key="upload" />,
                    "Share your design",
                    "Upload an STL, OBJ or 3MF and choose your material.",
                  ],
                  [
                    "02",
                    <Layers3 key="layers" />,
                    "See your estimate",
                    "Our pricing service calculates from model geometry and current cost settings.",
                  ],
                  [
                    "03",
                    <Check key="check" />,
                    "Confirm your order",
                    "Review the estimate at checkout and confirm when you are ready.",
                  ],
                ].map(([number, icon, title, body]) => (
                  <div className="step" key={String(number)}>
                    <div>
                      <span>{number} / 03</span>
                      <span className="step-icon">{icon}</span>
                    </div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="section capabilities">
            <div className="wrap cap-grid">
              <div>
                <span className="overline">WHAT WE MAKE</span>
                <h2>
                  Useful objects.
                  <br />
                  <em>Made beautifully.</em>
                </h2>
                <p>
                  Prototypes, functional parts and custom pieces for makers,
                  studios and businesses.
                </p>
                <button className="btn outline" onClick={() => go("quote")}>
                  Start your project <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="cap-list">
                {[
                  [
                    "01",
                    "Rapid prototypes",
                    "Test fit and form before you commit.",
                  ],
                  ["02", "Functional parts", "Bring a useful design to life."],
                  ["03", "Custom pieces", "Make something distinctly yours."],
                ].map((item) => (
                  <div className="cap-row" key={item[0]}>
                    <span>{item[0]}</span>
                    <div>
                      <h3>{item[1]}</h3>
                      <p>{item[2]}</p>
                    </div>
                    <ArrowUpRight />
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="section materials light">
            <div className="wrap">
              <div className="section-head">
                <div><span className="overline">MATERIALS &amp; FINISH</span><h2>Made for the job.</h2></div>
                <p>Choose the right balance of detail, durability and finish. We&apos;ll help if you&apos;re unsure.</p>
              </div>
              <div className="material-grid">
                {[
                  ["PLA", "EVERYDAY VERSATILITY", "Great for visual prototypes, display pieces and quick iterations."],
                  ["PETG", "BUILT TO LAST", "Strong, reliable parts with a little more flexibility and resilience."],
                  ["ASA", "OUTDOOR READY", "Durable performance for demanding and outdoor applications."],
                ].map((item, index) => <div className="material-card" key={item[0]}>
                  <div className={`swatch swatch-${index}`} /><span>{item[1]}</span><h3>{item[0]}</h3><p>{item[2]}</p>
                </div>)}
              </div>
            </div>
          </section>
          <section className="section examples">
            <div className="wrap">
              <div className="section-head">
                <div><span className="overline">POSSIBILITIES</span><h2>Your idea belongs here.</h2></div>
                <p>Small details, big ideas, and practical fixes. There&apos;s room for all of them.</p>
              </div>
              <div className="example-grid">
                <div className="example"><span>01 / PROTOTYPING</span><div className="example-art"><Model small /></div><h3>Form meets function.</h3><p>Test the shape before you scale.</p></div>
                <div className="example"><span>02 / FUNCTIONAL PARTS</span><div className="example-art rings"><i /><i /><i /></div><h3>Built to solve.</h3><p>Parts that make everyday work easier.</p></div>
                <div className="example"><span>03 / CUSTOM OBJECTS</span><div className="example-art vase"><i /></div><h3>Made for your space.</h3><p>One-off pieces with a point of view.</p></div>
              </div>
            </div>
          </section>
          <section className="section trust light">
            <div className="wrap trust-grid">
              <div><span className="overline">THE 3D CRAFTWORX APPROACH</span><h2>Good work is in<br />the details.</h2></div>
              <div><p>Every model gets a human review before we print. We look at orientation, material, finish and practical use so the final piece feels as good as it looks.</p><div className="trust-points"><span><Check /> Human-reviewed files</span><span><Check /> Clear updates along the way</span><span><Check /> Quality-focused finishing</span></div></div>
            </div>
          </section>
          <section className="cta">
            <div className="wrap cta-grid">
              <div>
                <span className="overline">LET&apos;S MAKE IT HAPPEN</span>
                <h2>Have a file in mind?</h2>
                <p>Create an account and request your estimate.</p>
              </div>
              <button className="btn" onClick={() => go("quote")}>
                Get started <ArrowRight size={17} />
              </button>
            </div>
          </section>
          <footer>
            <div className="wrap footer-grid">
              <div>
                <Logo />
                <p>Ideas made tangible.</p>
              </div>
              <div>
                <span>EXPLORE</span>
                <button onClick={() => go("quote")}>Get an estimate</button>
                <button onClick={() => go("tracking")}>My orders</button>
              </div>
              <div>
                <span>CRAFTWORX</span>
                <p>South Africa</p>
                <a href={whatsappHref || undefined} target={whatsappHref ? "_blank" : undefined} rel={whatsappHref ? "noreferrer" : undefined}>WhatsApp the studio</a>
              </div>
            </div>
            <div className="wrap footer-bottom">
              <span>© 2026 3D Craftworx.</span>
              <span>MADE REAL, LAYER BY LAYER</span>
            </div>
          </footer>
        </main>
      )}
      {route === "account" && (
        <main className="page account-page wrap">
          <AuthPanel
            recovery={recovery}
            onComplete={() => {
              setRecovery(false);
              history.replaceState(null, "", location.pathname + location.hash);
              void load();
              go("tracking");
            }}
          />
        </main>
      )}
      {route === "quote" && (
        <main className="page quote-page">
          <div className="wrap">
            {offer === "choose" ? (
              <section className="svc" aria-labelledby="svc-title">
                <div className="svc-eyebrow"><span /><span>YOUR IDEA. MADE REAL.</span><span /></div>
                <h1 id="svc-title">Choose your <em>service.</em></h1>
                <p className="svc-intro">From digital models to finished signs, choose what you need and we&apos;ll take it from there.</p>
                <div className="svc-grid">
                  <article className="svc-card">
                    <div className="svc-top"><span>OPTION 01</span><i /></div>
                    <div className="svc-visual"><img src={modelPrint.src} alt="3D printed mechanical component and wireframe model" /></div>
                    <div className="svc-body">
                      <svg className="svc-icon" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 56 17.5v29L32 60 8 46.5v-29L32 4Z"/><path d="M8 17.5 32 32l24-14.5M32 32v28M20 11l24 14M44 11 20 25"/></svg>
                      <div>
                        <div className="svc-kicker">3D PRINTING</div>
                        <h2>Upload a model<br /><em>to print</em></h2>
                        <p>Already have a 3D model? Upload your STL, OBJ or 3MF file and get an estimate for a high-quality print.</p>
                      </div>
                    </div>
                    <button className="svc-btn" type="button" onClick={() => setOffer("print")}>
                      <span>Upload your model</span><span className="svc-arrow">↗</span>
                    </button>
                  </article>
                  <article className="svc-card">
                    <div className="svc-top"><span>OPTION 02</span><i /></div>
                    <div className="svc-visual"><img src={modelScan.src} alt="Part being digitally scanned into a wireframe model" /></div>
                    <div className="svc-body">
                      <svg className="svc-icon" viewBox="0 0 64 64" aria-hidden="true"><path d="M22 6H12a6 6 0 0 0-6 6v10M42 6h10a6 6 0 0 1 6 6v10M6 42v10a6 6 0 0 0 6 6h10M58 42v10a6 6 0 0 1-6 6H42"/><circle cx="28" cy="28" r="12"/><path d="m37 37 12 12"/></svg>
                      <div>
                        <div className="svc-kicker">3D SCANNING</div>
                        <h2>Scan a <em>model</em></h2>
                        <p>Need a digital copy of a physical part? Choose an STL file, or a scan that we also print.</p>
                      </div>
                    </div>
                    <button className="svc-btn" type="button" onClick={() => setOffer("scan")}>
                      <span>Scan an object</span><span className="svc-arrow">↗</span>
                    </button>
                  </article>
                  <article className="svc-card">
                    <div className="svc-top"><span>OPTION 03</span><i /></div>
                    <div className="svc-visual"><img src={signagePrint.src} alt="Vehicle graphics, sign making and rolls of printed vinyl" /></div>
                    <div className="svc-body">
                      <svg className="svc-icon" viewBox="0 0 64 64" aria-hidden="true"><path d="M16 22V6h32v16M16 47H8a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6h48a6 6 0 0 1 6 6v13a6 6 0 0 1-6 6h-8"/><path d="M16 38h32v20H16zM45 29h7"/></svg>
                      <div>
                        <div className="svc-kicker">SIGNAGE &amp; PRINT</div>
                        <h2>Signage &amp; print<br /><em>services</em></h2>
                        <p>Vehicle wraps, custom signs, vinyl printing, cutting, stickers and more. Bring your brand to life.</p>
                      </div>
                    </div>
                    <button className="svc-btn" type="button" onClick={() => setOffer("signage")}>
                      <span>Explore signage &amp; print</span><span className="svc-arrow">↗</span>
                    </button>
                  </article>
                </div>
                <div className="svc-trust">
                  <div><span>✦</span><span><strong>Built with precision</strong><small>Careful work at every stage</small></span></div>
                  <div><span>◎</span><span><strong>Clear estimates</strong><small>Know your options before ordering</small></span></div>
                  <div><span>↗</span><span><strong>Human support</strong><small>Real people behind every project</small></span></div>
                </div>
              </section>
            ) : (
            <>
            <button className="svc-back" type="button" onClick={() => setOffer("choose")}>← All services</button>
            {offer === "signage" ? (
                <section className="panel">
                  <div className="panel-head">
                    <span>03</span>
                    <div>
                      <h2>Signage &amp; print</h2>
                      <p>Vehicle wraps, signs, vinyl, cutting and stickers.</p>
                    </div>
                  </div>
                  <p>This form does not book signage yet. Ask the studio on WhatsApp.</p>
                  <a className="btn" href={signageWhatsAppHref || undefined} target={signageWhatsAppHref ? "_blank" : undefined} rel={signageWhatsAppHref ? "noreferrer" : undefined}>Ask on WhatsApp</a>
                </section>
            ) : !user ? (
              <div className="gate">
                <AuthPanel onComplete={() => void load()} />
              </div>
            ) : !profile?.active ? (
              <div className="panel gate">
                <h2>Account unavailable</h2>
                <p>Contact the site administrator for account access.</p>
              </div>
            ) : (
              <>
              {offer === "scan" ? (
                <form className="scan-form" onSubmit={submitScan}>
                  <section className="panel">
                    <div className="panel-head">
                      <span>01</span>
                      <div>
                        <h2>Scan an object</h2>
                        <p>Drop the object at the studio. Prices exclude VAT.</p>
                      </div>
                    </div>
                    {scanServices.map((service) => (
                      <label className="scan-choice" key={service.kind}>
                        <input
                          type="radio"
                          name="scan-service"
                          checked={scanKind === service.kind}
                          onChange={() => setScanKind(service.kind)}
                        />
                        <span>
                          <b>{service.label}</b>
                          <small>
                            {money(scanExVat(service.kind) / 100)} ex VAT · {money(scanTotalCents(scanExVat(service.kind), scanVat) / 100)} including VAT
                          </small>
                        </span>
                      </label>
                    ))}
                    <label>
                      Photo of the object
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={(e) => setScanPhoto(e.target.files?.[0] ?? null)}
                      />
                      <small>Optional. JPG, PNG, or WebP.</small>
                    </label>
                    <div className="fields">
                      <label>
                        Drop-off day
                        <input type="date" required value={scanDay} onChange={(e) => setScanDay(e.target.value)} />
                      </label>
                      <label>
                        Drop-off time
                        <input type="time" required value={scanTime} onChange={(e) => setScanTime(e.target.value)} />
                      </label>
                      <label className="wide">
                        Notes
                        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Size, colour, or what you want printed" />
                      </label>
                    </div>
                    <button className="btn" type="submit" disabled={busy}>
                      {busy ? "Placing…" : "Place scan order"} <ArrowRight size={17} />
                    </button>
                  </section>
                </form>
              ) : (
              <form className="quote-grid" onSubmit={submit}>
                <div className="quote-main">
                  <section className="panel">
                    <div className="panel-head">
                      <span>01</span>
                      <div>
                        <h2>Your model</h2>
                        <p>STL, OBJ or 3MF, up to 50 MB</p>
                      </div>
                    </div>
                    <input
                      className="sr-only"
                      ref={fileInput}
                      type="file"
                      accept=".stl,.obj,.3mf"
                      onChange={(e) => pick(e.target.files?.[0])}
                    />
                    <div
                      className="drop"
                      role="button"
                      tabIndex={0}
                      onClick={() => fileInput.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ")
                          fileInput.current?.click();
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        pick(e.dataTransfer.files[0]);
                      }}
                    >
                      <span>
                        <UploadCloud size={28} />
                      </span>
                      <b>{file?.name ?? "Drop your model here"}</b>
                      <p>or click to browse your files</p>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-head">
                      <span>02</span>
                      <div>
                        <h2>Print preferences</h2>
                        <p>Choose the essentials</p>
                      </div>
                    </div>
                    <div className="fields">
                      <label>
                        Material
                        <select
                          value={chosenMaterial}
                          onChange={(e) => setMaterial(e.target.value)}
                          required
                        >
                          {materialTypes.length ? (
                            materialTypes.map((item) => (
                              <option key={item}>{item}</option>
                            ))
                          ) : (
                            <option value="">
                              No materials configured yet
                            </option>
                          )}
                        </select>
                      </label>
                      <label>
                        Colour
                        <select
                          value={chosenColour}
                          onChange={(e) => setColour(e.target.value)}
                          required
                        >
                          {colours.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Quality
                        <select
                          value={quality}
                          onChange={(e) => setQuality(e.target.value)}
                        >
                          {[
                            "Draft · 0.28 mm",
                            "Standard · 0.20 mm",
                            "Fine · 0.12 mm",
                          ].map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Quantity
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={qty}
                          onChange={(e) => setQty(Number(e.target.value))}
                        />
                      </label>
                      <label className="wide">
                        Infill · {infill}%
                        <input
                          type="range"
                          min="10"
                          max="80"
                          step="5"
                          value={infill}
                          onChange={(e) => setInfill(Number(e.target.value))}
                        />
                      </label>
                      <label className="wide">
                        Notes
                        <textarea
                          rows={3}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Fit, finish, use or deadline details"
                        />
                      </label>
                    </div>
                  </section>
                </div>
                <aside className="quote-aside">
                  <section className="panel preview-panel">
                    {buffer && file ? (
                      <MeshCanvas
                        buffer={buffer}
                        name={file.name}
                        colour={colour}
                        onError={() => setPreviewError(true)}
                      />
                    ) : (
                      <div className="preview-placeholder">
                        <FileBox size={48} />
                        <span>Model preview</span>
                      </div>
                    )}
                    {previewError && <p className="preview-error" role="status">Preview unavailable for this model. The file is ready to upload.</p>}
                  </section>
                  <section className="panel estimate">
                    <span className="overline">AUTOMATIC PRICE</span>
                    <strong>Calculated after upload</strong>
                    <p>
                      Based on model geometry and current pricing settings.
                      Review the price before placing your order for collection.
                      Online payment is being set up.
                    </p>
                    <button
                      className="btn"
                      type="submit"
                      disabled={
                        busy || !file || !chosenMaterial || !chosenColour
                      }
                    >
                      {busy ? "Calculating…" : "Upload and calculate"}{" "}
                      <ArrowRight size={17} />
                    </button>
                  </section>
                </aside>
              </form>
              )}
              </>
            )}
            </>
            )}
          </div>
        </main>
      )}
      {route === "tracking" && (
        <main className="page tracking-page">
          <div className="wrap">
            <div className="page-head row">
              <div>
                <span className="overline">YOUR ACCOUNT</span>
                <h1>My orders.</h1>
                <p>Review estimates and follow production updates.</p>
              </div>
              <button className="btn" onClick={() => go("quote")}>
                New project <Plus size={16} />
              </button>
            </div>
            {user && <button className="archive-toggle" onClick={() => { setShowArchived(!showArchived); setSelectedId(""); }}>
              {showArchived ? "Show active orders" : "Archived orders"}
            </button>}
            {!user ? (
              <AuthPanel onComplete={() => void load()} />
            ) : customerJobs.length === 0 ? (
              <div className="empty-state panel">
                <FileBox size={38} />
                <h2>{showArchived ? "No archived orders" : "No active orders"}</h2>
                <p>{showArchived ? "Cancelled or completed orders can be archived and restored here." : "Upload a model to get an automatic estimate."}</p>
                <button className="btn" onClick={() => go("quote")}>
                  Start a project
                </button>
              </div>
            ) : (
              <div className="tracking-grid">
                <aside className="orders">
                  <div className="orders-title">
                    <h2>Orders</h2>
                    <span>{customerJobs.length}</span>
                  </div>
                  {customerJobs
                    .map((job) => (
                      <button
                        key={job.id}
                        className={
                          "order " + (selected?.id === job.id ? "selected" : "")
                        }
                        onClick={() => setSelectedId(job.id)}
                      >
                        <span className="mini-model">
                          <FileBox />
                        </span>
                        <span>
                          <b>{job.code}</b>
                          <small>{job.kind === "print" ? job.file : job.material}</small>
                          <b>
                            {job.price === null ? "Price pending" : money(job.price)}
                          </b>
                          <span className="chip">{job.status}</span>
                        </span>
                      </button>
                    ))}
                </aside>
                {selected && selected.customerId === user.id && (
                  <article className="order-detail">
                    <div className="order-top">
                      <div>
                        <span className="overline">ORDER {selected.code}</span>
                        <h2>{selected.kind === "print" ? selected.file : selected.material}</h2>
                        <p>
                          {selected.kind === "print"
                            ? `${selected.material} · ${selected.colour} · ${selected.qty} piece${selected.qty === 1 ? "" : "s"}`
                            : `${selected.material}${selected.dropoff ? ` · drop off ${dropoffText(selected.dropoff)}` : ""}`}
                        </p>
                      </div>
                      <span className="chip">{selected.status}</span>
                    </div>
                    <div className="current-stage">
                      <span>CURRENT STAGE</span>
                      <h3>{selected.status}</h3>
                      <p>
                        {selected.status === "Cancelled" ? "This order has been cancelled. Archive it to remove it from the active list."
                          : selected.pricingError
                          ? selected.pricingError
                          : selected.status === "Submitted"
                            ? "Your file is being measured for an automatic estimate."
                            : selected.status === "Quoted"
                              ? "Your estimate is ready to review."
                              : "Your order is progressing through the studio."}
                      </p>
                    </div>
                    <div className="checkout-card">
                      <span className="overline">TOTAL</span>
                      <strong>
                        {selected.price === null
                          ? selected.status === "Cancelled" ? "No price calculated" : selected.pricingError ? "Calculation failed" : "Calculating…"
                          : money(selected.price)}
                      </strong>
                      <p>
                        {selected.kind === "print"
                          ? "Collection price. Online payment is being set up."
                          : `${selected.dropoff ? `Drop off ${dropoffText(selected.dropoff)}. ` : ""}Includes VAT.`}
                      </p>
                      {selected.pricingProvisional &&
                        selected.price !== null && (
                          <p>The studio is confirming this price.</p>
                        )}
                      {["Submitted", "Quoted"].includes(selected.status) && !selected.archived && (
                        <button
                          className="btn outline"
                          disabled={busy}
                          onClick={() => refreshEstimate(selected)}
                        >
                          Refresh estimate
                        </button>
                      )}
                      {selected.geometryGuess && !selected.guessAccepted && (
                        <p>The studio is checking this file before the order can be placed.</p>
                      )}
                      {selected.status === "Quoted" &&
                        !selected.pricingProvisional &&
                        !(selected.geometryGuess && !selected.guessAccepted) && (
                          <button
                            className="btn"
                            disabled={busy}
                            onClick={() => confirm(selected)}
                          >
                            <Check size={16} /> Place order
                          </button>
                        )}
                    </div>
                    {selected.invoice && (
                      <div className="bill-saved">
                        <p>Invoice {selected.invoice.number}</p>
                        <button className="btn" type="button" onClick={() => setInvoiceId(selected.id)}>View invoice</button>
                      </div>
                    )}
                    {selected.note && (
                      <p className="note-text">Studio note: {selected.note}</p>
                    )}
                    <div className="order-meta">
                      {selected.kind === "print" ? (
                        <div>
                          <span>Material</span>
                          <b>
                            {selected.material} / {selected.colour}
                          </b>
                        </div>
                      ) : (
                        <div>
                          <span>Drop-off</span>
                          <b>{selected.dropoff ? dropoffText(selected.dropoff) : "Not set"}</b>
                        </div>
                      )}
                      <div>
                        <span>Due date</span>
                        <b>{selected.due}</b>
                      </div>
                    </div>
                    <div className="timeline">
                      <h3>Project journey</h3>
                      {selected.status === "Cancelled" ? <p className="cancelled-status">Order cancelled</p> : productionStages.map((stage, index) => (
                        <div
                          key={stage}
                          className={
                            "timeline-row " +
                            (index <= productionStages.indexOf(selected.status)
                              ? "done"
                              : "")
                          }
                        >
                          <span>
                            {index < productionStages.indexOf(selected.status) && (
                              <Check size={12} />
                            )}
                          </span>
                          <b>{stage}</b>
                        </div>
                      ))}
                    </div>
                    <div className="activity">
                      <h3>Updates</h3>
                      {selected.activity.map((item, index) => (
                        <div key={index}>
                          <i />
                          {item}
                        </div>
                      ))}
                    </div>
                    {selected.file !== "No photo" && (
                    <button
                      className="text-action"
                      onClick={() => download(selected)}
                    >
                      {selected.kind === "print" ? "Download your model" : "Download the photo"}
                    </button>
                    )}
                    <div className="order-actions">
                      {!selected.archived && (isStaff || ["Submitted", "Quoted", "Approved"].includes(selected.status)) && !["Cancelled", "Completed"].includes(selected.status) &&
                        <button className="btn danger" disabled={busy} onClick={() => cancelOrder(selected)}>Cancel order</button>}
                      {["Cancelled", "Completed"].includes(selected.status) &&
                        <button className="btn outline" disabled={busy} onClick={() => archiveOrder(selected)}>{selected.archived ? "Restore order" : "Archive order"}</button>}
                    </div>
                  </article>
                )}
              </div>
            )}
          </div>
        </main>
      )}
      {(route === "board" || route === "detail" || route === "admin") && (
        <main className="staff-shell">
          <div className="wrap">
            {!user ? (
              <AuthPanel onComplete={() => void load()} />
            ) : !isStaff || (route === "admin" && profile?.role !== "admin") ? (
              <div className="panel gate">
                <h2>Staff access required</h2>
                <p>Your account does not have access to this workspace.</p>
              </div>
            ) : (
              <>
                <div className="staff-title">
                  <div>
                    <span className="overline">3D CRAFTWORX / OPERATIONS</span>
                    <h1>
                      {route === "admin"
                        ? "Administration"
                        : route === "detail"
                          ? "Job detail"
                          : "Job board"}
                    </h1>
                    <p>
                      {route === "admin"
                        ? "Pricing, machines, materials, and who can work jobs."
                        : "Orders and production from the shared database."}
                    </p>
                  </div>
                  <div className="workspace-nav">
                    <button className={route === "board" ? "active" : ""} onClick={() => go("board")}>Job board</button>
                    <button onClick={() => { setShowArchived(!showArchived); setSelectedId(""); go("board"); }}>{showArchived ? "Active jobs" : "Archived jobs"}</button>
                    {profile?.role === "admin" && (
                      <button className={route === "admin" ? "active" : ""} onClick={() => go("admin")}>
                        Admin
                      </button>
                    )}
                  </div>
                </div>
                {route === "admin" ? (
                  <AdminPanel />
                ) : route === "board" ? (
                  <div className="kanban">
                    {stages.map((stage) => (
                      <section className="column" key={stage}>
                        <div className="column-head">
                          <h2>{stage}</h2>
                          <span>
                            {visibleJobs.filter((job) => job.status === stage).length}
                          </span>
                        </div>
                        {visibleJobs
                          .filter((job) => job.status === stage)
                          .map((job) => (
                            <button
                              className="job-card"
                              key={job.id}
                              onClick={() => {
                                setSelectedId(job.id);
                                go("detail");
                              }}
                            >
                              <div className="card-top">
                                <b>{job.code}</b>
                                <ArrowUpRight size={16} />
                              </div>
                              <h3>{job.file}</h3>
                              <p>{job.customer}</p>
                              <div className="card-tags">
                                <span>{job.material}</span>
                                {job.kind === "print" ? <span>× {job.qty}</span> : <span>Drop-off</span>}
                              </div>
                              <div className="card-bottom">
                                <span>
                                  {job.price === null
                                    ? "Estimate pending"
                                    : money(job.price)}
                                </span>
                                {["Approved", "Printing", "Post-Processing", "Ready for Collection", "Completed"].includes(job.status) && (
                                  <span>{job.paid ? "Paid" : "Unpaid"}</span>
                                )}
                              </div>
                            </button>
                          ))}
                        {!visibleJobs.some((job) => job.status === stage) && (
                          <div className="empty-column">No jobs</div>
                        )}
                      </section>
                    ))}
                  </div>
                ) : selected ? (
                  <div className="detail-grid">
                    <section className="panel">
                      <button
                        className="text-action"
                        onClick={() => go("board")}
                      >
                        ← Back to board
                      </button>
                      <h2>
                        {selected.code} · {selected.kind === "print" ? selected.file : selected.material}
                      </h2>
                      <p>
                        {selected.customer} · {selected.email}
                      </p>
                      <PriceBreakdown internal summary={selected.pricingSummary} />
                      <div className="specs">
                        {(selected.kind === "print"
                          ? [
                          ["Material", selected.material],
                          ["Colour", selected.colour],
                          ["Quality", selected.quality],
                          ["Infill", selected.infill + "%"],
                          ["Quantity", selected.qty],
                          ["Assigned machine", machineOptions.find((item) => item.id === selected.assignedMachineId)?.name ?? "Not assigned"],
                          ["Assigned staff", staffOptions.find((item) => item.id === selected.assignedStaffId)?.display_name ?? "Not assigned"],
                          [
                            "Estimate",
                            selected.price === null
                              ? "Pending"
                              : money(selected.price),
                          ],
                        ]
                          : [
                          ["Service", selected.material],
                          ["Drop-off", selected.dropoff ? dropoffText(selected.dropoff) : "Not set"],
                          ["Photo", selected.file === "No photo" ? "None" : selected.file],
                          ["Assigned staff", staffOptions.find((item) => item.id === selected.assignedStaffId)?.display_name ?? "Not assigned"],
                          ["Price incl. VAT", selected.price === null ? "Pending" : money(selected.price)],
                        ]).map(([label, value]) => (
                          <div key={String(label)}>
                            <span>{label}</span>
                            <b>{value}</b>
                          </div>
                        ))}
                      </div>
                      {["Submitted", "Quoted"].includes(selected.status) && (
                        <div className="order-edit">
                          <h3>Edit order before customer confirmation</h3>
                          <p>Changing print settings recalculates the price for the customer to review. Confirmed order prices stay fixed.</p>
                          <div className="order-edit-fields">
                            <label>Material
                              <select value={editMaterial} onChange={(e) => {
                                setEditMaterial(e.target.value);
                                setEditColour(options.find((option) => option.material_type === e.target.value)?.colour ?? "");
                              }}>
                                {[...new Set(options.map((option) => option.material_type))].map((item) =>
                                  <option key={item} value={item}>{item}</option>)}
                              </select>
                            </label>
                            <label>Colour
                              <select value={editColour} onChange={(e) => setEditColour(e.target.value)}>
                                {options.filter((option) => option.material_type === editMaterial).map((option) =>
                                  <option key={option.colour} value={option.colour}>{option.colour}</option>)}
                              </select>
                            </label>
                            <label>Quality
                              <select value={editQuality} onChange={(e) => setEditQuality(e.target.value)}>
                                {["Draft · 0.28 mm", "Standard · 0.20 mm", "Fine · 0.12 mm"].map((item) =>
                                  <option key={item}>{item}</option>)}
                              </select>
                            </label>
                            <label>Infill %
                              <input type="number" min="10" max="80" value={editInfill}
                                onChange={(e) => setEditInfill(Number(e.target.value))} />
                            </label>
                            <label>Quantity
                              <input type="number" min="1" max="100" value={editQty}
                                onChange={(e) => setEditQty(Number(e.target.value))} />
                            </label>
                          </div>
                          <button className="btn outline" disabled={busy || !editMaterial || !editColour}
                            onClick={() => saveOrderDetails(selected)}>Save and recalculate</button>
                        </div>
                      )}
                      <p className="note-text">
                        {selected.customerNote || "No customer notes."}
                      </p>
                      <button
                        className="btn outline"
                        onClick={() => download(selected)}
                        hidden={selected.file === "No photo"}
                      >
                        {selected.kind === "print" ? "Download model" : "Download the photo"}
                      </button>
                      <div className="activity">
                        <h3>Activity</h3>
                        {selected.activity.map((item, index) => (
                          <div key={index}>
                            <i />
                            {item}
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="panel status-panel">
                      <h2>Production update</h2>
                      <p>
                        Customer accounts see the current stage and public
                        updates.
                      </p>
                      <label>
                        Stage
                        <select
                          value={selected.status}
                          disabled={busy || selected.status === "Cancelled" || selected.archived}
                          onChange={(e) => {
                            const stage = e.target.value as Stage;
                            if (stage === "Cancelled") void cancelOrder(selected);
                            else if (stage !== "Quoted")
                              void saveJob(selected, stage);
                          }}
                        >
                          {stages
                            .filter((stage) => {
                              if (stage === "Quoted") return selected.status === "Quoted";
                              if (stage === "Approved" && ["Submitted", "Quoted"].includes(selected.status)) return false;
                              return true;
                            })
                            .map((stage) => (
                              <option key={stage}>{stage}</option>
                            ))}
                        </select>
                      </label>
                      {["Submitted", "Quoted"].includes(selected.status) && (
                        <p>
                          {selected.pricingProvisional
                            ? "Sample pricing is still on. Save the pricing rules in Admin first. After that, the customer places the order, which moves it to Approved. That step is not a payment."
                            : "The customer places the order on My orders. That is what moves it to Approved. Staff cannot skip it, and it is not a payment."}
                        </p>
                      )}
                      {selected.geometryGuess && (
                        <p>
                          {selected.guessAccepted
                            ? "Volume estimate accepted. This file was priced from its box, not a closed solid."
                            : "This file is not a closed solid. The price uses 35% of the bounding box. Accept it before the customer can place the order."}
                        </p>
                      )}
                      {selected.geometryGuess && !selected.guessAccepted && ["Submitted", "Quoted"].includes(selected.status) && (
                        <button className="btn outline" disabled={busy} onClick={() => acceptGuess(selected)}>Accept volume estimate</button>
                      )}
                      {billingFields(selected)}
                      {["Approved", "Printing", "Post-Processing", "Ready for Collection", "Completed"].includes(selected.status) && (
                        <button className="btn outline" disabled={busy} onClick={() => setPaid(selected, !selected.paid)}>
                          {selected.paid ? "Mark unpaid" : "Mark paid"}
                        </button>
                      )}
                      <label>
                        Assigned staff
                        <select value={assignedStaffId} onChange={(e) => setAssignedStaffId(e.target.value)}>
                          <option value="">Unassigned</option>
                          {staffOptions.map((person) => (
                            <option key={person.id} value={person.id}>{person.display_name || person.id}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Production machine
                        <select value={assignedMachineId} onChange={(e) => setAssignedMachineId(e.target.value)}>
                          <option value="">Unassigned</option>
                          {machineOptions.map((machine) => (
                            <option key={machine.id} value={machine.id}>{machine.name}</option>
                          ))}
                        </select>
                        <small>The customer&apos;s confirmed price stays fixed if this changes.</small>
                      </label>
                      <label>
                        Progress · {progress}%
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={progress}
                          onChange={(e) => setProgress(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Due date
                        <input
                          type="date"
                          value={due}
                          onChange={(e) => setDue(e.target.value)}
                        />
                      </label>
                      <label>
                        Customer-facing note
                        <textarea
                          rows={4}
                          value={staffNote}
                          onChange={(e) => setStaffNote(e.target.value)}
                        />
                      </label>
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() => saveJob(selected, selected.status)}
                      >
                        Save update
                      </button>
                      <div className="order-actions">
                        {!selected.archived && !["Cancelled", "Completed"].includes(selected.status) &&
                          <button className="btn danger" disabled={busy} onClick={() => cancelOrder(selected)}>Cancel job</button>}
                        {["Cancelled", "Completed"].includes(selected.status) &&
                          <button className="btn outline" disabled={busy} onClick={() => archiveOrder(selected)}>{selected.archived ? "Restore job" : "Archive job"}</button>}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="panel empty-state">No jobs yet.</div>
                )}
              </>
            )}
          </div>
        </main>
      )}
      {invoiceId && jobs.find((job) => job.id === invoiceId)?.invoice && (
        <InvoiceSheet
          invoice={jobs.find((job) => job.id === invoiceId)!.invoice!}
          onClose={() => setInvoiceId("")}
        />
      )}
    </div>
  );
}

function InvoiceSheet({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const issued = new Date(invoice.issued).toLocaleDateString("en-ZA", { dateStyle: "medium" });
  const line = (label: string, value?: string) => value ? <p><span>{label}</span> {value}</p> : null;
  return (
    <div className="invoice-sheet" role="dialog" aria-label={invoice.heading}>
      <div className="invoice-paper">
        <div className="invoice-top">
          <div>
            <h2>{invoice.heading}</h2>
            <p>{invoice.number}</p>
            <p>{issued}</p>
          </div>
          <div>
            <b>{invoice.studio.legal_name || "3D Craftworx"}</b>
            {line("", invoice.studio.address)}
            {line("", invoice.studio.phone)}
            {line("", invoice.studio.email)}
            {line("Reg", invoice.studio.registration)}
            {line("VAT", invoice.studio.vat_number)}
          </div>
        </div>
        <div className="invoice-buyer">
          <span>BILL TO</span>
          <b>{invoice.buyer.company || invoice.buyer.name}</b>
          {invoice.buyer.company ? <p>{invoice.buyer.name}</p> : null}
          {line("", invoice.buyer.address)}
          {line("", invoice.buyer.accounts_email || invoice.buyer.email)}
          {line("VAT", invoice.buyer.vat)}
          {line("Reg", invoice.buyer.registration)}
          {line("PO", invoice.buyer.po)}
        </div>
        <table>
          <thead><tr><th>Description</th><th>Ex VAT</th><th>VAT</th><th>Total</th></tr></thead>
          <tbody>
            <tr>
              <td>{invoice.description}</td>
              <td>{money(invoice.exVatCents / 100)}</td>
              <td>{money(invoice.vatCents / 100)} ({invoice.vatPercent}%)</td>
              <td>{money(invoice.totalCents / 100)}</td>
            </tr>
          </tbody>
        </table>
        {invoice.studio.bank ? <p className="invoice-bank"><span>Bank</span> {invoice.studio.bank}</p> : null}
        <p className="invoice-paid">Paid</p>
        <div className="invoice-actions">
          <button className="btn" type="button" onClick={() => window.print()}>Save as PDF</button>
          <button className="btn outline" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
