# ZeroClaw Railway Template (1-click deploy)

This repo packages **ZeroClaw** for Railway with a **/setup** web wizard so users can deploy and onboard **without running any commands**.

## What you get

* **ZeroClaw Gateway** (Rust-based, lightweight AI assistant infrastructure)
* A friendly **Setup Wizard** at `/setup` (protected by a password)
* Persistent state via **Railway Volume** (so config/credentials/memory survive redeploys)
* One-click **Export backup** (so users can migrate off Railway later)
* **99% less memory** than OpenClaw (runs in <5MB RAM)
* **Fast cold starts** (Rust binary, near-instant startup)

## How it works (high level)

* The container runs a Node.js wrapper web server
* The wrapper protects `/setup` with `SETUP_PASSWORD`
* During setup, the wrapper runs `zeroclaw onboard` inside the container, writes state to the volume, and then starts the gateway
* After setup, **`/` is ZeroClaw**. The wrapper reverse-proxies all traffic (including WebSockets) to the local gateway process

## Railway deploy instructions

In Railway Template Composer:

1. Create a new template from this GitHub repo
2. Add a **Volume** mounted at `/data`
3. Set the following variables:

Required:
* `SETUP_PASSWORD` — user-provided password to access `/setup`

Recommended:
* `ZEROCLAW_STATE_DIR=/data/.zeroclaw`
* `ZEROCLAW_WORKSPACE_DIR=/data/workspace`

Optional:
* `ZEROCLAW_GATEWAY_TOKEN` — if not set, the wrapper generates one

Notes:
* This template uses the latest ZeroClaw from `main` branch by default
* Override `ZEROCLAW_GIT_REF` build arg to pin to a specific tag/branch

4. Enable **Public Networking** (HTTP). Railway will assign a domain
   * This service listens on Railway's injected `PORT` at runtime
5. Deploy

Then:
* Visit `https://<your-app>.up.railway.app/setup`
* Complete setup with your API key
* Visit `https://<your-app>.up.railway.app/` to use ZeroClaw

## Migration from OpenClaw

If you're migrating from OpenClaw to ZeroClaw:

1. **Export your OpenClaw backup** from the old deployment
2. **Deploy this ZeroClaw template** with the same volume configuration
3. **Run migration** (if available):
   ```bash
   zeroclaw migrate openclaw --dry-run
   zeroclaw migrate openclaw
   ```
4. The migration tool will attempt to convert OpenClaw config to ZeroClaw format

## Key differences: ZeroClaw vs OpenClaw

| Feature | OpenClaw | ZeroClaw |
|---------|----------|----------|
| Language | TypeScript/Node.js | Rust |
| Memory | >1GB | <5MB |
| Startup | >500s (0.8GHz) | <10ms (0.8GHz) |
| Binary Size | ~28MB + Node runtime | 8.8MB static binary |
| Cost | Mac Mini $599+ | Any hardware $10+ |

## Support / community

* GitHub Issues: [https://github.com/standby/zero-law-railways-template/issues](https://github.com/standby/zero-law-railways-template/issues)
* ZeroClaw Docs: [https://github.com/zeroclaw-labs/zeroclaw](https://github.com/zeroclaw-labs/zeroclaw)

## Getting API keys

### OpenRouter (Recommended)
1. Visit [https://openrouter.ai/](https://openrouter.ai/)
2. Sign up for an account
3. Go to API Keys section and create a new key
4. Paste the key (starts with `sk-or-...`) into `/setup`

### OpenAI
1. Visit [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new secret key
3. Copy the key (starts with `sk-...`) and paste into `/setup`

### Anthropic
1. Visit [https://console.anthropic.com/](https://console.anthropic.com/)
2. Go to API Keys
3. Create a new key
4. Copy and paste into `/setup`

### Telegram bot token (optional)
1. Open Telegram and message **@BotFather**
2. Run `/newbot` and follow the prompts
3. BotFather will give you a token that looks like: `123456789:AA...`
4. Paste that token into `/setup`

### Discord bot token (optional)
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. **New Application** → pick a name
3. Open the **Bot** tab → **Add Bot**
4. Copy the **Bot Token** and paste it into `/setup`
5. Invite the bot to your server

## Troubleshooting

### "Application failed to respond" / 502 Bad Gateway

Most often this means the wrapper is up, but the gateway can't start.

Checklist:
* Ensure you mounted a **Volume** at `/data` and set:
  * `ZEROCLAW_STATE_DIR=/data/.zeroclaw`
  * `ZEROCLAW_WORKSPACE_DIR=/data/workspace`
* Ensure **Public Networking** is enabled (Railway will inject `PORT`)
* Check Railway logs for errors

### Build OOM (out of memory) on Railway

Building ZeroClaw from source (Rust) can exceed small memory tiers.

Recommendations:
* Use a plan with **2GB+ memory** for builds
* The runtime only needs minimal memory (<100MB)

## Local smoke test

```bash
docker build -t zeroclaw-railway-template .
docker run --rm -p 3000:3000 \
  -e SETUP_PASSWORD=test123 \
  -e PORT=3000 \
  -v $(pwd)/data:/data \
  zeroclaw-railway-template
```

Then visit http://localhost:3000/setup (user: any, password: test123)

## License

MIT 
