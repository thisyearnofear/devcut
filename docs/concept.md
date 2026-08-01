# Concept

> **North star moved.** Product direction is now **DevCut** — see
> [`devcut-thesis.md`](./devcut-thesis.md). This page keeps the original
> Director's Canvas concept for historical context.

## What it is

**Director's Canvas** turns a one-line brief into a working storyboard you
can watch the agent build, shot by shot, in real time.

You type:

> *Direct a 30-second sci-fi opener: lone astronaut on a glass-domed alien
> city at golden hour.*

A LangGraph Deep Agent:

1. Decomposes the brief into 3–6 beats with cinematic prompts.
2. Renders the storyboard plan onto a live canvas.
3. Calls Runway `gen4_image` for shot 0's reference still.
4. Calls Runway `gen4_image_turbo` for shots 1+ — passing shot 0's image
   as a `@character1` anchor so the astronaut looks the same across shots.
5. Calls Runway `gen4.5` to animate each still into a clip.
6. Stitches all clips into a single MP4 via FFmpeg on demand.
7. Reports back. Any shot can be regenerated or rewritten in-place.

There is no chat-wrapper. The agent's output **is** the interface — shot
cards with status pills, inline video players, regeneration controls,
and an export panel composed natively from agent state.

See [architecture](architecture.md) for the full pipeline, model selection logic,
cross-shot consistency details, and BYOK/budget guard mechanics.

## Who it's for

- **Solo creators** who want a director's intuition without a director.
- **Marketing / social teams** producing high-volume short-form video.
- **Pre-vis & pitch decks** — get a watchable rough before committing
  budget.
- **Anyone curious** what AI video looks like when it's not text-in /
  one-click-out.

## Why this and not "just a Runway wrapper"

Most generative-video tools are a prompt box and a download button. The
creative judgment — pacing, shot order, visual continuity, when to
regenerate — sits with the human. Director's Canvas pushes those
decisions into the agent loop:

| Step                    | Today's tools | Director's Canvas        |
| ----------------------- | ------------- | ------------------------ |
| Shot decomposition      | You           | Agent                    |
| Reference framing       | You           | Agent                    |
| Animation prompt        | You           | Agent                    |
| Cross-shot consistency  | You (manual)  | Agent (referenceImages)  |
| Iteration choice        | You           | You + agent              |
| Final export            | NLE software  | One button               |
| UI                      | Static        | Generated live           |

The agent makes a defensible first pass; the canvas lets you intervene
exactly where you have taste.

## What it isn't (yet)

- Not a final-pixel finisher — the stitched export has no transitions,
  color grading, or audio (yet — ElevenLabs is available through the
  same Runway API key).
- Not a Premiere replacement — there's no timeline scrubbing or effects.
- Not "agent does everything" — humans still pick the brief and decide
  when a shot is good enough.

See the [roadmap](roadmap.md) for what's next.