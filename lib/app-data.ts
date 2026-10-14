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
  activity: string[];
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
    activity,
  };
}
