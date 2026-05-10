# Roadmap

## Shipped

- ✅ Director agent — brief → storyboard plan → references → videos
- ✅ Live storyboard canvas with horizontally scrolling shot timeline
- ✅ Runway Gen-4 text-to-image reference frames (`gen4_image`)
- ✅ Runway Gen-4.5 image-to-video animated clips (upgraded from `gen4_turbo`)
- ✅ Cross-shot visual consistency — shot 0 ref anchors all subsequent shots
  via `gen4_image_turbo` `referenceImages` (character1 / style1 / style2 tags)
- ✅ Per-shot regeneration + prompt rewrite
- ✅ Batch pipeline — `generate_all_references` + `generate_all_videos` in parallel
- ✅ MOCK mode for credit-free dev / demos
- ✅ Stitched export — FFmpeg concat of all ready shots into one MP4
  (LIVE: real ffmpeg; MOCK: placeholder URL)
- ✅ Export panel — stitching spinner, final video player, download button
- ✅ BYOK (Bring Your Own Key) — user supplies their own Runway API key
  via the canvas header; stored in localStorage, forwarded as a header,
  injected into LangGraph configurable; budget check skipped for BYOK users
- ✅ Per-thread call budget — default 20 calls (≈ 10 shots) when using the
  shared server key; enforced in the Python agent via `BudgetExceededError`
- ✅ Shared CopilotKit Intelligence threads (each storyboard is a
  durable conversation)
- ✅ Inline shot mini-cards + storyboard summary in chat (generative UI)
- ✅ FFmpeg LIVE/MOCK pill + Consistent pill in canvas header
- ✅ Live smoke test suite (`scripts/smoke_test_live.py`) — all 6 checks green

## Next (1–2 weeks)

- **Audio track.** ElevenLabs TTS + sound effects are already available
  through the Runway API key — no new account needed. Add a
  `generate_voiceover(shot_id, line)` tool and a `generate_sound_bed(mood)`
  tool; mux per-shot audio into the stitched export.
- **`gen4_aleph` video-to-video restyle.** Take a generated clip and
  restyle it (anime / noir / claymation) per shot. Same tool pattern as
  `generate_shot_video`; just a different model + input.
- **Reference image uploads.** Drag in a product photo, actor headshot,
  or mood board. The `referenceImages` array already accepts URLs; just
  needs a file-upload endpoint that returns one.
- **Real user identity.** Replace the hardcoded `{ id: "default" }` in
  the BFF with a session UUID from localStorage so multiple users get
  independent budgets and thread histories.

## Mid-term (1–2 months)

- **Runway Characters as the Director avatar.** `gwm1_avatars` — a
  real-time video character that *is* the Director, visible in the sidebar,
  talking the user through the storyboard. The most novel use of the API
  that nobody else is doing.
- **Brief intake via Notion / Linear MCP.** Agent reads a brief from
  a Notion page and posts the finished cuts back as comments.
- **Agent critique loop.** A sub-agent watches generated clips and
  flags shots that drift from the logline; auto-suggests rewrites.
- **Multi-aspect deliverables.** One brief, three aspects (16:9, 9:16,
  1:1) — agent re-frames each shot and re-renders.
- **Budget persistence.** Move the in-memory call counter to Redis or
  Postgres so it survives BFF restarts.

## Long-term

- **Real-time direction.** Streaming preview as Runway generates;
  the agent and the human can pause / pivot mid-render.
- **Agent-to-agent collaboration.** A "Producer" agent orchestrates
  multiple "Director" agents, each owning a scene.
- **Marketplace.** Shareable Director profiles — one tuned for
  product launches, one for music videos, one for documentaries —
  each a system prompt + tool config + reference library.

## What we won't build

- A general-purpose NLE. This is a director's tool, not Premiere.
- A "DALL-E for videos" prompt box. The whole point is the chained
  workflow on the canvas.
- A walled garden. The MCP server makes the agent reachable from
  Claude / ChatGPT / any MCP host — it should not require our UI.
