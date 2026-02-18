# Build zeroclaw from source
FROM rust:1.85-bookworm AS zeroclaw-build

# Dependencies for building zeroclaw
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    pkg-config \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /zeroclaw

# Pin to a known-good ref (tag/branch). Override in Railway template settings if needed.
ARG ZEROCLAW_GIT_REF=main
RUN git clone --depth 1 --branch "${ZEROCLAW_GIT_REF}" https://github.com/zeroclaw-labs/zeroclaw.git .

# Build zeroclaw in release mode
# Using release profile optimized for production deployment
RUN cargo build --release --locked

# Runtime image
FROM debian:bookworm-slim
ENV RUST_BACKTRACE=1

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Install Node.js for wrapper server
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built zeroclaw binary
COPY --from=zeroclaw-build /zeroclaw/target/release/zeroclaw /usr/local/bin/zeroclaw

# Verify zeroclaw binary works
RUN zeroclaw --version

# Wrapper deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src

# The wrapper listens on $PORT.
# IMPORTANT: Do not set a default PORT here.
# Railway injects PORT at runtime and routes traffic to that port.
EXPOSE 3000
CMD ["node", "src/server.js"]
