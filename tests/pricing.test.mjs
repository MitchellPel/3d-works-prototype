import test from "node:test";
import assert from "node:assert/strict";
import { estimateQuote } from "../lib/quote-engine.ts";
import { measureModel } from "../lib/model-metrics.ts";
import { zipSync, strToU8 } from "fflate";

const machine = {
  id: "machine-1",
  name: "Test printer",
  billing_cents_per_hour: 10000,
  throughput_mm3_per_hour: 1000,
  build_x_mm: 100,
  build_y_mm: 100,
  build_z_mm: 100,
  priority: 1,
};
const material = {
  id: "material-1",
  package_quantity: 1000,
  package_cost_cents: 20000,
  density_g_cm3: 1,
};
const rules = {
  material_markup_percent: 25,
  setup_fee_cents: 5000,
  minimum_charge_cents: 15000,
  waste_percent: 10,
  support_percent: 10,
  vat_percent: 15,
  delivery_fee_cents: 0,
  shell_fraction_percent: 20,
  open_mesh_fill_percent: 35,
  quality_draft_multiplier: 0.8,
  quality_fine_multiplier: 1.5,
};

test("backend quote accounts for volume, quantity, material, machine, minimum and VAT", () => {
  const quote = estimateQuote({
    model: { boundsMm: [10, 10, 10], enclosedVolumeMm3: 1000 },
    machines: [machine],
    materials: [material],
    rules: { ...rules, id: true, sample_values: true },
    infill: 20,
    qty: 2,
    quality: "Standard · 0.20 mm",
  });
  assert.equal(quote.printedVolumeMm3, 720);
  assert.equal(quote.printSeconds, 2592);
  assert.equal(quote.machineCents, 7200);
  assert.equal(quote.materialGrams, 0.8712);
  assert.equal(quote.supportCents, 2);
  assert.equal(quote.setupCents, 5000);
  assert.equal(quote.totalCents, 17250);
});

test("rejects models larger than available machines", () => {
  assert.throws(
    () =>
      estimateQuote({
        model: { boundsMm: [200, 10, 10], enclosedVolumeMm3: null },
        machines: [machine],
        materials: [material],
        rules,
        infill: 20,
        qty: 1,
        quality: "Standard · 0.20 mm",
      }),
    /exceeds configured printer size/,
  );
});

test("automatically quotes the least costly fitting machine", () => {
  const small = { ...machine, id: "small", name: "Small", build_x_mm: 80,
    priority: 100, billing_cents_per_hour: 9000, throughput_mm3_per_hour: 1000 };
  const large = { ...machine, id: "large", name: "Large", build_x_mm: 250,
    priority: 1, billing_cents_per_hour: 18000, throughput_mm3_per_hour: 1000 };
  const base = { machines: [large, small], materials: [material], rules,
    infill: 20, qty: 1, quality: "Standard" };
  const smallPart = estimateQuote({ ...base,
    model: { boundsMm: [50, 10, 10], enclosedVolumeMm3: 5000 } });
  const largePart = estimateQuote({ ...base,
    model: { boundsMm: [200, 10, 10], enclosedVolumeMm3: 20000 } });
  assert.equal(smallPart.machineId, "small");
  assert.equal(largePart.machineId, "large");
  assert.ok(largePart.machineCents > smallPart.machineCents);
});

test("considers right-angle orientation and actual machine throughput", () => {
  const fast = { ...machine, id: "fast", name: "Fast", build_x_mm: 100,
    build_y_mm: 60, build_z_mm: 50, priority: 100,
    billing_cents_per_hour: 20000, throughput_mm3_per_hour: 4000 };
  const slow = { ...machine, id: "slow", name: "Slow", build_x_mm: 100,
    build_y_mm: 60, build_z_mm: 50, priority: 1,
    billing_cents_per_hour: 10000, throughput_mm3_per_hour: 1000 };
  const quote = estimateQuote({ model: { boundsMm: [50, 90, 40], enclosedVolumeMm3: 10000 },
    machines: [slow, fast], materials: [material], rules,
    infill: 20, qty: 1, quality: "Standard" });
  assert.equal(quote.machineId, "fast");
});

test("fine quality and support allowance increase the estimate", () => {
  const input = {
    model: { boundsMm: [10, 10, 10], enclosedVolumeMm3: 1000 },
    machines: [machine],
    materials: [material],
    rules: { ...rules, minimum_charge_cents: 0 },
    infill: 50,
    qty: 1,
  };
  const draft = estimateQuote({ ...input, quality: "Draft · 0.28 mm" });
  const fine = estimateQuote({ ...input, quality: "Fine · 0.12 mm" });
  const noSupport = estimateQuote({
    ...input,
    quality: "Fine · 0.12 mm",
    rules: { ...input.rules, support_percent: 0 },
  });
  assert.ok(fine.machineCents > draft.machineCents);
  assert.ok(fine.totalCents > noSupport.totalCents);
});

test("reads a closed ASCII STL in millimetres", () => {
  const faces = [
    [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
    ],
    [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ],
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  ];
  const content =
    "solid tetra\n" +
    faces
      .map(
        (face) =>
          "facet normal 0 0 0\nouter loop\n" +
          face.map((point) => "vertex " + point.join(" ") + "\n").join("") +
          "endloop\nendfacet\n",
      )
      .join("") +
    "endsolid tetra";
  const metrics = measureModel(new TextEncoder().encode(content), "tetra.stl");
  assert.deepEqual(metrics.boundsMm, [1, 1, 1]);
  assert.ok(Math.abs(metrics.enclosedVolumeMm3 - 1 / 6) < 1e-8);
});

test("uses bounding-box fallback for an open mesh", () => {
  const open =
    "solid open\nfacet normal 0 0 0\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 10\nendloop\nendfacet\nendsolid open";
  const metrics = measureModel(new TextEncoder().encode(open), "open.stl");
  assert.deepEqual(metrics.boundsMm, [10, 10, 10]);
  assert.equal(metrics.enclosedVolumeMm3, null);
});

test("material rates change the sell price above the minimum and explain identical small quotes", () => {
  const input = { machines: [machine], materials: [material], rules, infill: 20, qty: 1, quality: "Standard" };
  const expensive = { ...material, id: "premium", package_cost_cents: 150000 };
  const small = { boundsMm: [10, 10, 10], enclosedVolumeMm3: 1000 };
  const cheapSmall = estimateQuote({ ...input, model: small });
  const premiumSmall = estimateQuote({ ...input, model: small, materials: [expensive] });
  assert.notEqual(cheapSmall.materialCents, premiumSmall.materialCents);
  assert.equal(cheapSmall.totalCents, premiumSmall.totalCents);
  assert.ok(cheapSmall.minimumAdjustmentCents > premiumSmall.minimumAdjustmentCents);
  const large = { boundsMm: [30, 30, 30], enclosedVolumeMm3: 27000 };
  const cheapLarge = estimateQuote({ ...input, model: large });
  const premiumLarge = estimateQuote({ ...input, model: large, materials: [expensive] });
  assert.ok(premiumLarge.totalCents > cheapLarge.totalCents);
  assert.equal(cheapLarge.minimumAdjustmentCents, 0);
  assert.equal(cheapLarge.totalCents, cheapLarge.machineCents + cheapLarge.materialCents + cheapLarge.setupCents + cheapLarge.vatCents);
});

const tetraMesh = `<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/></triangles></mesh>`;
const package3mf = (root, extra = {}) => zipSync({
  "_rels/.rels": strToU8('<Relationships><Relationship Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/assembly.model"/></Relationships>'),
  "3D/assembly.model": strToU8(root), ...extra,
});

test("3MF production components resolve separate model files, scoped IDs, units and transforms", () => {
  const file = package3mf(`<model unit="millimeter"><resources><object id="1"><components><component objectid="1" p:path="/3D/Objects/a.model" transform="1 0 0 0 1 0 0 0 1 10 0 0"/><component objectid="1" p:path="/3D/Objects/b.model" transform="1 0 0 0 1 0 0 0 1 30 0 0"/></components></object></resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 100 0 0"/></build></model>`, {
    "3D/Objects/a.model": strToU8(`<model unit="millimeter"><resources><object id="1">${tetraMesh}</object></resources></model>`),
    "3D/Objects/b.model": strToU8(`<model unit="centimeter"><resources><object id="1">${tetraMesh}</object></resources><build><item objectid="999"/></build></model>`),
  });
  const result = measureModel(file, "production.3mf");
  assert.deepEqual(result.boundsMm, [30, 10, 10]);
  assert.ok(Math.abs(result.enclosedVolumeMm3 - 1001 / 6) < 1e-6);
});

test("3MF build items support external paths and ignore non-printable items", () => {
  const file = package3mf('<model><resources/><build><item objectid="1" p:path="/3D/Objects/a.model"/><item objectid="999" printable="0"/></build></model>', {
    "3D/Objects/a.model": strToU8(`<model><resources><object id="1">${tetraMesh}</object></resources></model>`),
  });
  assert.deepEqual(measureModel(file, "build.3mf").boundsMm, [1, 1, 1]);
});

test("3MF rejects missing files and recursive components instead of calculating a partial price", () => {
  const missing = package3mf('<model><resources/><build><item objectid="1" p:path="/3D/missing.model"/></build></model>');
  assert.throws(() => measureModel(missing, "missing.3mf"), /missing model file/);
  const cycle = package3mf('<model><resources><object id="1"><components><component objectid="1"/></components></object></resources><build><item objectid="1"/></build></model>');
  assert.throws(() => measureModel(cycle, "cycle.3mf"), /circular/);
});
