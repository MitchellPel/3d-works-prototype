create function app_private.clear_quote_summary() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (new.material,new.colour,new.quality,new.infill,new.qty)
     is distinct from (old.material,old.colour,old.quality,old.infill,old.qty) then
    new.pricing_summary := null;
  end if;
  return new;
end;
$$;
create trigger jobs_clear_quote_summary before update on public.jobs
for each row execute function app_private.clear_quote_summary();
