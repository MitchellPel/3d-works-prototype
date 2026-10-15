-- Production assignments and a reversible audit trail for cancelled orders.
alter type public.job_stage add value if not exists 'Cancelled';

alter table public.jobs
  add column if not exists assigned_staff_id uuid references public.profiles(id),
  add column if not exists assigned_machine_id uuid references public.machine_rates(id);

grant update (assigned_staff_id, assigned_machine_id) on public.jobs to authenticated;

-- Staff see machine names for assignment without receiving the confidential
-- hourly rates or quote cost breakdowns.
create function public.list_active_machine_names()
returns table(id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.name
  from public.machine_rates m
  where (select app_private.is_staff()) and m.active and m.process = 'FDM'
  order by m.name;
$$;
revoke all on function public.list_active_machine_names() from public;
grant execute on function public.list_active_machine_names() to authenticated;
