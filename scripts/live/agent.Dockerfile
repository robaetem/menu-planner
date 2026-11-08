FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep ca-certificates && rm -rf /var/lib/apt/lists/* \
 && npm install -g opencode-ai@1.19.5 && npm cache clean --force
ENV HOME=/tmp/home
WORKDIR /work
