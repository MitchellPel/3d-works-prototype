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
import { getSupabase } from "@/lib/supabase";
import {
  toJob,
  stages,
  type Job,
  type Profile,
  type Stage,
} from "@/lib/app-data";

type Route =
  "home" | "quote" | "tracking" | "board" | "detail" | "admin" | "account";
type Option = { material_type: string; colour: string };
const money = (value: number) =>
  "R " +
  value.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const modelFile = (name: string) => /\.(stl|obj|3mf)$/i.test(name);

function Logo() {
  return (
    <span className="logo">
      <span className="logo-symbol">
        <i />
        <i />
        <i />
      </span>
      3D <b>CRAFTWORX</b>
    </span>
  );
}

function Model() {
  return (
    <div className="model">
      <div className="model-grid" />
      <div className="model-shape">
        <span className="shape-top" />
        <span className="shape-front"><i /><i /></span>
        <span className="shape-side" />
      </div>
      <span className="model-axis">X <b>Y</b> Z</span>
    </div>
  );
}

export default function Home() {
  const supabase = getSupabase();
  const [route, setRoute] = useState<Route>("home");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [material, setMaterial] = useState("");
  const [colour, setColour] = useState("");
  const [quality, setQuality] = useState("Standard · 0.20 mm");
  const [infill, setInfill] = useState(20);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [staffNote, setStaffNote] = useState("");
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
  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUser = sessionData.session?.user ?? null;
    setUser(currentUser);
    if (!currentUser) {
      setProfile(null);
      setJobs([]);
      return;
    }
    const [profileResult, jobsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", currentUser.id).single(),
      supabase
        .from("jobs")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
    if (profileResult.error) setMessage(profileResult.error.message);
    else setProfile(profileResult.data as Profile);
    if (jobsResult.error) {
      setMessage(jobsResult.error.message);
      return;
    }
    const rows = jobsResult.data ?? [];
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
      setRoute(valid.includes(hash) ? hash : "home");
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
      setProgress(selected?.progress ?? 0);
      setDue(
        selected?.due && selected.due !== "To be confirmed" ? selected.due : "",
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [selected?.id, selected?.note, selected?.progress, selected?.due]);

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
    void next
      .arrayBuffer()
      .then(setBuffer)
      .catch(() => setMessage("Could not open that file."));
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
            (quote.data?.error ?? quote.error?.message),
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
      if (path) await supabase.storage.from("models").remove([path]);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(job: Job) {
    if (
      !supabase ||
      job.price === null ||
      job.status !== "Quoted" ||
      job.pricingProvisional
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
      setMessage("Order confirmed. The studio can now begin production.");
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
        ? error.message
        : data?.error
          ? String(data.error)
          : data?.provisional
            ? "Sample estimate refreshed. The studio must approve pricing before checkout."
            : "Estimate refreshed. Review the amount before confirming.",
    );
    setBusy(false);
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
      })
      .eq("id", job.id);
    if (error) setMessage(error.message);
    else {
      await load();
      setMessage("Job updated.");
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
        <button onClick={() => go("admin")}>Admin</button>
      )}
    </>
  );
  return (
    <div className="app">
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
                  <span>01 / UPLOAD</span>
                  <span>02 / ESTIMATE</span>
                  <span>03 / CONFIRM</span>
                  <span>04 / PRINT</span>
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
            <div className="page-head">
              <span className="overline">START A PROJECT</span>
              <h1>Let&apos;s make it real.</h1>
              <p>
                Upload a model and choose how you want it printed. We calculate
                an estimate automatically.
              </p>
            </div>
            {!user ? (
              <div className="gate">
                <AuthPanel onComplete={() => void load()} />
              </div>
            ) : !profile?.active ? (
              <div className="panel gate">
                <h2>Account unavailable</h2>
                <p>Contact the site administrator for account access.</p>
              </div>
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
                      />
                    ) : (
                      <div className="preview-placeholder">
                        <FileBox size={48} />
                        <span>Model preview</span>
                      </div>
                    )}
                  </section>
                  <section className="panel estimate">
                    <span className="overline">AUTOMATIC ESTIMATE</span>
                    <strong>Calculated after upload</strong>
                    <p>
                      Based on model geometry and current pricing settings. The
                      amount is an estimate and is confirmed when you place the
                      order. No payment is collected online.
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
            {!user ? (
              <AuthPanel onComplete={() => void load()} />
            ) : jobs.length === 0 ? (
              <div className="empty-state panel">
                <FileBox size={38} />
                <h2>No orders yet</h2>
                <p>Upload your first model to get an automatic estimate.</p>
                <button className="btn" onClick={() => go("quote")}>
                  Start a project
                </button>
              </div>
            ) : (
              <div className="tracking-grid">
                <aside className="orders">
                  <div className="orders-title">
                    <h2>Orders</h2>
                    <span>{jobs.length}</span>
                  </div>
                  {jobs
                    .filter((job) => job.customerId === user.id)
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
                          <small>{job.file}</small>
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
                        <h2>{selected.file}</h2>
                        <p>
                          {selected.material} · {selected.colour} ·{" "}
                          {selected.qty} piece{selected.qty === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="chip">{selected.status}</span>
                    </div>
                    <div className="current-stage">
                      <span>CURRENT STAGE</span>
                      <h3>{selected.status}</h3>
                      <p>
                        {selected.pricingError
                          ? "We could not calculate this estimate yet. The studio will investigate the model or pricing configuration."
                          : selected.status === "Submitted"
                            ? "Your file is being measured for an automatic estimate."
                            : selected.status === "Quoted"
                              ? "Your estimate is ready to review."
                              : "Your order is progressing through the studio."}
                      </p>
                    </div>
                    <div className="checkout-card">
                      <span className="overline">ORDER ESTIMATE</span>
                      <strong>
                        {selected.price === null
                          ? "Calculating…"
                          : money(selected.price)}
                      </strong>
                      <p>
                        Calculated from the uploaded geometry. Confirm this
                        amount at checkout to place your order. No payment is
                        collected online.
                      </p>
                      {selected.pricingProvisional &&
                        selected.price !== null && (
                          <p>
                            Sample pricing is awaiting administrator approval.
                          </p>
                        )}
                      {(selected.pricingProvisional ||
                        selected.pricingError) && (
                        <button
                          className="btn outline"
                          disabled={busy}
                          onClick={() => refreshEstimate(selected)}
                        >
                          Refresh estimate
                        </button>
                      )}
                      {selected.status === "Quoted" &&
                        !selected.pricingProvisional && (
                          <button
                            className="btn"
                            disabled={busy}
                            onClick={() => confirm(selected)}
                          >
                            <Check size={16} /> Confirm order
                          </button>
                        )}
                    </div>
                    {selected.note && (
                      <p className="note-text">Studio note: {selected.note}</p>
                    )}
                    <div className="order-meta">
                      <div>
                        <span>Material</span>
                        <b>
                          {selected.material} / {selected.colour}
                        </b>
                      </div>
                      <div>
                        <span>Due date</span>
                        <b>{selected.due}</b>
                      </div>
                    </div>
                    <div className="timeline">
                      <h3>Project journey</h3>
                      {stages.map((stage, index) => (
                        <div
                          key={stage}
                          className={
                            "timeline-row " +
                            (index <= stages.indexOf(selected.status)
                              ? "done"
                              : "")
                          }
                        >
                          <span>
                            {index < stages.indexOf(selected.status) && (
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
                    <button
                      className="text-action"
                      onClick={() => download(selected)}
                    >
                      Download your model
                    </button>
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
                      Orders and production, updated in real time from the
                      shared database.
                    </p>
                  </div>
                  <div className="workspace-nav">
                    <button onClick={() => go("board")}>Job board</button>
                    {profile?.role === "admin" && (
                      <button onClick={() => go("admin")}>
                        Settings & staff
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
                            {jobs.filter((job) => job.status === stage).length}
                          </span>
                        </div>
                        {jobs
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
                                <span>× {job.qty}</span>
                              </div>
                              <div className="card-bottom">
                                <span>
                                  {job.price === null
                                    ? "Estimate pending"
                                    : money(job.price)}
                                </span>
                              </div>
                            </button>
                          ))}
                        {!jobs.some((job) => job.status === stage) && (
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
                        {selected.code} · {selected.file}
                      </h2>
                      <p>
                        {selected.customer} · {selected.email}
                      </p>
                      <div className="specs">
                        {[
                          ["Material", selected.material],
                          ["Colour", selected.colour],
                          ["Quality", selected.quality],
                          ["Infill", selected.infill + "%"],
                          ["Quantity", selected.qty],
                          [
                            "Estimate",
                            selected.price === null
                              ? "Pending"
                              : money(selected.price),
                          ],
                        ].map(([label, value]) => (
                          <div key={String(label)}>
                            <span>{label}</span>
                            <b>{value}</b>
                          </div>
                        ))}
                      </div>
                      <p className="note-text">
                        {selected.customerNote || "No customer notes."}
                      </p>
                      <button
                        className="btn outline"
                        onClick={() => download(selected)}
                      >
                        Download model
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
                          onChange={(e) => {
                            const stage = e.target.value as Stage;
                            if (stage !== "Quoted")
                              void saveJob(selected, stage);
                          }}
                        >
                          {stages
                            .filter(
                              (stage) =>
                                stage !== "Quoted" ||
                                selected.status === "Quoted",
                            )
                            .map((stage) => (
                              <option key={stage}>{stage}</option>
                            ))}
                        </select>
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
    </div>
  );
}
