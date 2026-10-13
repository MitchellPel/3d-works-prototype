# 3D Craftworx

Customer accounts, private model uploads, automatic estimates, order confirmation, production tracking, and an admin workspace for staff and pricing. The public frontend is a static Next/Vinext app. Supabase Auth, Postgres, Storage, and Edge Functions provide the private backend.

## Setup

1. Create a Supabase project for 3D Craftworx.
2. Apply `supabase/migrations/20261013000100_production_core.sql` in the Supabase SQL editor or with the Supabase CLI.
3. Import the client's confidential FDM machine and material rates into `machine_rates` and `material_rates`. The generated SQL from the private workbook must remain outside this public repository. The client can change rates later in the admin workspace.
4. Deploy the `estimate-quote` and `manage-staff` Edge Functions from `supabase/functions`. Set `SITE_ORIGIN` to the deployed site's origin and `SITE_URL` to its full root URL. The functions use Supabase's automatically injected project URL and publishable/secret keys. Never copy the secret key into the frontend.
5. In Supabase Auth URL Configuration, add the site's root URL and the same URL with `?invite=1` to the redirect allow list. Enable email confirmation and configure production SMTP before accepting public signups.
6. Copy `.env.example` to `.env.local` and set the project URL and publishable key. Never put the service role key in the frontend or GitHub repository.
7. Sign up with `mitchellpelser@gmail.com`, verify the email, and promote that account once:

   ```sql
   update public.profiles set role = 'admin' where id = (
     select id from auth.users where email = 'mitchellpelser@gmail.com'
   );
   ```

8. Configure the same public environment values in the GitHub Pages build environment. Build with `PAGES=1 npm run build:pages` for the repository's GitHub Pages base path. Upload the generated `out/` directory to the existing Pages site.

Local development: `npm ci`, then `npm run dev`. Run `node --test tests/*.test.mjs` and `npx tsc --noEmit` to verify pricing and types.

## Pricing

The backend downloads the uploaded STL, OBJ, or 3MF model from private storage. It measures dimensions and enclosed volume when available, uses the admin's machine and material costs, and calculates:

```text
estimated printed volume = model volume × (infill + shell share × (1 − infill)) × quantity
machine cost = estimated print hours × quality multiplier × machine billing rate
material cost = estimated grams × (1 + support allowance) × (1 + waste allowance) × purchase cost per gram × (1 + material markup)
subtotal = max(minimum charge, machine cost + material cost + setup fee)
estimate = subtotal + VAT + delivery fee
```

The database initially uses **sample** values: 25% material markup, R50 setup, R150 minimum, 10% support allowance, 10% waste, 15% VAT, R0 delivery, 20% shell share, 35% fallback fill for open meshes, and 0.8× draft / 1.5× fine quality multipliers. The admin must approve and adjust these in the site. Printer throughput, build size, material density, print orientation, supports and quality-dependent time are assumptions until actual slicer profiles and sample jobs are supplied. The result is an estimate confirmed when the customer places the order. This flow does not collect payment online.

## Security and operations

Row level security restricts jobs and model files to the owner and active staff. Purchase costs and pricing settings are unavailable to customer accounts. Only the admin can change cost tables and invite or revoke staff. Staff can update production stages and notes; customer approval uses a narrow database function. The pricing function requires a signed-in customer and reads costs only on the server.

Only FDM rates are imported for automatic 3D printing estimates in this first version. Resin, vinyl, laser, printing, cutting and scanning costs in the workbook require separate production estimators before they can be sold automatically.

The existing GitHub Pages URL uses the repository slug `3d-works-prototype`; changing the brand name in the UI does not change that URL. The website must not be deployed as a working storefront until the Supabase project, private cost import, admin bootstrap and live account/order test are complete.
