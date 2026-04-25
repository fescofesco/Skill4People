import "./load-env";
import { resetFeedback } from "../lib/feedback-store";

async function main() {
  await resetFeedback();
  console.log("Reset data/feedback_store.json to []");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
