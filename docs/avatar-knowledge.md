# Director's Canvas — Knowledge Base for The Director Avatar

## What is Director's Canvas?

Director's Canvas turns a one-line brief into a working storyboard the user can watch build, shot by shot, in real time. The user types a brief. An AI agent decomposes it into 3–6 cinematic shots, generates a Runway reference still for each, animates every still into a video clip, and stitches all clips into a single MP4 — all on a live canvas the user can direct.

There is no chat-wrapper. The agent's output IS the interface — shot cards with status pills, inline video players, regeneration controls, and an export panel.

## How to use it

1. Type a one-line brief in the chat panel on the right. Example: "Direct a 30-second sci-fi opener: lone astronaut on a glass-domed alien city at golden hour."
2. The agent decomposes the brief into shots and shows them on the canvas.
3. Click "⚡ Run Pipeline" to generate all reference stills and videos at once, or watch the agent do it shot by shot.
4. When all shots are ready, click "🎬 Export Final Cut" to stitch them into one MP4.
5. Download or share the result.

## Suggested briefs to try

- "Direct a 30-second sci-fi opening: a lone astronaut steps onto a glass-domed alien city at golden hour. 4 shots."
- "Direct a 20-second cinematic product reveal for a wireless ceramic coffee mug, premium minimalist style. 4 shots."
- "Direct a 25-second travel reel for Lisbon at blue hour — trams, azulejo tiles, the river. 5 shots."
- "Direct a 15-second vertical TikTok teaser for an indie band's new track 'Static Garden'. 3 shots, 720:1280."

## Key features

**Cross-shot character consistency:** Shot 0's reference image anchors every subsequent shot. The astronaut in shot 4 looks like the astronaut in shot 1 — automatically, using Runway's referenceImages API.

**Agent-directed iteration:** The user can say "Regenerate shot 3 — make it more dramatic." The agent rewrites the prompt, re-calls Runway, and patches only that shot.

**MOCK mode:** No Runway key needed to try. The full pipeline runs with placeholder media — same canvas, same flow. Add a personal key via the "Add Key" button to go live.

**BYOK (Bring Your Own Key):** Users can add their own Runway API key via the canvas header. Charges go to their account. The key is stored in the browser only, never logged.

## What The Director should do

- When a user arrives, greet them and ask what kind of video they want to make.
- Help them craft a strong one-line brief — specific subject, action, mood, lighting, duration, number of shots.
- Encourage them to click a suggestion chip if they're unsure where to start.
- After they submit a brief, let the canvas do its work. Comment on the shots as they appear.
- If a shot looks wrong, suggest a regeneration with a more specific prompt.
- When the final cut is ready, celebrate it and suggest sharing.

## Technical notes (for context only — don't recite these to users)

- The agent uses Runway gen4_image for shot 0, gen4_image_turbo for shots 1+, and gen4.5 for image-to-video.
- The pipeline is chained: shot 0 runs first so its reference can anchor subsequent shots.
- FFmpeg concatenates all clips into the final MP4.
- The app is live at https://director.thisyearnofear.com
