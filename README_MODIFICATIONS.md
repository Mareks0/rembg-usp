# Rembg Marek modifications

This version uses:
- Supabase Auth
- Supabase jobs and job_images tables
- Supabase Storage bucket: product-images
- Vercel API route: api/convert-code.js
- Python worker.py on NAS/PC

Workflow:
1. Scan or type product code.
2. App calls /api/convert-code and shows codice pubblico.
3. Operator chooses margin and output format.
4. Operator takes/uploads images.
5. Press Processa.
6. Job appears in Stato Lavori and the form resets immediately.
7. Worker processes in background.
8. Processed preview appears only when done and only for 10 minutes.
9. Worker deletes Supabase preview and removes row after expiry.
10. Final file stays in NAS/PC processed folder, all files together.

Run SQL in supabase-updates.sql before deploying.

Vercel env vars:
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_key
CONVERSION_API_URL=https://app.uspitaly.it/WcfRegistry.svc/Item/ItemCodeEcom
CONVERSION_API_USERNAME=your_username
CONVERSION_API_PASSWORD=your_password

Worker env vars:
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_or_secret_key
SUPABASE_BUCKET=product-images
NAS_OUTPUT_DIR=/data/processed
PREVIEW_MINUTES=10
