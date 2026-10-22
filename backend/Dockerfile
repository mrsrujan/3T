FROM python:3.11-slim AS builder

WORKDIR /build

# `strip` (via binutils) is used at the end of this stage to shrink shared
# libraries; otherwise everything is a wheel install so no gcc needed.
RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# --no-compile skips .pyc generation; ~50 MB smaller tree. Python regenerates
# at first import if PYC_WRITE is allowed, which we disable at runtime below.
RUN pip install --no-cache-dir --no-compile --prefix=/install -r requirements.txt

# Prune bits that ship inside wheels but aren't needed at runtime.
# Only remove `tests` directories (plural, lowercase) — this is the near-
# universal convention for unit test code. Do NOT touch `testing/` modules,
# which several packages (notably numpy.testing, pandas._testing) expose
# as public APIs other scientific libs import. Also strip debug symbols
# from the native .so files.
RUN set -eux; \
    cd /install/lib/python3.11/site-packages; \
    find . -type d -name tests -prune -exec rm -rf {} +; \
    find . -type d -name __pycache__ -prune -exec rm -rf {} +; \
    find . -type f \( -name "*.pyc" -o -name "*.pyo" \) -delete; \
    find . -name "*.so" -exec strip --strip-unneeded {} + 2>/dev/null || true; \
    find . -name "*.so.*" -exec strip --strip-unneeded {} + 2>/dev/null || true


FROM python:3.11-slim

# Runtime deps:
# - ca-certificates for HTTPS to Yahoo Finance / NSE / Google News
# - libgomp1 for lightgbm (OpenMP)
# - curl for container healthchecks and quick ops debugging
# - tzdata for APScheduler CronTrigger(timezone=...) on local dev
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libgomp1 \
    curl \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Non-root user. Explicit UID so a PVC mounted into /data has a predictable
# ownership target.
RUN groupadd --system --gid 10001 app && \
    useradd  --system --uid 10001 --gid app --home /app app

COPY --from=builder /install /usr/local

WORKDIR /app

# Copy app code AFTER deps so Python code churn doesn't bust the deps layer.
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts

# /data is where SQLite dev DBs or any file-based state can go. Not required
# when using Postgres but kept so local SQLite runs via this image still work.
RUN mkdir -p /data && chown app:app /data /app

USER app

# Skip .pyc writing at runtime - the slim image deliberately shipped without
# bytecode caches to shrink. Letting Python regen them per-pod would eat the
# savings back on first request to each module.
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
