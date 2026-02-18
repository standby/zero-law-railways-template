# Quick Deployment Guide

## Deploy to Railway in 5 minutes

### Step 1: Fork or Deploy

**Option A: Use Railway Template (Recommended)**
1. Visit Railway Templates
2. Search for "ZeroClaw"
3. Click "Deploy" button
4. Railway will handle everything automatically

**Option B: Manual Deployment**
1. Fork this repository to your GitHub account
2. Log in to [Railway](https://railway.app)
3. Create a new project
4. Connect your forked repository
5. Railway will detect the Dockerfile and build automatically

### Step 2: Configure Environment

Set these required variables in Railway:

```env
SETUP_PASSWORD=your-strong-password-here
```

Recommended (Railway sets these by default via railway.toml):
```env
ZEROCLAW_STATE_DIR=/data/.zeroclaw
ZEROCLAW_WORKSPACE_DIR=/data/workspace
```

### Step 3: Add Volume

1. In Railway project settings, go to "Volumes"
2. Click "Add Volume"
3. Mount path: `/data`
4. Railway will create persistent storage automatically

### Step 4: Enable Public Domain

1. Go to project Settings → Networking
2. Click "Generate Domain" or add custom domain
3. Railway will assign a public URL like `your-app.up.railway.app`

### Step 5: Complete Setup

1. Visit `https://your-app.up.railway.app/setup`
2. Log in with any username and your `SETUP_PASSWORD`
3. Enter your API key (OpenRouter, OpenAI, Anthropic, etc.)
4. Optionally configure Telegram/Discord bots
5. Click "Run setup"

### Step 6: Use ZeroClaw!

Visit `https://your-app.up.railway.app/` to use your ZeroClaw instance.

## Troubleshooting

### Build fails with OOM

Railway's free tier has memory limits. For building:
- Upgrade to a plan with 2GB+ memory for builds
- Runtime only needs <100MB

### "Application failed to respond"

Check that:
- Volume is mounted at `/data`
- `SETUP_PASSWORD` is set
- Build completed successfully (check logs)

### Can't access /setup

- Verify `SETUP_PASSWORD` is set in environment variables
- Check that the domain is properly configured
- Look for errors in Railway logs

## Cost Estimate

| Tier | Build | Runtime | Cost/month |
|------|-------|---------|------------|
| Free | Limited | <100MB | $0 (with limits) |
| Hobby | 2GB | <100MB | ~$5-10 |
| Pro | 8GB | <100MB | ~$10-20 |

ZeroClaw's low memory footprint (<5MB) makes it extremely cost-effective on Railway.

## Next Steps

After deployment:
- [ ] Bookmark your ZeroClaw URL
- [ ] Set up Telegram/Discord bots (optional)
- [ ] Download backup from `/setup/export`
- [ ] Invite others to use your instance
- [ ] Configure custom provider endpoints (advanced)

## Getting Help

- 📚 [Full README](README.md)
- 🔒 [Security Policy](SECURITY.md)
- 🔄 [Migration Guide](MIGRATION.md)
- 🐛 [Report Issues](https://github.com/standby/zero-law-railways-template/issues)

## Railway-Specific Tips

**Build Time**: First build takes 10-20 minutes (compiling Rust). Rebuilds are faster with Docker cache.

**Memory Usage**: 
- Build: ~2GB required
- Runtime: <100MB actual usage
- ZeroClaw binary: 8.8MB

**Restart Policy**: Template uses `on_failure` - Railway will auto-restart if crashed.

**Health Checks**: Railway uses `/setup/healthz` endpoint with 300s timeout.

## Verification Checklist

After deployment, verify:
- [ ] `/setup/healthz` returns `{"ok":true}`
- [ ] `/setup` requires password
- [ ] Can complete onboarding wizard
- [ ] Gateway starts after setup
- [ ] Can access ZeroClaw at root URL
- [ ] Backup export works

## Advanced Configuration

### Custom Git Ref

To use a specific ZeroClaw version, set build arg:
```
ZEROCLAW_GIT_REF=v1.0.0
```

### Custom Binary Path

If you have a pre-built binary:
```env
ZEROCLAW_BIN=/path/to/zeroclaw
```

### Custom Gateway Port

```env
INTERNAL_GATEWAY_PORT=18789
```

## Performance Expectations

On Railway's shared CPU:
- Cold start: <5 seconds
- Gateway startup: <2 seconds
- Memory usage: 4-5MB idle, <50MB active
- Request latency: <100ms (excluding AI provider)

## Monitoring

Check Railway logs for:
```
[wrapper] listening on port 3000
[wrapper] configured: true
[gateway] started successfully
```

Use `/healthz` endpoint for uptime monitoring.
