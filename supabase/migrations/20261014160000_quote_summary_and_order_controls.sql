-- Customer-facing selling prices, cancellation, and reversible job archiving.
alter table public.jobs add column pricing_summary jsonb;
alter table public.jobs add column archived_at timestamptz;

create function public.cancel_order(target_job_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare job public.jobs; operator boolean := (select app_private.is_staff());
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and active) then
    raise exception 'Sign in required';
  end if;
  select * into job from public.jobs where id = target_job_id for update;
  if not found or (job.customer_id <> auth.uid() and not operator) then
    raise exception 'Order not found';
  end if;
  if job.status = 'Cancelled' then return; end if;
  if job.status = 'Completed' then raise exception 'Completed orders can be archived'; end if;
  if not operator and job.status not in ('Submitted', 'Quoted', 'Approved') then
    raise exception 'Production has started. Contact the studio to cancel';
  end if;
  update public.jobs set status = 'Cancelled' where id = job.id;
end;
$$;
revoke all on function public.cancel_order(uuid) from public;
grant execute on function public.cancel_order(uuid) to authenticated;

create function public.set_order_archived(target_job_id uuid, archive boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare job public.jobs; operator boolean := (select app_private.is_staff());
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and active) then
    raise exception 'Sign in required';
  end if;
  select * into job from public.jobs where id = target_job_id for update;
  if not found or (job.customer_id <> auth.uid() and not operator) then
    raise exception 'Order not found';
  end if;
  if archive and job.status not in ('Cancelled', 'Completed') then
    raise exception 'Cancel the order before archiving it';
  end if;
  update public.jobs set archived_at = case when archive then now() else null end where id = job.id;
  insert into public.job_events(job_id, actor_id, message)
    values (job.id, auth.uid(), case when archive then 'Order archived' else 'Order restored from archive' end);
end;
$$;
revoke all on function public.set_order_archived(uuid,boolean) from public;
grant execute on function public.set_order_archived(uuid,boolean) to authenticated;

-- Only the authenticated server function can store pricing. Lock the order so
-- cancellation, confirmation, or edited settings cannot race with calculation.
create function public.store_quote_calculation(target_job_id uuid, expected_updated_at timestamptz,
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
    pricing_error = null, pricing_provisional = provisional, pricing_summary = summary
    where id = job.id;
end;
$$;
revoke all on function public.store_quote_calculation(uuid,timestamptz,jsonb,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.store_quote_calculation(uuid,timestamptz,jsonb,jsonb,boolean) to service_role;

-- Backfill sale breakdowns without recalculating existing customer prices.
update public.jobs j set pricing_summary = jsonb_build_object(
  'machineName',m.name,'printSeconds',c.print_seconds,'materialGrams',c.material_grams,
  'machineCents',c.machine_cents,'materialCents',c.material_cents,'setupCents',c.setup_cents,
  'minimumAdjustmentCents',greatest(0,c.total_cents-c.vat_cents-c.delivery_cents-c.machine_cents-c.material_cents-c.setup_cents),
  'vatCents',c.vat_cents,'totalCents',c.total_cents)
from public.quote_calculations c join public.machine_rates m on m.id=c.machine_id
where c.job_id=j.id;
