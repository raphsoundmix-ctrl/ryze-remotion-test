# Loom script (60–90 s)

**0:00 – Hook (Playground hero).** "Seven clips in, twelve ad variants out. This is a Remotion engine where the
template is fixed and the data decides the video."

**0:10 – Playground.** Click Hook H1 → H2 → H3, Body B2, CTA C2, Style Clean, Format 4:5.
"Every click recomposes a JSON manifest in the browser and the Player re-renders instantly. No server, zero network
requests once the pack is cached. The variant id changes with it: H2_B2_C2_clean."

**0:25 – manifest.json.** Expand it. "The whole video is this file: slots, word timings, music, format. The same
manifest goes to the batch renderer."

**0:35 – Build all variants.** "3 hooks × 2 bodies × 2 CTAs = 12, built client-side in the few milliseconds shown on screen. Add rows to the pack and
it becomes 100 with no code change; verify proves that."

**0:45 – Terminal.** `npm run render` scrolling (pre-recorded). "Bundle once, then each variant is preflighted and rendered.
A corrupt manifest or a missing file is skipped with a reason; the rest still ship. 12 videos in about 3 minutes on one
machine — that extrapolates to roughly 229 an hour, about 356 with three renders in parallel."

**0:60 – Rendered section + CSV.** "Every MP4 gets a row: render time, status, and empty spend / CTR / hook-rate / hold-rate
columns. Join the Meta or TikTok export on variant_id, keep the winning hook, swap one slot, re-render. That's iterating on
metrics, not looks."

**0:75 – Close.** "The assets here are synthetic placeholders, labeled as such. Drop a real pack of Kling, ElevenLabs and Suno
files into inbox/ and the same pipeline ingests it — the montage is the automated part."
