# Runway API Hackathon submission

> Build agents and applications that create, manipulate, or orchestrate
> media using AI. Go beyond single API calls — chain creative decisions,
> respond to inputs, produce something people actually want to use.

Director's Canvas is a LangGraph agent that takes a one-line brief and
autonomously decomposes it into shots, generates Runway reference stills,
animates each still into a clip, maintains visual consistency across the
whole sequence, and stitches a final MP4 — all while rendering its
working state live onto a canvas the user can intervene in at any step.

## Rubric

### Creativity — does it solve a real problem or explore an interesting use case?

Most generative-video tools are a prompt box and a download button. The
creative judgment — pacing, shot order, visual continuity, when to
regenerate — sits with the human. Director's Canvas pushes those
decisions into the agent loop:

| Step                   | Today's tools | Director's Canvas       |
| ---------------------- | ------------- | ----------------------- |
| Shot decomposition     | You           | Agent                   |
| Reference framing      | You           | Agent                   |
| Animation prompt       | You           | Agent                   |
| Cross-shot consistency | You (manual)  | Agent (`referenceImages`) |
| Iteration choice       | You           | You + agent             |
| Final export           | NLE software  | One button              |

The user directs at the brief level. The agent handles the production
decisions. Any shot can be rewritten or regenerated mid-run with a plain
English instruction.

### Technical depth — does it go beyond basic usage of Runway's API?

**Model selection is context-aware.** The agent picks the right model
for each situation automatically:

| Situation                        | Model                 | Why                                           |
| -------------------------------- | --------------------- | --------------------------------------------- |
| Shot 0 reference (no prior refs) | `gen4_image`          | `gen4_image_turbo` requires `referenceImages` |
| Shots 1+ reference               | `gen4_image_turbo`    | 2–4× cheaper, <10 s, 93% quality parity       |
| All video generation             | `gen4.5`              | Best quality/control                          |
| No `RUNWAY_API_KEY`              | MOCK                  | Deterministic placeholders, no credits        |

**Cross-shot character consistency is automatic.** Shot 0's
`ref_image_url` is promoted to `storyboard.style_ref_url` and passed as
`character1` to every subsequent `gen4_image_turbo` call. Up to 3 prior
refs are threaded through as `referenceImages`:

- `character1` — shot 0's ref (primary anchor)
- `style1` — the immediately preceding shot's ref
- `style2` — the shot two positions back

The astronaut in shot 4 looks like the astronaut in shot 1 because the
agent carries that reference forward — not because the user re-uploaded
anything. The pipeline is chained, not parallel: shot 0 runs
synchronously first, then the rest run in parallel (bounded to 4
concurrent to stay within rate limits).

**The full pipeline runs end-to-end.** The agent doesn't stop at a URL.
It calls FFmpeg to concat all clips into a single MP4 and serves it
directly from the frontend. The output is something you can actually
share.

See [`runway_client.py`](../apps/agent/src/runway_client.py) and
[`runway_tools.py`](../apps/agent/src/runway_tools.py) for the
implementation.

### Impact — could it be used by real users? Could it become a real product?

- **Solo creators** who want a director's intuition without a director
- **Marketing / social teams** producing high-volume short-form video
- **Pre-vis & pitch decks** — get a watchable rough before committing budget

**MOCK mode** means anyone can try the full workflow without a Runway
key. **BYOK** means real creators can use their own credits — the key is
stored in localStorage, injected via header, and never logged. A
per-thread budget guard (default 20 calls ≈ 10 shots) protects the
shared server key.

### Polish — is it a working demo? Does it feel end-to-end?

- **MOCK mode is indistinguishable from LIVE in the UI.** Deterministic
  placeholder media, same canvas, same status pills, same export flow.
  Anyone can demo it without burning credits.
- **Error states are handled.** Shot failures surface in the card with a
  retry button. Budget exhaustion surfaces in chat with a clear message.
  FFmpeg fallback (re-encode if stream-copy fails) is silent.
- **The export is a real deliverable.** FFmpeg concat → MP4 → inline
  video player + download button. Not a URL to an external service.

## Runway API surface used

| Model / call             | Where                                                                          |
| ------------------------ | ------------------------------------------------------------------------------ |
| `gen4_image`             | Shot 0 reference still — no prior refs available yet                           |
| `gen4_image_turbo`       | Shots 1+ reference stills — `referenceImages` for character anchor; 2–4× cheaper, <10 s |
| `gen4.5`                 | All image→video animation                                                      |
| `wait_for_task_output()` | Async polling; the agent awaits each task before updating canvas state         |

## What's next

- ElevenLabs audio (TTS + sound effects) layered onto the stitched export
- `gen4_aleph` video-to-video restyle per shot (style transfer pass)
- Runway Characters (`gwm1_avatars`) as the Director avatar in the sidebar
