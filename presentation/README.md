# Presentation assets

This folder ships the slide deck and the technical-architecture artefacts.

## What lives here

| File | Purpose |
|---|---|
| `build_deck.py` | python-pptx generator for the pitch deck |
| `GF_sh_AI_scientist_Deck*.pptx` | rendered pitch deck (regenerate by running `build_deck.py`) |
| `GF_sh_AI_scientist_demo_script.md` | live-demo walkthrough script |
| `GF_sh_AI_scientist_technical_script.md` | technical narration script |
| `architecture.html` | browser-viewable wrapper around the two SVG diagrams |
| `architecture.svg` | system-architecture diagram (single source of truth, 2200×1080) |
| `architecture.png` | rasterised architecture diagram for slide use (4400×2160 @ 2×) |
| `sequence-generate-plan.svg` | request-lifecycle diagram for `POST /api/generate-plan` |
| `04_The_AI_Scientist.docx.md` | original challenge brief |

The two SVGs are the source of truth — they reflect the actual codebase under
`../the-ai-scientist`. The PNG is a rendered copy, regenerated whenever the SVG
changes.

## Editing the architecture diagram

1. Edit `architecture.svg` directly. Card geometry is laid out as:

   - Browser / Reliability cards: `x = 60`, `width = 480`
   - Server card: `x = 620`, `width = 820`
   - Persistence / External cards: `x = 1520`, `width = 620`
   - Card-to-card gap: 80 px (gives the double-headed `HTTP` / `fs` / `HTTPS`
     arrows room to display both arrowheads cleanly)
   - Canvas: `viewBox 0 0 2200 1080`

2. Validate the SVG parses as XML before regenerating the PNG:

   ```powershell
   [xml]$null = Get-Content presentation\architecture.svg -Raw
   ```

3. Regenerate `architecture.png`:

   ```powershell
   $edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
   $wrap = "presentation\_render.html"

   @"
   <!DOCTYPE html><html><head><meta charset='UTF-8'><style>
     html,body{margin:0;padding:0;background:#fff}
     body{width:2200px;height:1080px;overflow:hidden}
     object{display:block;width:2200px;height:1080px}
   </style></head><body>
   <object type='image/svg+xml' data='architecture.svg'></object>
   </body></html>
   "@ | Set-Content $wrap -Encoding UTF8

   $dst = (Join-Path (Resolve-Path "presentation").ProviderPath "architecture.png")
   $url = "file:///" + ((Resolve-Path $wrap).ProviderPath -replace "\\","/")
   & $edge --headless=new --disable-gpu --hide-scrollbars `
           --window-size=2200,1080 --force-device-scale-factor=2 `
           --screenshot="$dst" $url
   Remove-Item $wrap
   ```

   The resulting PNG is 4400×2160 (`--force-device-scale-factor=2`), sharp enough
   for a 16:9 4K projector. Edge is used because online SVG-to-PNG converters
   typically lack the fonts the SVG asks for (`Inter`, `Segoe UI`,
   `Helvetica Neue`) and silently drop every `<text>` node. Edge resolves the
   font stack against the locally-installed Windows fonts (Segoe UI is
   bundled with every Windows install) so all text renders.

   The same recipe regenerates the sequence diagram — swap
   `architecture.svg` → `sequence-generate-plan.svg` and rename the
   `--screenshot` target.

## Editing the deck

The deck is generated programmatically:

```powershell
cd presentation
python build_deck.py
```

`build_deck.py` writes `GF_sh_AI_scientist_Deck.pptx` next to itself. Slides 1–6
are defined inline; tweak text, colour, or geometry there rather than editing
the `.pptx` by hand.
