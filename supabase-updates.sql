alter table public.jobs
add column if not exists final_code text;

alter table public.jobs
add column if not exists margin_percentage int default 10;

alter table public.jobs
add column if not exists output_format text default 'png';

alter table public.job_images
add column if not exists status text default 'pending';

alter table public.job_images
add column if not exists processed_at timestamptz;

alter table public.job_images
add column if not exists preview_expires_at timestamptz;

alter table public.job_images
add column if not exists storage_deleted_at timestamptz;

alter table public.job_images
add column if not exists error text;
