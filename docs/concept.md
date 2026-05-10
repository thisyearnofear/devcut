# Concept

## What it is

**Director's Canvas** turns a one-line brief into a working storyboard you
can watch the agent build, shot by shot, in real time.

You type:

> *Direct a 30-second sci-fi opener: lone astronaut on a glass-domed alien
> city at golden hour.*

A LangGraph Deep Agent:

1. Decomposes the brief into 3–6 beats with cinematic prompts.
2. Renders the storyboard plan onto a live canvas.
3. Calls Runway Gen-4 text-to-image for each shot's reference still.
4. Calls Runway Gen-4 image-to-video to animate each still into a clip.
5. Reports back. Any shot can be regenerated or rewritten in-place.

There is no chat-wrapper. The agent's output **is** the interface — shot
cards with status pills, inline video players, regeneration controls,
and an inline detail panel composed natively from agent state.

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

| Step               | Today's tools | Director's Canvas |
| ------------------ | ------------- | ----------------- |
| Shot decomposition | You           | Agent             |
| Reference framing  | You           | Agent             |
| Animation prompt   | You           | Agent             |
| Iteration choice   | You           | You + agent       |
| UI                 | Static        | Generated live    |

The agent makes a defensible first pass; the canvas lets you intervene
exactly where you have taste.

## What it isn't (yet)

- Not a final-pixel finisher — exports are individual clips, not a
  stitched edit with audio.
- Not a Premiere replacement — there's no timeline scrubbing, no
  transitions, no color grading.
- Not "agent does everything" — humans still pick the brief and decide
  when a shot is good enough.

See the [roadmap](./roadmap.md) for what we'd build next.
