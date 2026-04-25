import "./load-env";
import { existsSync } from "fs";
import { LiteratureRequestSchema } from "../lib/schemas";
import { readAllFeedback } from "../lib/feedback-store";
import { retrieveRelevantFeedback } from "../lib/feedback-retrieval";
import { parseHypothesis } from "../lib/literature";

async function main() {
  const feedbackExists = existsSync("data/feedback_store.json");
  if (!feedbackExists) throw new Error("data/feedback_store.json is missing");

  LiteratureRequestSchema.parse({
    hypothesis:
      "A paper-based electrochemical biosensor will detect CRP in whole blood compared with ELISA."
  });

  const parseResult = await parseHypothesis(
    "A paper-based electrochemical biosensor will detect CRP in whole blood compared with ELISA."
  );
  const feedback = await readAllFeedback();
  const retrieved = await retrieveRelevantFeedback({
    hypothesis: "CRP biosensor whole blood ELISA matrix control",
    parsed_hypothesis: parseResult.parsed,
    limit: 3
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        feedbackStoreExists: feedbackExists,
        feedbackCount: feedback.length,
        retrievedCount: retrieved.length,
        parsedDomain: parseResult.parsed.domain,
        parseSource: parseResult.source,
        parseModel: parseResult.model,
        parseErrors: parseResult.errors
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
