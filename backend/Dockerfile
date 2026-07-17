FROM python:3.12-slim

WORKDIR /app

# System dependencies for file processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libmagic1 \
    libreoffice-writer \
    libreoffice-impress \
    pandoc \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
