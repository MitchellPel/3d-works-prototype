import { createClient } from "@supabase/supabase-js";

const siteOrigin =
  Deno.env.get("SITE_ORIGIN") ?? "https://mitchellpel.github.io";
const siteUrl =
  Deno.env.get("SITE_URL") ??
  "https://mitchellpel.github.io/3d-works-prototype/";
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
  const verifier = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await verifier.auth.getUser(token);
  if (authError || !auth.user)
    return response(origin, { error: "Sign in required" }, 401);
  const { data: caller } = await admin
    .from("profiles")
    .select("role,active")
    .eq("id", auth.user.id)
    .single();
  if (!caller?.active || caller.role !== "admin")
    return response(origin, { error: "Administrator access required" }, 403);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return response(origin, { error: "Invalid request" }, 400);
  }

  if (payload.action === "invite") {
    const email = String(payload.email ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return response(origin, { error: "Enter a valid email address" }, 400);
    const inviteUrl = new URL(siteUrl);
    inviteUrl.searchParams.set("invite", "1");
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteUrl.toString(),
    });
    if (error || !data.user)
      return response(
        origin,
        { error: error?.message ?? "Invite failed" },
        400,
      );
    const { error: roleError } = await admin.from("profiles").upsert({
      id: data.user.id,
      display_name: email,
      role: "staff",
      active: true,
    });
    if (roleError) return response(origin, { error: roleError.message }, 500);
    return response(origin, { id: data.user.id, email });
  }

  if (payload.action === "remove") {
    const id = String(payload.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || id === auth.user.id)
      return response(origin, { error: "Invalid staff account" }, 400);
    const { data: target } = await admin
      .from("profiles")
      .select("role")
      .eq("id", id)
      .single();
    if (target?.role !== "staff")
      return response(origin, { error: "Staff account not found" }, 404);
    const { error: profileError } = await admin
      .from("profiles")
      .update({ active: false })
      .eq("id", id);
    if (profileError)
      return response(origin, { error: profileError.message }, 500);
    const { error: banError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: "876000h",
    });
    if (banError) return response(origin, { error: banError.message }, 500);
    return response(origin, { removed: true });
  }

  return response(origin, { error: "Unknown action" }, 400);
});
