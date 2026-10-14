-- Fixed-price scan drop-offs. The print quote path is unchanged.
alter table public.jobs add column if not exists kind text not null default 'print';
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check (kind in ('print', 'scan-file', 'scan-print'));
alter table public.jobs add column if not exists dropoff_at timestamptz;

create or replace function public.place_scan_order(
  kind text,
  dropoff timestamptz,
  picture_path text,
  picture_name text,
  note text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  person public.profiles;
  vat numeric;
  ex_vat integer;
  total integer;
  job_id uuid;
  stored_path text;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  select * into person from public.profiles where id = uid and active;
  if not found then
    raise exception 'Account unavailable';
  end if;
  if kind not in ('scan-file', 'scan-print') then
    raise exception 'Choose a scan service';
  end if;
  if dropoff is null or dropoff <= now() then
    raise exception 'Choose a drop-off day and time in the future';
  end if;
  if picture_path is not null and split_part(picture_path, '/', 1) <> uid::text then
    raise exception 'Photo path is not valid';
  end if;
  select r.vat_percent into vat from public.pricing_rules r where r.id;
  ex_vat := case kind when 'scan-file' then 25000 else 9900 end;
  total := ex_vat + round(ex_vat * vat / 100.0)::integer;
  stored_path := coalesce(picture_path, uid::text || '/scan/' || gen_random_uuid()::text);
  insert into public.jobs (
    customer_id, customer_name, customer_email, file_path, file_name,
    material, colour, quality, infill, qty, customer_note, kind
  ) values (
    uid,
    coalesce(nullif(person.display_name, ''), 'Customer'),
    '',
    stored_path,
    coalesce(nullif(picture_name, ''), 'No photo'),
    case kind when 'scan-file' then 'Scan to STL' else 'Scan to print' end,
    'Drop-off',
    'Scan',
    20,
    1,
    coalesce(note, ''),
    kind
  ) returning id into job_id;
  update public.jobs set
    status = 'Approved',
    approved_at = now(),
    quoted_at = now(),
    price_cents = total,
    pricing_provisional = false,
    pricing_error = null,
    due_date = dropoff::date,
    dropoff_at = dropoff
  where id = job_id;
  return total;
end;
$$;
revoke all on function public.place_scan_order(text, timestamptz, text, text, text) from public;
grant execute on function public.place_scan_order(text, timestamptz, text, text, text) to authenticated;

drop policy if exists models_customer_delete on storage.objects;
create policy models_customer_delete on storage.objects for delete to authenticated
using (bucket_id = 'models' and (storage.foldername(name))[1] = (select auth.uid()::text));
