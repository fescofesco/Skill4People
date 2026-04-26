"""AI Scientist pitch deck — 3 slides, 2-minute format."""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

DARK_BG    = RGBColor(0x0D, 0x1B, 0x2A)
ACCENT     = RGBColor(0x00, 0xC2, 0xFF)
WHITE      = RGBColor(0xFF, 0xFF, 0xFF)
LIGHT_GREY = RGBColor(0xCC, 0xD6, 0xE0)
GREEN      = RGBColor(0x00, 0xE5, 0x96)
YELLOW     = RGBColor(0xFF, 0xD6, 0x00)
RED_SOFT   = RGBColor(0xFF, 0x6B, 0x6B)
MID_BLUE   = RGBColor(0x12, 0x28, 0x3E)

prs = Presentation()
prs.slide_width  = Inches(13.33)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]


# ── low-level helpers ──────────────────────────────────────────────────────────

def add_slide():
    sl = prs.slides.add_slide(BLANK)
    bg = sl.background.fill
    bg.solid()
    bg.fore_color.rgb = DARK_BG
    return sl

def rect(slide, l, t, w, h, colour):
    s = slide.shapes.add_shape(1, Inches(l), Inches(t), Inches(w), Inches(h))
    s.fill.solid(); s.fill.fore_color.rgb = colour
    s.line.fill.background()
    return s

def txt(slide, l, t, w, h, text, size=16, bold=False, italic=False,
        colour=WHITE, align=PP_ALIGN.LEFT, wrap=True):
    tb = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tb.word_wrap = wrap
    tf = tb.text_frame; tf.word_wrap = wrap
    p = tf.paragraphs[0]; p.alignment = align
    r = p.add_run(); r.text = text
    r.font.size = Pt(size); r.font.bold = bold; r.font.italic = italic
    r.font.color.rgb = colour
    return tb

def bullets(slide, l, t, w, h, lines, size=14, colour=WHITE, leading=None):
    tb = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tb.word_wrap = True
    tf = tb.text_frame; tf.word_wrap = True
    for i, line in enumerate(lines):
        if isinstance(line, tuple):
            text, opts = line
        else:
            text, opts = line, {}
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = opts.get("align", PP_ALIGN.LEFT)
        if leading:
            p.line_spacing = Pt(leading)
        r = p.add_run(); r.text = text
        r.font.size  = Pt(opts.get("size", size))
        r.font.bold  = opts.get("bold", False)
        r.font.italic = opts.get("italic", False)
        r.font.color.rgb = opts.get("colour", colour)

def header(slide, title):
    rect(slide, 0, 0, 13.33, 0.10, ACCENT)
    rect(slide, 0, 7.40, 13.33, 0.10, ACCENT)
    txt(slide, 0.5, 0.18, 12, 0.60, title,
        size=32, bold=True, colour=WHITE)
    rect(slide, 0.5, 0.82, 1.2, 0.07, ACCENT)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 1 — THE PROBLEM + OUR SOLUTION
# ══════════════════════════════════════════════════════════════════════════════
sl = add_slide()
rect(sl, 0, 0, 13.33, 0.10, ACCENT)
rect(sl, 0, 7.40, 13.33, 0.10, ACCENT)

# Big headline
txt(sl, 0.5, 0.22, 12.3, 0.85,
    "THE AI SCIENTIST",
    size=46, bold=True, colour=WHITE, align=PP_ALIGN.CENTER)
txt(sl, 0.5, 1.10, 12.3, 0.50,
    "From hypothesis to runnable experiment — in minutes, not weeks",
    size=20, italic=True, colour=ACCENT, align=PP_ALIGN.CENTER)
rect(sl, 4.5, 1.70, 4.33, 0.06, ACCENT)

# Left: Problem
rect(sl, 0.4, 1.90, 5.9, 4.90, MID_BLUE)
rect(sl, 0.4, 1.90, 5.9, 0.08, RED_SOFT)
txt(sl, 0.55, 2.03, 5.6, 0.50, "THE PROBLEM", size=18, bold=True, colour=RED_SOFT)
bullets(sl, 0.55, 2.65, 5.6, 3.8,
    ["Turning a hypothesis into a lab-ready experiment\ntakes weeks of manual work",
     "",
     "• Designing protocols from scattered literature",
     "• Sourcing reagents with correct catalog numbers",
     "• Building realistic budgets + phased timelines",
     "• Assessing safety, ethics & regulatory requirements",
     "",
     ("The bottleneck isn't ideas — it's operations.", {"italic": True, "colour": YELLOW})],
    size=14, colour=LIGHT_GREY, leading=20)

# Arrow
txt(sl, 6.35, 4.10, 0.6, 0.60, "→", size=36, bold=True, colour=ACCENT,
    align=PP_ALIGN.CENTER)

# Right: Solution
rect(sl, 7.05, 1.90, 5.85, 4.90, RGBColor(0x08, 0x1E, 0x12))
rect(sl, 7.05, 1.90, 5.85, 0.08, GREEN)
txt(sl, 7.20, 2.03, 5.6, 0.50, "OUR SOLUTION", size=18, bold=True, colour=GREEN)
bullets(sl, 7.20, 2.65, 5.6, 3.8,
    [("3-stage AI pipeline:", {"bold": True, "colour": WHITE}),
     "",
     ("① Input  — any natural-language hypothesis", {"colour": ACCENT}),
     "",
     ("② Literature QC  — 6-source search (Semantic Scholar,\n"
      "   arXiv, PubMed, OpenAlex, protocols.io + Tavily)\n"
      "   → novelty signal in seconds", {"colour": ACCENT}),
     "",
     ("③ Full Experiment Plan  — protocol · materials\n"
      "   catalog #s · budget · timeline · validation\n"
      "   safety · risks · assumptions", {"colour": ACCENT}),
     "",
     ("Pick it up Monday. Start running Friday.", {"italic": True, "bold": True, "colour": GREEN})],
    size=13, colour=LIGHT_GREY, leading=18)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — WHAT WE BUILT
# ══════════════════════════════════════════════════════════════════════════════
sl = add_slide()
header(sl, "WHAT WE BUILT")

features = [
    (RED_SOFT,  "🔍  PLAN CRITIQUE — WE CHECK OUR OWN WORK",
     "After every plan is generated, an AI critic scans it for 6 weakness categories:\n"
     "controls · statistics · sample size · validation · safety · feasibility\n"
     "Heuristic fallback if AI is unavailable. Rated: weak / needs_work / solid"),

    (YELLOW,    "🔁  LEARNING FEEDBACK LOOP (Stretch Goal ✔)",
     "Scientist corrects a plan section → system derives a reusable rule + embedding.\n"
     "Next plan for a similar experiment automatically incorporates those corrections.\n"
     "Semantic + lexical retrieval: domain, type, tags, cosine similarity."),

    (RED_SOFT,  "🛡️  USER-SPECIFIC RISK PROFILE",
     "Hard-blocks: gain-of-function · pathogen synthesis · unapproved human trials.\n"
     "Soft-flags: animal work · GMOs · controlled substances · biohazards.\n"
     "Every plan includes PPE requirements, waste handling & expert-review gates."),

    (GREEN,     "📊  COMPOSITE CONFIDENCE SCORE",
     "Every plan is scored across 4 dimensions:\n"
     "evidence quality · supplier completeness · validation completeness · feedback relevance.\n"
     "Scientists know exactly how much to trust the output before ordering materials."),
]

for i, (colour, title, body) in enumerate(features):
    row, col = divmod(i, 2)
    cx = 0.4  + col * 6.45
    cy = 1.15 + row * 2.85
    rect(sl, cx, cy, 6.1, 2.65, MID_BLUE)
    rect(sl, cx, cy, 6.1, 0.08, colour)
    txt(sl, cx+0.15, cy+0.14, 5.8, 0.50, title, size=14, bold=True, colour=colour)
    txt(sl, cx+0.15, cy+0.70, 5.8, 1.80, body, size=12, colour=LIGHT_GREY)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 3 — DID WE FULFIL THE BRIEF?
# ══════════════════════════════════════════════════════════════════════════════
sl = add_slide()
header(sl, "DID WE FULFIL THE BRIEF?")

def check_row(slide, x, y, done, label, note=""):
    sym   = "✔" if done else "○"
    scol  = GREEN if done else LIGHT_GREY
    lcol  = WHITE if done else LIGHT_GREY
    txt(slide, x,      y, 0.45, 0.38, sym,   size=16, bold=True,  colour=scol)
    txt(slide, x+0.42, y, 5.40, 0.38, label, size=13, bold=False, colour=lcol)
    if note:
        txt(slide, x+0.42, y+0.27, 5.40, 0.30, note, size=10,
            italic=True, colour=ACCENT)

# Column headers
rect(sl, 0.4,  1.05, 6.3, 0.38, RGBColor(0x00,0x4A,0x7A))
rect(sl, 6.85, 1.05, 6.1, 0.38, RGBColor(0x00,0x3A,0x1A))
txt(sl, 0.55,  1.10, 6.1, 0.30, "CORE REQUIREMENTS", size=13, bold=True, colour=WHITE)
txt(sl, 7.00,  1.10, 5.9, 0.30, "STRETCH GOAL + BEYOND", size=13, bold=True, colour=GREEN)

core = [
    (True,  "Natural language input"),
    (True,  "Literature QC — novelty signal + references"),
    (True,  "Step-by-step protocol (grounded in research)"),
    (True,  "Reagents with catalog numbers & suppliers"),
    (True,  "Realistic cost breakdown (line items)"),
    (True,  "Phased timeline with dependencies"),
    (True,  "Validation design — success/failure criteria"),
    (True,  "Polished end-to-end UI"),
]
extra = [
    (True,  "Feedback loop — corrects future plans",      "✔ Stretch goal fully implemented"),
    (True,  "Plan critique — finds own weaknesses",        "✔ Beyond the brief"),
    (True,  "Risk profile per plan + safety hard-blocks",  "✔ Beyond the brief"),
    (True,  "Composite confidence score",                  "✔ Beyond the brief"),
    (True,  "Evidence drilldown cards",                    "✔ Beyond the brief"),
    (False, "Upload own experimental data",               "○ Architecture ready — coming soon"),
]

for i, (done, label) in enumerate(core):
    check_row(sl, 0.4, 1.55 + i * 0.68, done, label)

for i, (done, label, note) in enumerate(extra):
    check_row(sl, 6.85, 1.55 + i * 0.97, done, label, note)


# ── save ──────────────────────────────────────────────────────────────────────
out = r"C:\Users\Admin\Documents\Repos\Hacknation_april_2026\presentation\AI_Scientist_Deck.pptx"
prs.save(out)
print(f"Saved: {out}")
