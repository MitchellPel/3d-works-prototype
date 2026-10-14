-- Quotes use the configured prices immediately. The owner can edit these
-- values in Administration; no staff approval is part of checkout.
alter table public.pricing_rules
  add column if not exists default_lead_days integer not null default 14
  check (default_lead_days between 1 and 365);

update public.pricing_rules
set sample_values = false,
    delivery_fee_cents = 0,
    updated_at = now()
where id = true;

create or replace function public.approve_quote(target_job_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs
  set status = 'Approved',
      approved_at = now(),
      due_date = (now() at time zone 'Africa/Johannesburg')::date +
        (select default_lead_days from public.pricing_rules where id = true)
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
