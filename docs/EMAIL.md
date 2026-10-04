# Email (5 lines)

Subject: Video Editor (Remotion) — test task: auto-montage engine

Hi — here is my test task: https://ryze-video-engine.vercel.app (code: https://github.com/raphsoundmix-ctrl/ryze-remotion-test).
It is one data-driven Remotion template that turns pre-generated AI assets (clips, voice, packshot, music) into ad variants: hooks, word-synced captions, transitions, ducked music and an end card are all automated, 3 hooks × 2 bodies × 2 CTAs = 12 variants, previewable live in the browser.
Batch rendering is measured: 12 MP4s in ~3 min on one desktop (extrapolates to ~229/hour, ~356/hour with 3 renders in parallel), with per-variant failure isolation and a CSV ready to join ad metrics on variant_id.
With your real performance data I'd close the loop: rank hooks by 3-second hold, keep the winners, swap one slot at a time, and move the batch to Remotion Lambda for volume.
Happy to walk through it on a call — Raph
