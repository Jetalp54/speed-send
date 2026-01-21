FROM python:3.11-slim

WORKDIR /app

# Install system dependencies in one layer and clean up immediately
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /var/cache/apt/archives/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies with no cache
RUN pip install --no-cache-dir -r requirements.txt \
    && pip cache purge

# Copy application code
COPY . .
COPY fix_db.py /app/fix_db.py

# Create service accounts directory
RUN mkdir -p /app/service_accounts

# Clean up any temporary files
RUN find /app -name "*.pyc" -delete \
    && find /app -name "__pycache__" -type d -exec rm -rf {} + \
    || true

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

