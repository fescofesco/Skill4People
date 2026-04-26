create or replace function public.match_experiments(
  query_embedding extensions.vector(768),
  match_threshold float,
  match_count int
)
returns table (
  experiment_id uuid,
  original_query text,
  domain text,
  generated_plan jsonb,
  literature_qc jsonb,
  feedback jsonb,
  similarity float
)
language sql
stable
as $$
  select
    e.id as experiment_id,
    e.original_query,
    e.domain,
    e.generated_plan,
    e.literature_qc,
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'section', f.section,
        'old_value', f.old_value,
        'corrected_value', f.corrected_value,
        'explanation', f.explanation,
        'created_at', f.created_at
      )
      order by f.created_at desc
    ) as feedback,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.experiments as e
  inner join public.feedback as f
    on f.experiment_id = e.id
  where e.embedding is not null
    and 1 - (e.embedding <=> query_embedding) >= match_threshold
  group by e.id
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
