# Genblaze feedback issue (draft)

File this against https://github.com/backblaze-labs/genblaze/issues after starring the repo.

**Title:** AgentLoop + ObjectStorageSink: document single-use sink across iterations

**Body:**

```markdown
### Context
DevCut (hackathon video desk) uses Genblaze `Pipeline` + `RunwayProvider` for
Runway image→video, `ObjectStorageSink(S3StorageBackend.for_backblaze())` for
durable B2 storage, and `AgentLoop` as a quality gate on our "Winning artifact"
beat (verify manifest / sha256, max 2 takes).

### Observation
`AgentLoop.run(**run_kwargs)` forwards the same kwargs (including `sink=`) to
every `pipeline.run()`. Genblaze docs say sinks are **single-use** and are
closed in `pipeline.run()`'s `finally`. Passing one sink into `AgentLoop`
therefore breaks on iteration 2.

### What we did
Run `AgentLoop` **without** a sink, then `ObjectStorageSink.put_asset` /
`persist_url` the winning take afterward so all attempts still land on B2.

### Ask
1. Document this pattern in the AgentLoop / Object Storage guides, **or**
2. Accept a `sink_factory: Callable[[], ObjectStorageSink]` on `AgentLoop.run`
   so each iteration gets a fresh sink (and manifests stay hierarchical under
   the same tenant).

Happy to open a PR for (2) if that matches your preferred API.
```

Also useful: thank the team for `for_backblaze(public_url_base=, auto_lifecycle=, ObjectLockConfig)` — those are the production knobs our Vault demo relies on.
