"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import type { Profile } from "@/lib/app-data";

type Rules = Record<string, number | boolean>;
type Machine = {
  id?: string;
  name: string;
  process: string;
  billing_cents_per_hour: number;
  throughput_mm3_per_hour: number;
  build_x_mm: number;
  build_y_mm: number;
  build_z_mm: number;
  priority: number;
  active: boolean;
};
type Material = {
  id?: string;
  vendor: string;
  material_type: string;
  colour: string;
  process: string;
  package_quantity: number;
  package_cost_cents: number;
  density_g_cm3: number;
  active: boolean;
};

const ruleFields: {
  key: string;
  label: string;
  scale: number;
  suffix: string;
  group: string;
}[] = [
  { key: "setup_fee_cents", label: "Setup fee", scale: 100, suffix: "R", group: "Customer price" },
  { key: "minimum_charge_cents", label: "Minimum charge", scale: 100, suffix: "R", group: "Customer price" },
  { key: "vat_percent", label: "VAT", scale: 1, suffix: "%", group: "Customer price" },
  { key: "default_lead_days", label: "Default deadline", scale: 1, suffix: "days", group: "Customer price" },
  { key: "material_markup_percent", label: "Material markup", scale: 1, suffix: "%", group: "Hidden from customers" },
  { key: "waste_percent", label: "Material waste", scale: 1, suffix: "%", group: "Hidden from customers" },
  { key: "support_percent", label: "Support allowance", scale: 1, suffix: "%", group: "Hidden from customers" },
  { key: "quality_draft_multiplier", label: "Draft time multiplier", scale: 1, suffix: "×", group: "Hidden from customers" },
  { key: "quality_fine_multiplier", label: "Fine time multiplier", scale: 1, suffix: "×", group: "Hidden from customers" },
  { key: "shell_fraction_percent", label: "Shell share estimate", scale: 1, suffix: "%", group: "Hidden from customers" },
  { key: "open_mesh_fill_percent", label: "Open mesh fallback volume", scale: 1, suffix: "%", group: "Hidden from customers" },
];
const ruleGroups = [...new Set(ruleFields.map((field) => field.group))];
const scanFields = [
  { key: "scan_file_cents", label: "Scan to STL, ex VAT" },
  { key: "scan_print_cents", label: "Scan and print, ex VAT" },
] as const;
const emptyMachine: Machine = {
  name: "",
  process: "FDM",
  billing_cents_per_hour: 0,
  throughput_mm3_per_hour: 12000,
  build_x_mm: 220,
  build_y_mm: 220,
  build_z_mm: 220,
  priority: 100,
  active: true,
};
const emptyMaterial: Material = {
  vendor: "",
  material_type: "",
  colour: "",
  process: "FDM",
  package_quantity: 1000,
  package_cost_cents: 0,
  density_g_cm3: 1.24,
  active: true,
};

export function AdminPanel() {
  const supabase = getSupabase();
  const [tab, setTab] = useState<
    "pricing" | "scanning" | "invoices" | "contact" | "machines" | "materials" | "staff"
  >("pricing");
  const [rules, setRules] = useState<Rules | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [letterhead, setLetterhead] = useState({
    invoice_legal_name: "",
    invoice_address: "",
    invoice_phone: "",
    invoice_email: "",
    invoice_registration: "",
    invoice_vat_number: "",
    invoice_bank: "",
  });
  const [machines, setMachines] = useState<Machine[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [invite, setInvite] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState("");
  const savedDialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase) return;
    const [ruleResult, machineResult, materialResult, peopleResult] =
      await Promise.all([
        supabase.from("pricing_rules").select("*").eq("id", true).single(),
        supabase.from("machine_rates").select("*").order("priority"),
        supabase.from("material_rates").select("*").order("material_type"),
        supabase
          .from("profiles")
          .select("*")
          .eq("role", "staff")
          .order("created_at"),
      ]);
    if (ruleResult.data) {
      const data = ruleResult.data as Record<string, unknown>;
      setRules({
        ...(ruleResult.data as Rules),
        scan_file_cents: Number(data.scan_file_cents ?? 25000),
        scan_print_cents: Number(data.scan_print_cents ?? 9900),
      });
      setWhatsapp(String(data.whatsapp ?? "").replace(/\D/g, ""));
      setLetterhead({
        invoice_legal_name: String(data.invoice_legal_name ?? ""),
        invoice_address: String(data.invoice_address ?? ""),
        invoice_phone: String(data.invoice_phone ?? ""),
        invoice_email: String(data.invoice_email ?? ""),
        invoice_registration: String(data.invoice_registration ?? ""),
        invoice_vat_number: String(data.invoice_vat_number ?? ""),
        invoice_bank: String(data.invoice_bank ?? ""),
      });
    }
    setMachines((machineResult.data ?? []) as Machine[]);
    setMaterials((materialResult.data ?? []) as Material[]);
    setStaff((peopleResult.data ?? []) as Profile[]);
    const firstError = [
      ruleResult.error,
      machineResult.error,
      materialResult.error,
      peopleResult.error,
    ].find(Boolean);
    if (firstError) setMessage(firstError.message);
  }, [supabase]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void reload();
    }, 0);
    return () => clearTimeout(timer);
  }, [reload]);

  useEffect(() => {
    const dialog = savedDialog.current;
    if (!dialog) return;
    if (saved && !dialog.open) dialog.showModal();
    if (!saved && dialog.open) dialog.close();
  }, [saved]);

  async function saveRules() {
    if (!supabase || !rules) return;
    setBusy(true);
    setMessage("");
    const payload = Object.fromEntries(
      ruleFields.map(({ key }) => [key, rules[key]]),
    );
    const { error } = await supabase
      .from("pricing_rules")
      .update({
        ...payload,
        sample_values: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    setMessage(error ? error.message : "");
    setBusy(false);
    if (!error) {
      setSaved("Estimate rules saved.");
      void reload();
    }
  }

  async function saveScanPrices() {
    if (!supabase || !rules) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("pricing_rules")
      .update({
        scan_file_cents: rules.scan_file_cents,
        scan_print_cents: rules.scan_print_cents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    setMessage(error ? error.message : "");
    setBusy(false);
    if (!error) {
      setSaved("Scan prices saved.");
      void reload();
    }
  }

  async function saveLetterhead() {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("pricing_rules")
      .update({ ...letterhead, updated_at: new Date().toISOString() })
      .eq("id", true);
    setMessage(error ? error.message : "");
    setBusy(false);
    if (!error) {
      setSaved("Invoice details saved.");
      void reload();
    }
  }

  async function saveWhatsApp() {
    if (!supabase) return;
    if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15)) {
      setMessage("WhatsApp number needs the country code, digits only.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("pricing_rules")
      .update({ whatsapp, updated_at: new Date().toISOString() })
      .eq("id", true);
    setMessage(error ? error.message : "");
    setBusy(false);
    if (!error) {
      setSaved("WhatsApp number saved.");
      void reload();
    }
  }

  async function saveMachine(machine: Machine) {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("machine_rates").upsert(machine);
    setMessage(error ? error.message : "");
    setBusy(false);
    if (!error) {
      setSaved(machine.id ? "Machine saved." : "Machine added.");
      void reload();
    }
  }

  async function saveMaterial(material: Material) {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("material_rates").upsert(material);
    setMessage(error ? error.message : "");
    setBusy(false);
    if (!error) {
      setSaved(material.id ? "Material saved." : "Material added.");
      void reload();
    }
  }

  async function inviteStaff(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "invite", email: invite },
    });
    setMessage(
      error ? error.message : data?.error ? String(data.error) : "Invite sent.",
    );
    setBusy(false);
    if (!error && !data?.error) {
      setInvite("");
      void reload();
    }
  }

  async function removeStaff(person: Profile) {
    if (
      !supabase ||
      !confirm(`Remove ${person.display_name || "this staff member"}'s access?`)
    )
      return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "remove", id: person.id },
    });
    setMessage(
      error
        ? error.message
        : data?.error
          ? String(data.error)
          : "Staff access removed.",
    );
    setBusy(false);
    void reload();
  }

  const sections = [
    ["pricing", "Pricing"],
    ["scanning", "Scanning"],
    ["invoices", "Invoices"],
    ["contact", "Contact"],
    ["machines", "Machines"],
    ["materials", "Materials"],
    ["staff", "Staff"],
  ] as const;

  return (
    <div className="admin-page">
      <div className="admin-layout">
      <nav className="admin-nav" aria-label="Administration sections">
        {sections.map(([item, label]) => (
          <button
            key={item}
            type="button"
            aria-current={tab === item ? "page" : undefined}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="admin-main">
      {message && (
        <p className="admin-message" role="status">
          {message}
        </p>
      )}
      {tab === "pricing" && (
        <section className="panel admin-panel">
          <div className="panel-title">
            <h2>Estimate rules</h2>
            <span>
              {rules?.sample_values ? "Review pricing" : "Live pricing"}
            </span>
          </div>
          <p>
            Customers only see the order total. These rules build that total.
            Confirmed orders keep the price they were placed at.
          </p>
          <ol>
            <li>The customer picks material, colour, quality, infill and quantity. They never pick a printer.</li>
            <li>Each active machine is checked to see if the model fits, including turned on its side. A machine that is too small is skipped.</li>
            <li>Print time is the estimated plastic volume divided by that machine&apos;s throughput. Machine cost is that time multiplied by its rand-per-hour rate.</li>
            <li>The cheapest fitting machine is the one used. If two cost the same, the lower priority number wins.</li>
            <li>Material cost uses the cheapest active package for the material and colour they chose, then adds waste, support and markup.</li>
            <li>Setup is added. If the result is under the minimum charge, the total is lifted to that minimum. VAT is added last.</li>
          </ol>
          <p>
            Open a job on the board to see which printer won and the lines that made the total. Assigning a different production machine later does not change a price the customer has already placed.
          </p>
          {ruleGroups.map((group) => (
            <div className="admin-group" key={group}>
              <h3>{group}</h3>
              <div className="admin-fields">
                {ruleFields.filter((field) => field.group === group).map(({ key, label, scale, suffix }) => (
                  <label key={key}>
                    {label}
                    <span>
                      <input
                        type="number"
                        step={key === "default_lead_days" ? "1" : "0.01"}
                        min="0"
                        value={rules ? Number(rules[key]) / scale : ""}
                        onChange={(event) =>
                          setRules((current) =>
                            current
                              ? {
                                  ...current,
                                  [key]:
                                    Math.round(
                                      Number(event.target.value) * scale * 100,
                                    ) / 100,
                                }
                              : current,
                          )
                        }
                      />
                      <b>{suffix}</b>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button className="btn" onClick={saveRules} disabled={busy || !rules}>
            <Save size={16} /> Save estimate rules
          </button>
        </section>
      )}
      {tab === "scanning" && (
        <section className="panel admin-panel">
          <div className="panel-title">
            <h2>Scan prices</h2>
          </div>
          <p>Prices exclude VAT. The VAT rate on Pricing is added when the customer places the scan order.</p>
          <div className="admin-fields">
            {scanFields.map(({ key, label }) => (
              <label key={key}>
                {label}
                <span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rules ? Number(rules[key]) / 100 : ""}
                    onChange={(event) =>
                      setRules((current) =>
                        current
                          ? {
                              ...current,
                              [key]: Math.round(Number(event.target.value) * 10000) / 100,
                            }
                          : current,
                      )
                    }
                  />
                  <b>R</b>
                </span>
              </label>
            ))}
          </div>
          <button className="btn" onClick={saveScanPrices} disabled={busy || !rules}>
            <Save size={16} /> Save scan prices
          </button>
        </section>
      )}
      {tab === "invoices" && (
        <section className="panel admin-panel">
          <div className="panel-title">
            <h2>Invoice letterhead</h2>
          </div>
          <p>Printed on the invoice when an order is marked paid. A VAT number makes the document a tax invoice.</p>
          <div className="admin-fields">
            {([
              ["invoice_legal_name", "Legal name"],
              ["invoice_phone", "Phone"],
              ["invoice_email", "Email"],
              ["invoice_registration", "Company registration"],
              ["invoice_vat_number", "VAT number"],
            ] as const).map(([key, label]) => (
              <label key={key}>
                {label}
                <input value={letterhead[key]} onChange={(event) => setLetterhead({ ...letterhead, [key]: event.target.value })} />
              </label>
            ))}
            <label className="wide">
              Address
              <textarea rows={2} value={letterhead.invoice_address} onChange={(event) => setLetterhead({ ...letterhead, invoice_address: event.target.value })} />
            </label>
            <label className="wide">
              Bank details
              <textarea rows={2} value={letterhead.invoice_bank} onChange={(event) => setLetterhead({ ...letterhead, invoice_bank: event.target.value })} />
            </label>
          </div>
          <button className="btn" onClick={saveLetterhead} disabled={busy}>
            <Save size={16} /> Save invoice details
          </button>
        </section>
      )}
      {tab === "contact" && (
        <section className="panel admin-panel">
          <div className="panel-title">
            <h2>Contact</h2>
          </div>
          <p>This number is the WhatsApp button on the site. Leave it blank to hide the button.</p>
          <div className="admin-fields contact-fields">
            <label>
              WhatsApp number
              <input
                inputMode="numeric"
                autoComplete="tel"
                placeholder="27821234567"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value.replace(/\D/g, "").slice(0, 15))}
              />
              <small>Country code and digits only. No plus sign or spaces.</small>
            </label>
          </div>
          <button className="btn" onClick={saveWhatsApp} disabled={busy}>
            <Save size={16} /> Save WhatsApp number
          </button>
        </section>
      )}
      {tab === "machines" && (
        <section className="panel admin-panel">
          <div className="panel-title">
            <h2>Machines</h2>
            <span>{machines.length} configured</span>
          </div>
          <p>
            These rates are not a menu for the customer. A quote uses the cheapest active machine that can fit the model. Throughput is how much plastic it is assumed to print per hour. Build size is the limit for fitting the model.
          </p>
          {[...machines, { ...emptyMachine }].map((machine, index) => (
            <div className="admin-rate" key={machine.id ?? `draft-${index}`}>
              <input
                aria-label="Machine name"
                placeholder="Machine name"
                value={machine.name}
                onChange={(e) =>
                  setMachines((current) => {
                    const next = [...current];
                    if (index === current.length)
                      next.push({ ...emptyMachine });
                    next[index] = { ...machine, name: e.target.value };
                    return next;
                  })
                }
              />
              <label>
                R per hour
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={machine.billing_cents_per_hour / 100}
                  onChange={(e) =>
                    setMachines((current) => {
                      const next = [...current];
                      if (index === current.length)
                        next.push({ ...emptyMachine });
                      next[index] = {
                        ...machine,
                        billing_cents_per_hour: Math.round(
                          Number(e.target.value) * 100,
                        ),
                      };
                      return next;
                    })
                  }
                />
              </label>
              <label>
                mm³ per hour
                <input
                  type="number"
                  min="1"
                  value={machine.throughput_mm3_per_hour}
                  onChange={(e) =>
                    setMachines((current) => {
                      const next = [...current];
                      if (index === current.length)
                        next.push({ ...emptyMachine });
                      next[index] = {
                        ...machine,
                        throughput_mm3_per_hour: Number(e.target.value),
                      };
                      return next;
                    })
                  }
                />
              </label>
              <label>
                Build X / Y / Z (mm)
                <span className="admin-triple">
                  {(["build_x_mm", "build_y_mm", "build_z_mm"] as const).map(
                    (key) => (
                      <input
                        key={key}
                        type="number"
                        min="1"
                        value={machine[key]}
                        onChange={(e) =>
                          setMachines((current) => {
                            const next = [...current];
                            if (index === current.length)
                              next.push({ ...emptyMachine });
                            next[index] = {
                              ...machine,
                              [key]: Number(e.target.value),
                            };
                            return next;
                          })
                        }
                      />
                    ),
                  )}
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={machine.active}
                  onChange={(e) => setMachines((current) => current.map((item, i) =>
                    i === index ? { ...item, active: e.target.checked } : item))}
                />
                Available for quotes
              </label>
              <button
                className="btn"
                disabled={busy || !machine.name.trim()}
                onClick={() => saveMachine(machine)}
              >
                {machine.id ? <Save size={16} /> : <Plus size={16} />}{" "}
                {machine.id ? "Save" : "Add"}
              </button>
            </div>
          ))}
        </section>
      )}
      {tab === "materials" && (
        <section className="panel admin-panel">
          <div className="panel-title">
            <h2>Materials</h2>
            <span>{materials.length} configured</span>
          </div>
          <p>
            Only material and colour choices appear to customers. Purchase costs
            stay private.
          </p>
          {[...materials, { ...emptyMaterial }].map((material, index) => (
            <div className="admin-rate" key={material.id ?? `draft-${index}`}>
              <input
                aria-label="Material type"
                placeholder="Type (PLA)"
                value={material.material_type}
                onChange={(e) =>
                  setMaterials((current) => {
                    const next = [...current];
                    if (index === current.length)
                      next.push({ ...emptyMaterial });
                    next[index] = {
                      ...material,
                      material_type: e.target.value,
                    };
                    return next;
                  })
                }
              />
              <input
                aria-label="Colour"
                placeholder="Colour"
                value={material.colour}
                onChange={(e) =>
                  setMaterials((current) => {
                    const next = [...current];
                    if (index === current.length)
                      next.push({ ...emptyMaterial });
                    next[index] = { ...material, colour: e.target.value };
                    return next;
                  })
                }
              />
              <input
                aria-label="Vendor"
                placeholder="Vendor"
                value={material.vendor}
                onChange={(e) =>
                  setMaterials((current) => {
                    const next = [...current];
                    if (index === current.length)
                      next.push({ ...emptyMaterial });
                    next[index] = { ...material, vendor: e.target.value };
                    return next;
                  })
                }
              />
              <label>
                Package g
                <input
                  type="number"
                  min="1"
                  value={material.package_quantity}
                  onChange={(e) =>
                    setMaterials((current) => {
                      const next = [...current];
                      if (index === current.length)
                        next.push({ ...emptyMaterial });
                      next[index] = {
                        ...material,
                        package_quantity: Number(e.target.value),
                      };
                      return next;
                    })
                  }
                />
              </label>
              <label>
                Package cost R
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={material.package_cost_cents / 100}
                  onChange={(e) =>
                    setMaterials((current) => {
                      const next = [...current];
                      if (index === current.length)
                        next.push({ ...emptyMaterial });
                      next[index] = {
                        ...material,
                        package_cost_cents: Math.round(
                          Number(e.target.value) * 100,
                        ),
                      };
                      return next;
                    })
                  }
                />
              </label>
              <label>
                Density g/cm³
                <input
                  type="number"
                  min="0.1"
                  step="0.01"
                  value={material.density_g_cm3}
                  onChange={(e) =>
                    setMaterials((current) => {
                      const next = [...current];
                      if (index === current.length)
                        next.push({ ...emptyMaterial });
                      next[index] = {
                        ...material,
                        density_g_cm3: Number(e.target.value),
                      };
                      return next;
                    })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={material.active}
                  onChange={(e) => setMaterials((current) => current.map((item, i) =>
                    i === index ? { ...item, active: e.target.checked } : item))}
                />
                Available for quotes
              </label>
              <button
                className="btn"
                disabled={
                  busy ||
                  !material.material_type.trim() ||
                  !material.colour.trim() ||
                  !material.vendor.trim()
                }
                onClick={() => saveMaterial(material)}
              >
                {material.id ? <Save size={16} /> : <Plus size={16} />}{" "}
                {material.id ? "Save" : "Add"}
              </button>
            </div>
          ))}
        </section>
      )}
      {tab === "staff" && (
        <section className="panel admin-panel">
          <div className="panel-title">
            <h2>Staff accounts</h2>
            <span>{staff.filter((person) => person.active).length} active</span>
          </div>
          <form className="admin-invite" onSubmit={inviteStaff}>
            <input
              type="email"
              required
              placeholder="staff@example.com"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
            />
            <button className="btn" disabled={busy}>
              <Plus size={16} /> Invite staff
            </button>
          </form>
          {staff.map((person) => (
            <div className="admin-person" key={person.id}>
              <span>
                <b>{person.display_name || person.id}</b>
                <small>{person.active ? "Active" : "Removed"}</small>
              </span>
              {person.active && (
                <button onClick={() => removeStaff(person)} disabled={busy}>
                  <Trash2 size={16} /> Remove access
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      </div>
      </div>
      <dialog className="save-pop" ref={savedDialog} onClose={() => setSaved("")}>
        <h2>Saved</h2>
        <p>{saved}</p>
        <button className="btn" type="button" onClick={() => setSaved("")}>OK</button>
      </dialog>
    </div>
  );
}
