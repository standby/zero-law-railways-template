# Migrating from OpenClaw to ZeroClaw

This guide helps you migrate your existing OpenClaw deployment to ZeroClaw on Railway.

## Why migrate?

ZeroClaw offers several advantages over OpenClaw:

* **99% less memory usage**: <5MB vs >1GB
* **Faster startup**: <10ms vs >500s on edge hardware
* **Lower cost**: Runs on $10 hardware vs $599+ Mac Mini
* **Rust performance**: Native binary, no Node.js runtime overhead
* **Same functionality**: Compatible with OpenClaw channels and providers

## Before you start

1. **Export your OpenClaw backup**:
   * Visit your OpenClaw `/setup` page
   * Click "Download backup (.tar.gz)"
   * Save the file safely

2. **Note your configuration**:
   * API keys/tokens
   * Channel configurations (Telegram, Discord, etc.)
   * Custom provider settings

## Migration steps

### Option 1: Fresh deployment (recommended)

1. **Deploy ZeroClaw template** to Railway
2. **Configure the same volume mount**: `/data`
3. **Set environment variables**:
   ```
   SETUP_PASSWORD=<your-password>
   ZEROCLAW_STATE_DIR=/data/.zeroclaw
   ZEROCLAW_WORKSPACE_DIR=/data/workspace
   ```
4. **Complete setup wizard** at `/setup`:
   * Enter your API key
   * Configure channels (optional)
5. **Verify functionality**

### Option 2: In-place migration (same volume)

If you want to reuse the same Railway volume:

1. **Stop your OpenClaw service**
2. **Update the service to use this template**:
   * Change the GitHub repo to `standby/zero-law-railways-template`
   * Keep the same volume mount
3. **Update environment variables**:
   ```
   # Change from:
   OPENCLAW_STATE_DIR=/data/.openclaw
   OPENCLAW_WORKSPACE_DIR=/data/workspace
   
   # To:
   ZEROCLAW_STATE_DIR=/data/.zeroclaw
   ZEROCLAW_WORKSPACE_DIR=/data/workspace
   ```
4. **Deploy and test**

### Option 3: Automatic migration (if supported)

ZeroClaw may support automatic migration:

```bash
# SSH into your Railway deployment
railway shell

# Run migration (dry-run first)
zeroclaw migrate openclaw --dry-run

# If successful, run actual migration
zeroclaw migrate openclaw
```

## Configuration differences

### Environment variables

| OpenClaw | ZeroClaw |
|----------|----------|
| `OPENCLAW_STATE_DIR` | `ZEROCLAW_STATE_DIR` |
| `OPENCLAW_WORKSPACE_DIR` | `ZEROCLAW_WORKSPACE_DIR` |
| `OPENCLAW_GATEWAY_TOKEN` | `ZEROCLAW_GATEWAY_TOKEN` |
| `OPENCLAW_PUBLIC_PORT` | `ZEROCLAW_PUBLIC_PORT` |

### Config file format

* **OpenClaw**: JSON/JSON5 format
* **ZeroClaw**: TOML format

The migration tool handles format conversion automatically.

### Channels

Both support:
* ✅ Telegram
* ✅ Discord
* ✅ Slack (partial support in ZeroClaw)

### Providers

Both support OpenAI-compatible providers:
* ✅ OpenRouter
* ✅ OpenAI
* ✅ Anthropic
* ✅ Custom OpenAI-compatible endpoints

## Troubleshooting

### "Config not found" after migration

1. Check that `ZEROCLAW_STATE_DIR` points to the correct directory
2. Verify the volume is mounted at `/data`
3. Check Railway logs for errors

### Channels not working

1. Re-configure channels in the `/setup` wizard
2. Check that bot tokens are still valid
3. Run `zeroclaw channel doctor` for diagnostics

### Performance issues

ZeroClaw should use significantly less memory. If you see issues:

1. Check Railway logs
2. Run `zeroclaw doctor`
3. Verify build completed successfully

## Rollback

If you need to rollback to OpenClaw:

1. **Restore from backup**:
   * Visit `/setup`
   * Use "Import backup" feature
   * Upload your OpenClaw backup file

2. **Redeploy OpenClaw**:
   * Change Railway service back to OpenClaw template
   * Restore environment variables
   * Deploy

## Support

* GitHub Issues: [https://github.com/standby/zero-law-railways-template/issues](https://github.com/standby/zero-law-railways-template/issues)
* ZeroClaw Docs: [https://github.com/zeroclaw-labs/zeroclaw](https://github.com/zeroclaw-labs/zeroclaw)
