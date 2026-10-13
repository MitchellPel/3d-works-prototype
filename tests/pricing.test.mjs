import test from "node:test";
import assert from "node:assert/strict";
import { estimateQuote } from "../lib/quote-engine.ts";
import { measureModel } from "../lib/model-metrics.ts";

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
    rules,
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
