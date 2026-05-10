FROM python:3.11-slim AS base

# ffmpeg is needed by stitcher.py for LIVE export mode.
# curl is needed by the uv installer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv (the package manager used by the agent).
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:/root/.local/bin:$PATH"

WORKDIR /app

FROM base AS deps
COPY apps/agent/pyproject.toml apps/agent/uv.lock ./
RUN uv sync --frozen --no-dev

FROM base AS runner
WORKDIR /app

# Copy the virtualenv from the deps stage
COPY --from=deps /app/.venv ./.venv
ENV PATH="/app/.venv/bin:$PATH"
ENV VIRTUAL_ENV="/app/.venv"

# Copy application source
COPY apps/agent/src ./src
COPY apps/agent/main.py apps/agent/director.py apps/agent/langgraph.json ./

# The exports directory is shared with the frontend container via a volume.
# The agent writes stitched MP4s here; Next.js serves them at /exports/*.
# In production, override EXPORT_DIR + EXPORT_BASE_URL to point at S3/R2.
ENV EXPORT_DIR=/exports
RUN mkdir -p /exports

EXPOSE 8123

# langgraph up is the production server (vs langgraph dev which hot-reloads).
# --host 0.0.0.0 is required so the BFF container can reach it.
CMD ["langgraph", "up", "--host", "0.0.0.0", "--port", "8123"]
