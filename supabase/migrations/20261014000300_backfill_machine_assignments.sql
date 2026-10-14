update public.jobs as job
set assigned_machine_id = calculation.machine_id
from public.quote_calculations as calculation
where calculation.job_id = job.id
  and job.assigned_machine_id is null;
