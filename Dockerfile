FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.6 /uv /bin/uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ ./
COPY data /app/data
COPY web/src/fixtures /app/web/src/fixtures
COPY --from=web /app/web/dist /app/web/dist
# Bundled Bifrost (static Go binary) for single-container hosts like Hugging Face Spaces. config.json holds env.* refs only.
COPY --from=maximhq/bifrost@sha256:b5258c5f11c79064fc8280e49513f54c0b1da81c78bd11d3b4c1f62f8926d1ab /app/main /usr/local/bin/bifrost
COPY bifrost/config.json /app/bifrost/config.json
# Venv first on PATH: agents' `#!/usr/bin/env python3` must find gpt-researcher and mitmproxy, and the runner passes PATH to them.
# ASSAY_DB sits in /app/state so compose can mount a volume there. uid 1000 owns it: Hugging Face Spaces run as that user.
# uid 1000 has no home dir here, so HOME points at a writable one for agent caches.
ENV PATH=/app/backend/.venv/bin:$PATH ASSAY_DB=/app/state/assay.db HOME=/tmp
RUN mkdir -p /app/state && chown 1000 /app/state
USER 1000
EXPOSE 8000
# No BIFROST_URL (Hugging Face): start the bundled Bifrost on localhost only, so its API never faces the internet.
# docker compose sets BIFROST_URL to its own bifrost service and skips this.
CMD ["sh", "-c", "if [ -z \"$BIFROST_URL\" ]; then mkdir -p /app/state/bifrost && cp /app/bifrost/config.json /app/state/bifrost/ && bifrost -app-dir /app/state/bifrost -host 127.0.0.1 -port 8080 & export BIFROST_URL=http://127.0.0.1:8080/v1; fi; exec uvicorn assay.api:app --host 0.0.0.0 --port 8000"]
