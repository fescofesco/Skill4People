create extension if not exists vector with schema extensions;

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  original_query text not null,
  domain text not null,
  generated_plan jsonb not null,
  literature_qc jsonb,
  embedding extensions.vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  section text not null check (
    section in (
      'question',
      'domain',
      'literature_qc',
      'protocol',
      'materials',
      'budget',
      'timeline',
      'validation',
      'other'
    )
  ),
  old_value jsonb,
  corrected_value jsonb not null,
  explanation text not null,
  created_at timestamptz not null default now()
);

create index if not exists experiments_user_id_idx
  on public.experiments(user_id);

create index if not exists experiments_domain_idx
  on public.experiments(domain);

create index if not exists experiments_created_at_idx
  on public.experiments(created_at desc);

create index if not exists experiments_embedding_hnsw_idx
  on public.experiments
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create index if not exists feedback_experiment_id_idx
  on public.feedback(experiment_id);

create index if not exists feedback_user_id_idx
  on public.feedback(user_id);

create index if not exists feedback_section_idx
  on public.feedback(section);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_experiments_updated_at on public.experiments;

create trigger set_experiments_updated_at
  before update on public.experiments
  for each row
  execute function public.set_updated_at();

alter table public.experiments enable row level security;
alter table public.feedback enable row level security;

create policy "Users can read their own experiments"
  on public.experiments
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert their own experiments"
  on public.experiments
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their own experiments"
  on public.experiments
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own experiments"
  on public.experiments
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Users can read feedback for their experiments"
  on public.feedback
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.experiments
      where experiments.id = feedback.experiment_id
        and experiments.user_id = auth.uid()
    )
  );

create policy "Users can insert feedback for their experiments"
  on public.feedback
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.experiments
      where experiments.id = feedback.experiment_id
        and experiments.user_id = auth.uid()
    )
  );

create policy "Users can update their own feedback"
  on public.feedback
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own feedback"
  on public.feedback
  for delete
  to authenticated
  using (user_id = auth.uid());
