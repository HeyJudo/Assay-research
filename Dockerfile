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
COPY web/src/fixtures /app/web/src/fixtures
COPY --from=web /app/web/dist /app/web/dist
EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "assay.api:app", "--host", "0.0.0.0", "--port", "8000"]
