-- Customers keep the order total. Staff keep the cost lines.
revoke select (pricing_summary) on table public.jobs from anon, authenticated;

create function public.staff_job_summaries()
returns table (id uuid, pricing_summary jsonb)
language sql stable security definer set search_path = '' as $$
  select j.id, j.pricing_summary
  from public.jobs j
  where (select app_private.is_staff());
$$;
revoke all on function public.staff_job_summaries() from public;
grant execute on function public.staff_job_summaries() to authenticated;

alter table public.jobs add column if not exists geometry_guess boolean not null default false;
alter table public.jobs add column if not exists guess_accepted_at timestamptz;
alter table public.jobs add column if not exists paid_at timestamptz;

update public.jobs j
set geometry_guess = c.geometry_method = 'bounding-box',
    pricing_summary = case
      when j.pricing_summary is null then j.pricing_summary
      else j.pricing_summary || jsonb_build_object('geometryMethod', c.geometry_method)
    end
from public.quote_calculations c
where c.job_id = j.id;

create or replace function public.store_quote_calculation(target_job_id uuid, expected_updated_at timestamptz,
  calculation jsonb, summary jsonb, provisional boolean) returns void
language plpgsql security invoker set search_path = '' as $$
declare job public.jobs;
begin
  select * into job from public.jobs where id = target_job_id for update;
  if not found or job.archived_at is not null or job.status not in ('Submitted', 'Quoted')
    or job.approved_at is not null or job.updated_at <> expected_updated_at then
    raise exception 'Order changed during calculation. Reload and try again';
  end if;
  insert into public.quote_calculations
    select r.* from jsonb_populate_record(null::public.quote_calculations,
      calculation || jsonb_build_object('job_id',job.id,'calculated_at',now())) r
  on conflict (job_id) do update set
    machine_id = excluded.machine_id, material_id = excluded.material_id,
    print_seconds = excluded.print_seconds, material_grams = excluded.material_grams,
    geometry_method = excluded.geometry_method, model_volume_mm3 = excluded.model_volume_mm3,
    printed_volume_mm3 = excluded.printed_volume_mm3, machine_cents = excluded.machine_cents,
    material_cents = excluded.material_cents, setup_cents = excluded.setup_cents,
    waste_cents = excluded.waste_cents, support_cents = excluded.support_cents,
    vat_cents = excluded.vat_cents, delivery_cents = excluded.delivery_cents,
    total_cents = excluded.total_cents, calculated_at = excluded.calculated_at;
  update public.jobs set status = 'Quoted', price_cents = (calculation->>'total_cents')::integer,
    assigned_machine_id = (calculation->>'machine_id')::uuid, quoted_at = now(),
    pricing_error = null, pricing_provisional = provisional, pricing_summary = summary,
    geometry_guess = calculation->>'geometry_method' = 'bounding-box',
    guess_accepted_at = null
    where id = job.id;
end;
$$;

create or replace function public.approve_quote(target_job_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.jobs
    where id = target_job_id and customer_id = auth.uid()
      and geometry_guess and guess_accepted_at is null
  ) then
    raise exception 'The studio is still checking the file volume';
  end if;
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

create function public.accept_volume_guess(target_job_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app_private.is_staff()) then
    raise exception 'Staff access required';
  end if;
  update public.jobs set guess_accepted_at = now()
  where id = target_job_id and geometry_guess and guess_accepted_at is null
    and status in ('Submitted', 'Quoted');
  if not found then
    raise exception 'Nothing to accept';
  end if;
end;
$$;
revoke all on function public.accept_volume_guess(uuid) from public;
grant execute on function public.accept_volume_guess(uuid) to authenticated;

create function public.set_job_paid(target_job_id uuid, paid boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app_private.is_staff()) then
    raise exception 'Staff access required';
  end if;
  update public.jobs
  set paid_at = case when paid then coalesce(paid_at, now()) else null end
  where id = target_job_id;
  if not found then
    raise exception 'Order not found';
  end if;
end;
$$;
revoke all on function public.set_job_paid(uuid, boolean) from public;
grant execute on function public.set_job_paid(uuid, boolean) to authenticated;
