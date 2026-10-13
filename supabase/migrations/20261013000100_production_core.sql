-- Public source contains structure only. Import the client's cost workbook into
-- these private tables after provisioning the Supabase project.
create extension if not exists pgcrypto;

create type public.app_role as enum ('customer', 'staff', 'admin');
create type public.job_stage as enum (
  'Submitted', 'Quoted', 'Approved', 'Printing',
  'Post-Processing', 'Ready for Collection', 'Completed'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role public.app_role not null default 'customer',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create function public.create_profile_for_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.create_profile_for_user();

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and role in ('staff', 'admin')
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and role = 'admin'
  );
$$;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_number bigint generated always as identity unique,
  customer_id uuid not null references public.profiles(id),
  customer_name text not null,
  customer_email text not null,
  file_path text not null unique,
  file_name text not null,
  material text not null,
  colour text not null,
  quality text not null,
  infill integer not null check (infill between 10 and 80),
  qty integer not null check (qty between 1 and 100),
  customer_note text not null default '',
  staff_note text not null default '',
  status public.job_stage not null default 'Submitted',
  progress integer not null default 0 check (progress between 0 and 100),
  price_cents integer check (price_cents is null or price_cents >= 0),
  due_date date,
  quoted_at timestamptz,
  approved_at timestamptz,
  pricing_error text,
  pricing_provisional boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_file_path check (split_part(file_path, '/', 1) = customer_id::text),
  constraint quoted_has_price check (status not in ('Quoted', 'Approved', 'Printing', 'Post-Processing', 'Ready for Collection', 'Completed') or price_cents is not null)
);
create index jobs_customer_created_idx on public.jobs(customer_id, created_at desc);
create index jobs_status_created_idx on public.jobs(status, created_at desc);

create function public.on_job_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.customer_email := (select email from auth.users where id = new.customer_id);
  new.status := 'Submitted';
  new.progress := 0;
  new.price_cents := null;
  new.staff_note := '';
  new.due_date := null;
  new.quoted_at := null;
  new.approved_at := null;
  new.pricing_error := null;
  new.pricing_provisional := true;
  return new;
end;
$$;
create trigger jobs_before_insert before insert on public.jobs
for each row execute function public.on_job_insert();

create function public.touch_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger jobs_before_update before update on public.jobs
for each row execute function public.touch_job();

create table public.job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  message text not null,
  public_visible boolean not null default true,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index job_events_job_time_idx on public.job_events(job_id, created_at desc);

create function public.log_job_stage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_events(job_id, message) values (new.id, 'Request submitted');
  elsif new.status is distinct from old.status then
    insert into public.job_events(job_id, message, actor_id)
    values (new.id, 'Moved to ' || new.status::text, auth.uid());
  end if;
  return null;
end;
$$;
create trigger jobs_after_insert after insert on public.jobs
for each row execute function public.log_job_stage();
create trigger jobs_after_stage_update after update of status on public.jobs
for each row execute function public.log_job_stage();

create table public.machine_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  process text not null check (process in ('FDM', 'Resin')),
  billing_cents_per_hour integer not null check (billing_cents_per_hour >= 0),
  throughput_mm3_per_hour numeric(12,2) not null default 12000 check (throughput_mm3_per_hour > 0),
  build_x_mm numeric(8,2) not null default 220 check (build_x_mm > 0),
  build_y_mm numeric(8,2) not null default 220 check (build_y_mm > 0),
  build_z_mm numeric(8,2) not null default 220 check (build_z_mm > 0),
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.material_rates (
  id uuid primary key default gen_random_uuid(),
  vendor text not null,
  colour text not null,
  material_type text not null,
  process text not null check (process in ('FDM', 'Resin')),
  package_quantity numeric(12,3) not null check (package_quantity > 0),
  package_cost_cents integer not null check (package_cost_cents >= 0),
  density_g_cm3 numeric(6,3) not null default 1.24 check (density_g_cm3 > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pricing_rules (
  id boolean primary key default true check (id),
  material_markup_percent numeric(7,2) not null default 25 check (material_markup_percent between 0 and 1000),
  setup_fee_cents integer not null default 5000 check (setup_fee_cents >= 0),
  minimum_charge_cents integer not null default 15000 check (minimum_charge_cents >= 0),
  waste_percent numeric(7,2) not null default 10 check (waste_percent between 0 and 100),
  support_percent numeric(7,2) not null default 10 check (support_percent between 0 and 100),
  vat_percent numeric(7,2) not null default 15 check (vat_percent between 0 and 100),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  shell_fraction_percent numeric(7,2) not null default 20 check (shell_fraction_percent between 0 and 100),
  open_mesh_fill_percent numeric(7,2) not null default 35 check (open_mesh_fill_percent between 1 and 100),
  quality_draft_multiplier numeric(7,2) not null default 0.80 check (quality_draft_multiplier > 0),
  quality_fine_multiplier numeric(7,2) not null default 1.50 check (quality_fine_multiplier > 0),
  updated_at timestamptz not null default now(),
  -- These are sample values. The owner must approve the final values.
  sample_values boolean not null default true
);
insert into public.pricing_rules default values;

create table public.quote_calculations (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  machine_id uuid not null references public.machine_rates(id),
  material_id uuid not null references public.material_rates(id),
  print_seconds integer not null check (print_seconds > 0),
  material_grams numeric(12,3) not null check (material_grams > 0),
  geometry_method text not null,
  model_volume_mm3 numeric(14,2) not null,
  printed_volume_mm3 numeric(14,2) not null,
  machine_cents integer not null,
  material_cents integer not null,
  setup_cents integer not null,
  waste_cents integer not null,
  support_cents integer not null,
  vat_cents integer not null,
  delivery_cents integer not null,
  total_cents integer not null,
  calculated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.job_events enable row level security;
alter table public.machine_rates enable row level security;
alter table public.material_rates enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.quote_calculations enable row level security;

create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_staff()));
create policy jobs_read on public.jobs for select to authenticated
using (customer_id = (select auth.uid()) or (select public.is_staff()));
create policy jobs_customer_create on public.jobs for insert to authenticated
with check (customer_id = (select auth.uid()) and exists (
  select 1 from public.profiles where id = (select auth.uid()) and active
));
create policy jobs_staff_update on public.jobs for update to authenticated
using ((select public.is_staff())) with check ((select public.is_staff()));
revoke update on public.jobs from authenticated;
grant update (status, progress, due_date, staff_note) on public.jobs to authenticated;
create policy events_read on public.job_events for select to authenticated
using ((select public.is_staff()) or (
  public_visible and exists (
    select 1 from public.jobs where jobs.id = job_id and jobs.customer_id = (select auth.uid())
  )
));
create policy events_staff_create on public.job_events for insert to authenticated
with check ((select public.is_staff()) and actor_id = (select auth.uid()));
create policy machines_admin_read on public.machine_rates for select to authenticated
using ((select public.is_admin()));
create policy materials_admin_read on public.material_rates for select to authenticated
using ((select public.is_admin()));
create policy rules_admin_read on public.pricing_rules for select to authenticated
using ((select public.is_admin()));
create policy calculations_admin_read on public.quote_calculations for select to authenticated
using ((select public.is_admin()));

-- Admin controls operating data through the dashboard. Cost rows never reach
-- customer queries because RLS grants only staff access.
create policy machines_admin_insert on public.machine_rates for insert to authenticated
with check ((select public.is_admin()));
create policy machines_admin_update on public.machine_rates for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy machines_admin_delete on public.machine_rates for delete to authenticated
using ((select public.is_admin()));
create policy materials_admin_insert on public.material_rates for insert to authenticated
with check ((select public.is_admin()));
create policy materials_admin_update on public.material_rates for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy materials_admin_delete on public.material_rates for delete to authenticated
using ((select public.is_admin()));
create policy rules_admin_update on public.pricing_rules for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

-- Customer approval is the only customer-authorized change to an existing job.
create function public.approve_quote(target_job_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs set status = 'Approved', approved_at = now()
  where id = target_job_id and customer_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and active)
    and status = 'Quoted' and price_cents is not null
    and not pricing_provisional;
  if not found then
    raise exception 'Quote unavailable for approval';
  end if;
end;
$$;
revoke all on function public.approve_quote(uuid) from public;
grant execute on function public.approve_quote(uuid) to authenticated;

-- Publish availability without revealing the purchase cost catalogue.
create function public.list_material_options()
returns table(material_type text, colour text)
language sql stable security definer set search_path = '' as $$
  select distinct m.material_type, m.colour
  from public.material_rates m where m.active and m.process = 'FDM'
  order by 1, 2;
$$;
revoke all on function public.list_material_options() from public;
grant execute on function public.list_material_options() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('models', 'models', false, 52428800)
on conflict (id) do nothing;
create policy models_customer_upload on storage.objects for insert to authenticated
with check (bucket_id = 'models' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy models_read on storage.objects for select to authenticated
using (bucket_id = 'models' and (
  (storage.foldername(name))[1] = (select auth.uid()::text)
  or (select public.is_staff())
));
