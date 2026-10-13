"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
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
}[] = [
  {
    key: "material_markup_percent",
    label: "Material markup",
    scale: 1,
    suffix: "%",
  },
  { key: "waste_percent", label: "Material waste", scale: 1, suffix: "%" },
  { key: "support_percent", label: "Support allowance", scale: 1, suffix: "%" },
  {
    key: "quality_draft_multiplier",
    label: "Draft time multiplier",
    scale: 1,
    suffix: "×",
  },
  {
    key: "quality_fine_multiplier",
    label: "Fine time multiplier",
    scale: 1,
    suffix: "×",
  },
  {
    key: "shell_fraction_percent",
    label: "Shell share estimate",
    scale: 1,
    suffix: "%",
  },
  {
    key: "open_mesh_fill_percent",
    label: "Open mesh fallback volume",
    scale: 1,
    suffix: "%",
  },
  { key: "setup_fee_cents", label: "Setup fee", scale: 100, suffix: "R" },
  {
    key: "minimum_charge_cents",
    label: "Minimum charge",
    scale: 100,
    suffix: "R",
  },
  { key: "vat_percent", label: "VAT", scale: 1, suffix: "%" },
  {
    key: "delivery_fee_cents",
    label: "Default delivery fee",
    scale: 100,
    suffix: "R",
  },
];
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
    "pricing" | "machines" | "materials" | "staff"
  >("pricing");
  const [rules, setRules] = useState<Rules | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [invite, setInvite] = useState("");
  const [message, setMessage] = useState("");
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
    if (ruleResult.data) setRules(ruleResult.data as Rules);
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
    setMessage(
      error
        ? error.message
        : "Pricing rules saved. Future estimates use these values.",
    );
    setBusy(false);
    if (!error) void reload();
  }

  async function saveMachine(machine: Machine) {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("machine_rates").upsert(machine);
    setMessage(error ? error.message : "Machine saved.");
    setBusy(false);
    if (!error) void reload();
  }

  async function saveMaterial(material: Material) {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("material_rates").upsert(material);
    setMessage(error ? error.message : "Material saved.");
    setBusy(false);
    if (!error) void reload();
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

  return (
    <main className="board-page admin-page">
      <div className="staff-title">
        <div>
          <span className="overline">OPERATIONS / SETTINGS</span>
          <h1>Administration</h1>
          <p>Set pricing inputs and manage staff access.</p>
        </div>
      </div>
      <div
        className="admin-tabs"
        role="tablist"
        aria-label="Administration sections"
      >
        {(["pricing", "machines", "materials", "staff"] as const).map(
          (item) => (
            <button
              key={item}
              role="tab"
              aria-selected={tab === item}
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ),
        )}
      </div>
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
              {rules?.sample_values
                ? "Sample values — review before launch"
                : "Client settings"}
            </span>
          </div>
          <p>
            These settings affect future quotes. Existing quotes keep their
            original price.
          </p>
          <div className="admin-fields">
            {ruleFields.map(({ key, label, scale, suffix }) => (
              <label key={key}>
                {label}
                <span>
                  <input
                    type="number"
                    step="0.01"
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
          <button className="btn" onClick={saveRules} disabled={busy || !rules}>
            <Save size={16} /> Save estimate rules
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
            Hourly billing rates come from the private costing workbook.
            Throughput and build size are starting assumptions that the client
            can refine.
          </p>
          {[...machines, { ...emptyMachine }].map((machine, index) => (
            <div className="admin-rate" key={machine.id ?? "new"}>
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
            <div className="admin-rate" key={material.id ?? "new"}>
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
    </main>
  );
}
