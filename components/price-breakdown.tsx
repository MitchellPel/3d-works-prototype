import type { Job } from "@/lib/app-data";

const money = (cents: number) => (cents / 100).toLocaleString("en-ZA", { style: "currency", currency: "ZAR" });

export function PriceBreakdown({ summary }: { summary: Job["pricingSummary"] }) {
  if (!summary) return null;
  return <div className="price-breakdown">
    <p><b>Automatically selected printer: {summary.machineName}</b><br />
      Selected from active printers that fit your model using their configured hourly rates and throughput.
    </p>
    {summary.boundsMm && <p>Model: {summary.boundsMm.map((v) => v.toFixed(1)).join(" × ")} mm</p>}
    <dl>
      <div><dt>Printer time · {(summary.printSeconds / 3600).toFixed(2)} estimated hours</dt><dd>{money(summary.machineCents)}</dd></div>
      <div><dt>Material · {summary.materialGrams.toFixed(1)} estimated grams, including support and waste</dt><dd>{money(summary.materialCents)}</dd></div>
      <div><dt>Setup</dt><dd>{money(summary.setupCents)}</dd></div>
      {summary.minimumAdjustmentCents > 0 && <div><dt>Minimum order adjustment</dt><dd>{money(summary.minimumAdjustmentCents)}</dd></div>}
      <div><dt>VAT</dt><dd>{money(summary.vatCents)}</dd></div>
      <div className="price-total"><dt>Total · collection</dt><dd>{money(summary.totalCents)}</dd></div>
    </dl>
    {summary.minimumAdjustmentCents > 0 && <p>These print costs are below the studio&apos;s minimum order charge. Material changes can change the breakdown while the total stays at the minimum.</p>}
  </div>;
}
