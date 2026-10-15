export const scanDefaults = {
  "scan-file": 25000,
  "scan-print": 9900,
} as const;

export const scanServices = [
  { kind: "scan-file", label: "Scan to an STL file" },
  { kind: "scan-print", label: "Scan an object to print" },
] as const;

export type ScanKind = (typeof scanServices)[number]["kind"];

export function scanTotalCents(exVatCents: number, vatPercent = 15) {
  return exVatCents + Math.round((exVatCents * vatPercent) / 100);
}
