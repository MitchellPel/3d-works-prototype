-- Existing sample quotes at the configured minimum can now be confirmed.
-- These totals do not depend on a different valid printer being selected.
update public.jobs as job
set pricing_provisional = false
from public.quote_calculations as calculation,
     public.pricing_rules as rules
where calculation.job_id = job.id
  and rules.id = true
  and not rules.sample_values
  and job.status = 'Quoted'
  and job.pricing_provisional
  and job.pricing_error is null
  and job.price_cents = calculation.total_cents
  and calculation.machine_cents + calculation.material_cents + calculation.setup_cents <= rules.minimum_charge_cents
  and calculation.total_cents = rules.minimum_charge_cents +
    round(rules.minimum_charge_cents * rules.vat_percent / 100)::integer +
    rules.delivery_fee_cents;
