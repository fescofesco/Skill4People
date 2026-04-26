import { z } from "zod";

import { embedScientificQuestion } from "@/lib/google-embeddings";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const experimentSchema = z.object({
  original_query: z.string().min(1),
  domain: z.string().min(1),
  generated_plan: z.unknown(),
  literature_qc: z.unknown().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedBody = experimentSchema.safeParse(body);

  if (!parsedBody.success) {
    return Response.json(
      { error: parsedBody.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseServiceClient();
    const embedding = await embedScientificQuestion(parsedBody.data.original_query);
    const { data, error } = await supabase
      .from("experiments")
      .insert({
        original_query: parsedBody.data.original_query,
        domain: parsedBody.data.domain,
        generated_plan: parsedBody.data.generated_plan,
        literature_qc: parsedBody.data.literature_qc ?? null,
        embedding,
      })
      .select("id")
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ id: data.id });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save experiment.",
      },
      { status: 500 },
    );
  }
}
