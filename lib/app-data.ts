export type Stage =
  | "Submitted"
  | "Quoted"
  | "Approved"
  | "Printing"
  | "Post-Processing"
  | "Ready for Collection"
  | "Completed"
  | "Cancelled";

export type Profile = {
  id: string;
  display_name: string;
  role: "customer" | "staff" | "admin";
  active: boolean;
};

export type Job = {
  id: string;
  code: string;
  customerId: string;
  customer: string;
  email: string;
  file: string;
  filePath: string;
  material: string;
  colour: string;
  quality: string;
  infill: number;
  qty: number;
  due: string;
  price: number | null;
  status: Stage;
  progress: number;
  note: string;
  customerNote: string;
  assignedStaffId: string | null;
  assignedMachineId: string | null;
  pricingError: string | null;
  pricingProvisional: boolean;
  archived: boolean;
  kind: string;
  dropoff: string | null;
  geometryGuess: boolean;
  guessAccepted: boolean;
  paid: boolean;
  billCompany: string;
  billAddress: string;
  billVat: string;
  billRegistration: string;
  billEmail: string;
  billPo: string;
  invoice: Invoice | null;
  pricingSummary: {
    machineName: string;
    geometryMethod?: "enclosed-volume" | "bounding-box";
    boundsMm?: number[];
    printSeconds: number;
    materialGrams: number;
    machineCents: number;
    materialCents: number;
    setupCents: number;
    minimumAdjustmentCents: number;
    vatCents: number;
    totalCents: number;
  } | null;
  activity: string[];
};

export type InvoiceParty = {
  legal_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  registration?: string;
  vat_number?: string;
  bank?: string;
  name?: string;
  company?: string;
  vat?: string;
  accounts_email?: string;
  po?: string;
};

export type Invoice = {
  number: string;
  issued: string;
  heading: string;
  studio: InvoiceParty;
  buyer: InvoiceParty;
  description: string;
  exVatCents: number;
  vatPercent: number;
  vatCents: number;
  totalCents: number;
};

export const stages: Stage[] = [
  "Submitted",
  "Quoted",
  "Approved",
  "Printing",
  "Post-Processing",
  "Ready for Collection",
  "Completed",
  "Cancelled",
];
export const productionStages: Stage[] = stages.filter((stage) => stage !== "Cancelled");

// Customers can read these columns. The cost breakdown is not one of them.
export const jobColumns =
  "id,job_number,customer_id,customer_name,customer_email,file_path,file_name,material,colour,quality,infill,qty,customer_note,staff_note,status,progress,price_cents,due_date,quoted_at,approved_at,pricing_error,pricing_provisional,created_at,updated_at,assigned_staff_id,assigned_machine_id,archived_at";
export const jobGuardColumns = "geometry_guess,guess_accepted_at,paid_at,kind,dropoff_at,bill_company,bill_address,bill_vat,bill_registration,bill_email,bill_po";

export function toJob(row: Record<string, unknown>, activity: string[]): Job {
  return {
    id: String(row.id),
    code: `CW-${String(1000 + Number(row.job_number))}`,
    customerId: String(row.customer_id),
    customer: String(row.customer_name),
    email: String(row.customer_email),
    file: String(row.file_name),
    filePath: String(row.file_path),
    material: String(row.material),
    colour: String(row.colour),
    quality: String(row.quality),
    infill: Number(row.infill),
    qty: Number(row.qty),
    due: row.due_date ? String(row.due_date) : "To be confirmed",
    price: row.price_cents === null ? null : Number(row.price_cents) / 100,
    status: String(row.status) as Stage,
    progress: Number(row.progress),
    note: String(row.staff_note ?? ""),
    customerNote: String(row.customer_note ?? ""),
    assignedStaffId: row.assigned_staff_id ? String(row.assigned_staff_id) : null,
    assignedMachineId: row.assigned_machine_id ? String(row.assigned_machine_id) : null,
    pricingError: row.pricing_error ? String(row.pricing_error) : null,
    pricingProvisional: Boolean(row.pricing_provisional),
    archived: Boolean(row.archived_at),
    kind: String(row.kind ?? "print"),
    dropoff: row.dropoff_at ? String(row.dropoff_at) : null,
    geometryGuess: Boolean(row.geometry_guess),
    guessAccepted: Boolean(row.guess_accepted_at),
    paid: Boolean(row.paid_at),
    billCompany: String(row.bill_company ?? ""),
    billAddress: String(row.bill_address ?? ""),
    billVat: String(row.bill_vat ?? ""),
    billRegistration: String(row.bill_registration ?? ""),
    billEmail: String(row.bill_email ?? ""),
    billPo: String(row.bill_po ?? ""),
    invoice: null,
    pricingSummary: row.pricing_summary ? row.pricing_summary as Job["pricingSummary"] : null,
    activity,
  };
}

export function toInvoice(row: Record<string, unknown>): Invoice {
  return {
    number: `INV-${1000 + Number(row.invoice_number)}`,
    issued: String(row.issued_at),
    heading: String(row.heading),
    studio: (row.studio ?? {}) as InvoiceParty,
    buyer: (row.buyer ?? {}) as InvoiceParty,
    description: String(row.description),
    exVatCents: Number(row.ex_vat_cents),
    vatPercent: Number(row.vat_percent),
    vatCents: Number(row.vat_cents),
    totalCents: Number(row.total_cents),
  };
}
