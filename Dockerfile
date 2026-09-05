# Multi-runtime Dockerfile for ClipFlow Studio (clip-app)
# Includes Node.js 20, Python 3 with faster-whisper & OpenCV, FFmpeg, and yt-dlp

FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

# 1. Install system utilities, media tools, and C/C++ runtime libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
    fonts-liberation \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# 2. Install latest yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# 3. Setup Python virtual environment & install Python AI dependencies
COPY python/requirements.txt ./python/requirements.txt
RUN python3 -m venv /app/.venv \
    && /app/.venv/bin/pip install --no-cache-dir --upgrade pip \
    && /app/.venv/bin/pip install --no-cache-dir -r ./python/requirements.txt

# Expose .venv to PATH and set PYTHON_PATH
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHON_PATH="/app/.venv/bin/python"

# 4. Pre-download default Whisper AI model to container cache to eliminate runtime cold-start
RUN /app/.venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')" || true

# 5. Install Node.js production dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev && npx prisma generate

# 6. Copy application source code
COPY . .

# 7. Create storage directories for media uploads and exports
RUN mkdir -p uploads exports temp

# 8. Normalize Windows CRLF line endings on entrypoint script and make executable
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

EXPOSE 3000 7860

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]
