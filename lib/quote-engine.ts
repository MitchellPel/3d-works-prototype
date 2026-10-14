export type ModelMetrics = {
  boundsMm: [number, number, number];
  enclosedVolumeMm3: number | null;
};

export type MachineRate = {
  id: string;
  name: string;
  billing_cents_per_hour: number;
  throughput_mm3_per_hour: number;
  build_x_mm: number;
  build_y_mm: number;
  build_z_mm: number;
  priority: number;
};

export type MaterialRate = {
  id: string;
  package_quantity: number;
  package_cost_cents: number;
  density_g_cm3: number;
};

export type PricingRules = {
  material_markup_percent: number;
  setup_fee_cents: number;
  minimum_charge_cents: number;
  waste_percent: number;
  support_percent: number;
  vat_percent: number;
  delivery_fee_cents: number;
  shell_fraction_percent: number;
  open_mesh_fill_percent: number;
  quality_draft_multiplier: number;
  quality_fine_multiplier: number;
};

export type QuoteEstimate = {
  machineId: string;
  materialId: string;
  geometryMethod: "enclosed-volume" | "bounding-box";
  modelVolumeMm3: number;
  printedVolumeMm3: number;
  printSeconds: number;
  materialGrams: number;
  machineCents: number;
  materialCents: number;
  setupCents: number;
  wasteCents: number;
  supportCents: number;
  vatCents: number;
  deliveryCents: number;
  totalCents: number;
};

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`Invalid ${label}`);
  return value;
}

export function estimateQuote(input: {
  model: ModelMetrics;
  machines: MachineRate[];
  materials: MaterialRate[];
  rules: PricingRules;
  infill: number;
  qty: number;
  quality: string;
}): QuoteEstimate {
  const { model, rules } = input;
  const numericRules: (keyof PricingRules)[] = [
    "material_markup_percent", "setup_fee_cents", "minimum_charge_cents",
    "waste_percent", "support_percent", "vat_percent", "delivery_fee_cents",
    "shell_fraction_percent", "open_mesh_fill_percent",
    "quality_draft_multiplier", "quality_fine_multiplier",
  ];
  for (const label of numericRules) {
    const value = rules[label];
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Invalid pricing rule: ${label}`);
  }
  if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 100)
    throw new Error("Invalid quantity");
  if (!Number.isInteger(input.infill) || input.infill < 10 || input.infill > 80)
    throw new Error("Invalid infill");
  const [x, y, z] = model.boundsMm.map((v) => positive(v, "model dimensions"));
  const boundingVolume = x * y * z;
  positive(boundingVolume, "model volume");
  const useEnclosed =
    model.enclosedVolumeMm3 !== null &&
    model.enclosedVolumeMm3 > 0 &&
    model.enclosedVolumeMm3 <= boundingVolume * 1.05;
  const modelVolumeMm3 = useEnclosed
    ? model.enclosedVolumeMm3!
    : boundingVolume * (rules.open_mesh_fill_percent / 100);
  const infillFraction = input.infill / 100;
  const shellFraction = rules.shell_fraction_percent / 100;
  const printedVolumeMm3 =
    Math.round(
      modelVolumeMm3 *
        (infillFraction + (1 - infillFraction) * shellFraction) *
        input.qty *
        1_000_000,
    ) / 1_000_000;
  positive(printedVolumeMm3, "estimated print volume");

  const qualityMultiplier = input.quality.startsWith("Draft")
    ? rules.quality_draft_multiplier
    : input.quality.startsWith("Fine")
      ? rules.quality_fine_multiplier
      : 1;
  const printVolume = printedVolumeMm3 * positive(qualityMultiplier, "quality multiplier");
  // The part may be turned by 90 degrees on the build plate. Price every
  // machine that fits, using its own throughput and hourly billing rate.
  const orientations: [number, number, number][] = [
    [x, y, z], [x, z, y], [y, x, z],
    [y, z, x], [z, x, y], [z, y, x],
  ];
  const machineHours = (m: MachineRate) =>
    printVolume / positive(m.throughput_mm3_per_hour, "printer throughput");
  const fittingMachines = input.machines
    .filter((m) => orientations.some(([a, b, c]) =>
      a <= m.build_x_mm && b <= m.build_y_mm && c <= m.build_z_mm))
    .sort((a, b) =>
      Math.ceil(machineHours(a) * a.billing_cents_per_hour) -
        Math.ceil(machineHours(b) * b.billing_cents_per_hour) ||
      a.priority - b.priority || a.name.localeCompare(b.name));
  if (!fittingMachines.length)
    throw new Error("Model exceeds configured printer size");
  if (!input.materials.length) throw new Error("Material is not configured");
  const machine = fittingMachines[0];
  const material = [...input.materials].sort(
    (a, b) =>
      a.package_cost_cents / a.package_quantity -
      b.package_cost_cents / b.package_quantity,
  )[0];
  const printHours = machineHours(machine);
  const printSeconds = Math.max(1, Math.ceil(printHours * 3600));
  const modelMaterialGrams =
    (printedVolumeMm3 / 1000) *
    positive(material.density_g_cm3, "material density");
  const supportGrams = modelMaterialGrams * (rules.support_percent / 100);
  const baseMaterialGrams = modelMaterialGrams + supportGrams;
  const materialGrams = baseMaterialGrams * (1 + rules.waste_percent / 100);
  const machineCents = Math.ceil(printHours * machine.billing_cents_per_hour);
  const rawMaterialCents =
    (materialGrams / positive(material.package_quantity, "package quantity")) *
    material.package_cost_cents;
  const wasteCents = Math.ceil(
    ((baseMaterialGrams / material.package_quantity) *
      material.package_cost_cents *
      rules.waste_percent) /
      100,
  );
  const supportCents = Math.ceil(
    (supportGrams / material.package_quantity) * material.package_cost_cents,
  );
  const materialCents = Math.ceil(
    rawMaterialCents * (1 + rules.material_markup_percent / 100),
  );
  const setupCents = rules.setup_fee_cents;
  const beforeTax = Math.max(
    rules.minimum_charge_cents,
    machineCents + materialCents + setupCents,
  );
  const vatCents = Math.round(beforeTax * (rules.vat_percent / 100));
  const totalCents = beforeTax + vatCents + rules.delivery_fee_cents;
  return {
    machineId: machine.id,
    materialId: material.id,
    geometryMethod: useEnclosed ? "enclosed-volume" : "bounding-box",
    modelVolumeMm3,
    printedVolumeMm3,
    printSeconds,
    materialGrams,
    machineCents,
    materialCents,
    setupCents,
    wasteCents,
    supportCents,
    vatCents,
    deliveryCents: rules.delivery_fee_cents,
    totalCents,
  };
}
