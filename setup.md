# Setup Instructions

## PostgreSQL & pgvector Installation

To support the fully local Retrieval-Augmented Generation (RAG) pipeline, the backend relies on the `vector` extension in PostgreSQL to perform vector similarity searches for document chunks.

### 1. Update Database Docker Image
Ensure that the `postgres` service in your `docker-compose.yml` (or `docker-compose.dev.yml`) is using the `pgvector` image instead of the standard Postgres image:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    # ... other configurations
```

### 2. Restart the Database
If your database is already running with the standard image, you must restart it so it pulls and uses the `pgvector` image. Run the following from the directory containing your compose file (e.g., `infra/compose`):

```bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up -d
```

### 3. Run Database Migrations
Once the database container is back online with `pgvector` support, you need to apply the backend migrations to create the `vector` extension and the new `documents` and `document_chunks` tables.

Run the following from the `backend` directory:

```bash
source venv/bin/activate
alembic upgrade head
```

### 4. Verify Model Installation
Ensure that you have installed the `nomic-embed-text` model on your active local server (e.g., Ollama). The backend strictly requires this model for embedding document chunks. You can install it via the frontend UI's Server settings.
