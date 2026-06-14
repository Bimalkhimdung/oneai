# syntax=docker/dockerfile:1.7

# ── Stage 1: Python deps ────────────────────────────────────────────────────
FROM python:3.11-slim AS deps

# Install build tools needed by some Python packages (e.g. psycopg2, pgvector)
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM python:3.11-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
      libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

# Copy installed packages from deps stage
COPY --from=deps /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy the backend source
COPY backend/ .

# Switch to non-root user
USER app

EXPOSE 4000

# Run migrations then start the server
CMD ["sh", "-c", "alembic upgrade head && python run.py"]
