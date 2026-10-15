-- Company invoices. Letterhead is admin-owned. Buyer details are saved on the order.
-- Marking an order paid freezes both into an invoice.
alter table public.pricing_rules
  add column if not exists invoice_legal_name text not null default '',
  add column if not exists invoice_address text not null default '',
  add column if not exists invoice_phone text not null default '',
  add column if not exists invoice_email text not null default '',
  add column if not exists invoice_registration text not null default '',
  add column if not exists invoice_vat_number text not null default '',
  add column if not exists invoice_bank text not null default '';

alter table public.jobs
  add column if not exists bill_company text not null default '',
  add column if not exists bill_address text not null default '',
  add column if not exists bill_vat text not null default '',
  add column if not exists bill_registration text not null default '',
  add column if not exists bill_email text not null default '',
  add column if not exists bill_po text not null default '';

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  invoice_number bigint generated always as identity,
  issued_at timestamptz not null default now(),
  heading text not null,
  studio jsonb not null,
  buyer jsonb not null,
  description text not null,
  ex_vat_cents integer not null,
  vat_percent numeric(7,2) not null,
  vat_cents integer not null,
  total_cents integer not null
);
alter table public.invoices enable row level security;
grant select on public.invoices to authenticated;
drop policy if exists invoices_read on public.invoices;
create policy invoices_read on public.invoices for select to authenticated
using (
  (select app_private.is_staff())
  or exists (
    select 1 from public.jobs
    where jobs.id = invoices.job_id and jobs.customer_id = (select auth.uid())
  )
);

create or replace function public.save_order_billing(
  target_job_id uuid,
  company text,
  address text,
  vat text,
  registration text,
  accounts_email text,
  po text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if not exists (
    select 1 from public.jobs
    where id = target_job_id
      and (customer_id = uid or (select app_private.is_staff()))
  ) then
    raise exception 'Order not found';
  end if;
  if exists (select 1 from public.invoices where job_id = target_job_id) then
    raise exception 'Invoice already issued';
  end if;
  update public.jobs set
    bill_company = left(trim(coalesce(company, '')), 160),
    bill_address = left(trim(coalesce(address, '')), 300),
    bill_vat = left(trim(coalesce(vat, '')), 40),
    bill_registration = left(trim(coalesce(registration, '')), 40),
    bill_email = left(trim(coalesce(accounts_email, '')), 120),
    bill_po = left(trim(coalesce(po, '')), 40)
  where id = target_job_id;
end;
$$;
revoke all on function public.save_order_billing(uuid, text, text, text, text, text, text) from public;
grant execute on function public.save_order_billing(uuid, text, text, text, text, text, text) to authenticated;

create or replace function public.set_job_paid(target_job_id uuid, paid boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  job public.jobs;
  rules public.pricing_rules;
  vat_cents integer;
begin
  if not (select app_private.is_staff()) then
    raise exception 'Staff access required';
  end if;
  select * into job from public.jobs where id = target_job_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if paid and job.price_cents is null then
    raise exception 'Order has no price';
  end if;
  update public.jobs
  set paid_at = case when paid then coalesce(paid_at, now()) else null end
  where id = target_job_id;
  if not paid or exists (select 1 from public.invoices where job_id = target_job_id) then
    return;
  end if;
  select * into rules from public.pricing_rules where id;
  vat_cents := round(job.price_cents * rules.vat_percent / (100 + rules.vat_percent))::integer;
  insert into public.invoices (
    job_id, heading, studio, buyer, description,
    ex_vat_cents, vat_percent, vat_cents, total_cents
  ) values (
    job.id,
    case when rules.invoice_vat_number <> '' then 'Tax invoice' else 'Invoice' end,
    jsonb_build_object(
      'legal_name', rules.invoice_legal_name,
      'address', rules.invoice_address,
      'phone', rules.invoice_phone,
      'email', rules.invoice_email,
      'registration', rules.invoice_registration,
      'vat_number', rules.invoice_vat_number,
      'bank', rules.invoice_bank
    ),
    jsonb_build_object(
      'name', job.customer_name,
      'email', job.customer_email,
      'company', job.bill_company,
      'address', job.bill_address,
      'vat', job.bill_vat,
      'registration', job.bill_registration,
      'accounts_email', job.bill_email,
      'po', job.bill_po
    ),
    case when job.kind = 'print'
      then '3D print · ' || job.material || ' · ' || job.colour || ' · ' || job.qty::text || ' pcs'
      else job.material
    end,
    job.price_cents - vat_cents,
    rules.vat_percent,
    vat_cents,
    job.price_cents
  );
end;
$$;
revoke all on function public.set_job_paid(uuid, boolean) from public;
grant execute on function public.set_job_paid(uuid, boolean) to authenticated;
