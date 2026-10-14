-- Staff may correct order specifications before the customer places the order.
-- A changed specification requires a fresh automatic price and customer review.
create function public.staff_update_unconfirmed_order(
  target_job_id uuid,
  next_material text,
  next_colour text,
  next_quality text,
  next_infill integer,
  next_qty integer
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app_private.is_staff()) then
    raise exception 'Staff access required';
  end if;
  if next_infill not between 10 and 80 or next_qty not between 1 and 100 then
    raise exception 'Invalid print settings';
  end if;
  if next_quality not in ('Draft · 0.28 mm', 'Standard · 0.20 mm', 'Fine · 0.12 mm') then
    raise exception 'Invalid quality setting';
  end if;
  if not exists (
    select 1 from public.material_rates
    where active and process = 'FDM'
      and material_type = next_material and colour = next_colour
  ) then
    raise exception 'Material and colour are unavailable';
  end if;
  update public.jobs
  set material = next_material,
      colour = next_colour,
      quality = next_quality,
      infill = next_infill,
      qty = next_qty,
      status = 'Submitted',
      price_cents = null,
      quoted_at = null,
      pricing_error = null,
      pricing_provisional = true,
      assigned_machine_id = null
  where id = target_job_id and status in ('Submitted', 'Quoted')
    and approved_at is null;
  if not found then
    raise exception 'Only unconfirmed orders can be edited';
  end if;
  delete from public.quote_calculations where job_id = target_job_id;
end;
$$;
revoke all on function public.staff_update_unconfirmed_order(uuid,text,text,text,integer,integer) from public;
grant execute on function public.staff_update_unconfirmed_order(uuid,text,text,text,integer,integer) to authenticated;
