import { replaceAllFeedback } from "../lib/feedback-store";
import { buildSeedFeedback } from "../lib/seed-feedback";

async function main() {
  const feedback = buildSeedFeedback();
  await replaceAllFeedback(feedback);
  console.log(`Seeded ${feedback.length} feedback examples.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
