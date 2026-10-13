import { createClient } from "@supabase/supabase-js";
import { measureModel } from "../../../lib/model-metrics.ts";
import { estimateQuote } from "../../../lib/quote-engine.ts";

const siteOrigin =
  Deno.env.get("SITE_ORIGIN") ?? "https://mitchellpel.github.io";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const publishableKey =
  JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey =
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function response(origin: string, data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin":
        origin === siteOrigin || origin === "http://localhost:3000"
          ? origin
          : siteOrigin,
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin",
    },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? siteOrigin;
  if (request.method === "OPTIONS") return response(origin, {});
  if (request.method !== "POST")
    return response(origin, { error: "Method not allowed" }, 405);
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token) return response(origin, { error: "Sign in required" }, 401);
  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser(token);
  if (authError || !auth.user)
    return response(origin, { error: "Sign in required" }, 401);

  let jobId: string;
  try {
    const payload = await request.json();
    jobId = String(payload.jobId);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        jobId,
      )
    )
      throw new Error("Invalid job ID");
  } catch {
    return response(origin, { error: "Invalid job ID" }, 400);
  }

  const { data: job, error: jobError } = await admin
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (jobError || !job || job.customer_id !== auth.user.id)
    return response(origin, { error: "Job not found" }, 404);
  if (job.price_cents !== null && !job.pricing_provisional)
    return response(origin, {
      priceCents: job.price_cents,
      status: job.status,
    });
  if (job.status !== "Submitted" && job.status !== "Quoted")
    return response(origin, { error: "Order can no longer be repriced" }, 409);

  try {
    const [{ data: file, error: fileError }, machines, materials, rules] =
      await Promise.all([
        admin.storage.from("models").download(job.file_path),
        admin
          .from("machine_rates")
          .select("*")
          .eq("active", true)
          .eq("process", "FDM"),
        admin
          .from("material_rates")
          .select("*")
          .eq("active", true)
          .eq("process", "FDM")
          .eq("material_type", job.material)
          .eq("colour", job.colour),
        admin.from("pricing_rules").select("*").eq("id", true).single(),
      ]);
    if (fileError || !file) throw new Error("Uploaded model could not be read");
    if (machines.error || materials.error || rules.error || !rules.data)
      throw new Error("Pricing data is unavailable");
    const metrics = measureModel(
      new Uint8Array(await file.arrayBuffer()),
      job.file_name,
    );
    const estimate = estimateQuote({
      model: metrics,
      machines: machines.data ?? [],
      materials: materials.data ?? [],
      rules: rules.data,
      infill: job.infill,
      qty: job.qty,
      quality: job.quality,
    });
    const { error: calcError } = await admin.from("quote_calculations").upsert({
      job_id: job.id,
      machine_id: estimate.machineId,
      material_id: estimate.materialId,
      print_seconds: estimate.printSeconds,
      material_grams: estimate.materialGrams,
      geometry_method: estimate.geometryMethod,
      model_volume_mm3: estimate.modelVolumeMm3,
      printed_volume_mm3: estimate.printedVolumeMm3,
      machine_cents: estimate.machineCents,
      material_cents: estimate.materialCents,
      setup_cents: estimate.setupCents,
      waste_cents: estimate.wasteCents,
      support_cents: estimate.supportCents,
      vat_cents: estimate.vatCents,
      delivery_cents: estimate.deliveryCents,
      total_cents: estimate.totalCents,
    });
    if (calcError) throw calcError;
    const { error: updateError } = await admin
      .from("jobs")
      .update({
        status: "Quoted",
        price_cents: estimate.totalCents,
        quoted_at: new Date().toISOString(),
        pricing_error: null,
        pricing_provisional: Boolean(rules.data.sample_values),
      })
      .eq("id", job.id)
      .in("status", ["Submitted", "Quoted"]);
    if (updateError) throw updateError;
    return response(origin, {
      priceCents: estimate.totalCents,
      status: "Quoted",
      provisional: Boolean(rules.data.sample_values),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Pricing failed";
    await admin
      .from("jobs")
      .update({ pricing_error: reason.slice(0, 300) })
      .eq("id", job.id);
    return response(origin, { error: reason }, 422);
  }
});
