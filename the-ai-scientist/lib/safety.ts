import { ParsedHypothesis } from "./schemas";

export type SafetyAssessment = {
  unsafe: boolean;
  reason?: string;
  flags: string[];
  expertReviewRequired: boolean;
};

const HARD_BLOCK_PATTERNS: { re: RegExp; reason: string }[] = [
  {
    re: /\b(gain[- ]of[- ]function|enhance(d)? transmission|enhance(d)? virulence|enhance(d)? pathogenicity)\b/i,
    reason: "gain-of-function / pathogen enhancement is out of scope"
  },
  {
    re: /\b(synthes(is|ize)|produce|manufacture|amplify)[^.]{0,60}\b(toxin|nerve agent|chemical weapon|biological weapon|sarin|vx|ricin|saxitoxin|botulinum)/i,
    reason: "toxin/weapon synthesis assistance is out of scope"
  },
  {
    re: /\b(release|disperse|aerosol(ize)?)[^.]{0,40}\b(pathogen|virus|bioweapon|toxin)\b/i,
    reason: "environmental pathogen/toxin release is out of scope"
  },
  {
    re: /\b(unapproved|without (irb|ethics|consent))\b[^.]{0,60}\b(human|patient|subjects?)\b/i,
    reason: "unapproved human experimentation is out of scope"
  }
];

const FLAG_PATTERNS: { re: RegExp; flag: string }[] = [
  { re: /\b(human|patient|subject|whole blood|serum|plasma|tissue|biopsy)\b/i, flag: "human samples" },
  { re: /\b(mice|rats?|c57bl|murine|primate|in vivo)\b/i, flag: "animal work" },
  { re: /\b(hela|jurkat|cell line|primary culture)\b/i, flag: "cell lines" },
  { re: /\b(gmo|transgen|crispr|knock-?out|knock-?in|recombinant)\b/i, flag: "genetically modified organisms" },
  { re: /\b(anaerobic|sporomusa|clostridium)\b/i, flag: "anaerobic microbes" },
  { re: /\b(release|environmental release|outdoor|field trial)\b/i, flag: "environmental release" },
  { re: /\b(pathogen|infectious|virus|bacteria|biohazard|bsl-?3|bsl-?4)\b/i, flag: "pathogens" },
  { re: /\b(toxin|venom|botulinum)\b/i, flag: "toxins" },
  { re: /\b(opioid|fentanyl|cocaine|amphetamine|controlled substance|schedule [iv]+)\b/i, flag: "controlled substances" },
  { re: /\b(formaldehyde|hcn|hf|hydrofluoric|chloroform|methanol|piranha solution|aqua regia)\b/i, flag: "regulated chemicals" },
  { re: /\b(biohazardous|sharps|autoclave|incinerat)\b/i, flag: "biohazardous waste" },
  { re: /\b(needle|lancet|syringe|sharps)\b/i, flag: "sharps" },
  { re: /\b(high voltage|liquid nitrogen|cryogenic|laser|x-?ray|radiation|ionizing)\b/i, flag: "electrical/chemical/radiation hazards" },
  { re: /\b(elisa|biosensor|assay)\b.{0,30}\b(blood|whole blood)\b/i, flag: "blood-borne pathogen handling" }
];

export function assessSafety(hypothesis: string, parsed?: ParsedHypothesis): SafetyAssessment {
  const text = hypothesis + " " + (parsed ? Object.values(parsed).flat().join(" ") : "");
  for (const block of HARD_BLOCK_PATTERNS) {
    if (block.re.test(text)) {
      return {
        unsafe: true,
        reason: block.reason,
        flags: ["unsafe scope"],
        expertReviewRequired: true
      };
    }
  }
  const flags = new Set<string>(parsed?.safety_flags || []);
  for (const f of FLAG_PATTERNS) {
    if (f.re.test(text)) flags.add(f.flag);
  }
  const expertReview =
    flags.has("human samples") ||
    flags.has("animal work") ||
    flags.has("pathogens") ||
    flags.has("environmental release") ||
    flags.has("genetically modified organisms") ||
    flags.has("anaerobic microbes") ||
    flags.has("controlled substances");
  return {
    unsafe: false,
    flags: Array.from(flags),
    expertReviewRequired: expertReview
  };
}
