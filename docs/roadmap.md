# Roadmap

## Shipped (hackathon build)

- ✅ Director agent — brief → storyboard plan → references → videos
- ✅ Live storyboard canvas with horizontally scrolling shot timeline
- ✅ Runway Gen-4 text-to-image (reference frames)
- ✅ Runway Gen-4 image-to-video (animated clips)
- ✅ Per-shot regeneration + prompt rewrite
- ✅ MOCK mode for credit-free dev / demos
- ✅ Shared CopilotKit Intelligence threads (each storyboard is a
  durable conversation)
- ✅ Inline shot mini-cards + storyboard summary in chat (generative UI)

## Next (1–2 weeks)

- **Stitched export.** Use FFmpeg in a Daytona sandbox to concat shots
  into one MP4 with optional crossfades.
- **Audio track.** Generate a music bed (ElevenLabs Music or
  AudioCraft) tuned to the storyboard mood and ducked under any
  voice-over.
- **Voice-over.** Add a `generate_voiceover(shot_id, line)` tool with
  ElevenLabs / OpenAI TTS; mux per-shot.
- **Runway Characters API.** Maintain a cast across shots so the
  astronaut in shot 1 looks like the astronaut in shot 4.
- **Video-to-video restyle.** Take an existing clip and restyle it
  (anime / noir / claymation) per shot.

## Mid-term (1–2 months)

- **Reference uploads.** Drop in product photos, brand boards, mood
  refs; the agent grounds shot prompts on them.
- **Brief intake via Notion / Linear MCP.** Agent reads a brief from
  a Notion page and posts the finished cuts back as comments.
- **Agent critique loop.** A sub-agent watches generated clips and
  flags shots that drift from the logline; auto-suggests rewrites.
- **Multi-aspect deliverables.** One brief, three aspects (16:9, 9:16,
  1:1) — agent re-frames each shot and re-renders.

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
