import { z } from "zod";

import { createSupabaseServiceClient } from "@/lib/supabase/server";

const feedbackSchema = z.object({
  experiment_id: z.string().uuid(),
  section: z.enum(["protocol", "materials", "budget"]),
  old_value: z.unknown().nullable(),
  corrected_value: z.string().min(1),
  explanation: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedBody = feedbackSchema.safeParse(body);

  if (!parsedBody.success) {
    return Response.json(
      { error: parsedBody.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("feedback")
      .insert({
        experiment_id: parsedBody.data.experiment_id,
        section: parsedBody.data.section,
        old_value: parsedBody.data.old_value,
        corrected_value: parsedBody.data.corrected_value,
        explanation: parsedBody.data.explanation,
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
        error: error instanceof Error ? error.message : "Failed to save feedback.",
      },
      { status: 500 },
    );
  }
}
