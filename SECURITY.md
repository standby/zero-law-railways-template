# Security Policy

## Security Measures

This Railway template for ZeroClaw includes multiple layers of security:

### Authentication

* **Setup Password Protection**: All `/setup` endpoints require HTTP Basic Authentication with `SETUP_PASSWORD`
* **Gateway Token**: Internal gateway communication uses a randomly generated token
* **No Default Passwords**: Operators must set `SETUP_PASSWORD` before deployment

### Rate Limiting

All file system operation endpoints are rate-limited:

* `/setup/app.js`: 60 requests per minute per IP
* `/setup/api/run`: 10 requests per minute per IP
* `/setup/api/reset`: 5 requests per minute per IP
* `/setup/export`: 5 requests per 5 minutes per IP

Rate limits apply after authentication, providing defense-in-depth.

### Network Isolation

* **Internal Gateway**: ZeroClaw gateway binds to `127.0.0.1` only
* **Proxy Layer**: Node.js wrapper acts as reverse proxy, adding security controls
* **No Direct Gateway Access**: External traffic cannot reach gateway directly

### Data Protection

* **Volume Isolation**: State and workspace use dedicated Railway volume at `/data`
* **Secret Redaction**: Debug endpoints redact API keys and tokens from output
* **File Permissions**: Gateway token file created with `0o600` (owner-only)

### Input Validation

* **Command Allowlisting**: Debug console only allows predefined safe commands
* **Parameter Sanitization**: Device IDs and plugin names validated before use
* **JSON Size Limits**: Request bodies limited to 1MB

## Known Considerations

### CodeQL Alerts

CodeQL may flag file system operations as missing rate limiting. These alerts are **addressed** but may still appear because:

1. **Custom Implementation**: We use a custom rate limiting middleware that CodeQL's static analysis may not recognize
2. **Authentication**: All flagged endpoints require authentication via `requireSetupAuth`
3. **Defense-in-Depth**: Rate limiting provides additional protection beyond authentication

**Flagged endpoints and their protections:**

| Endpoint | Authentication | Rate Limit | Purpose |
|----------|---------------|------------|---------|
| `/setup/app.js` | ✅ Basic Auth | ✅ 60/min | Serve setup wizard JS |
| `/setup/api/run` | ✅ Basic Auth | ✅ 10/min | Run onboarding |
| `/setup/api/reset` | ✅ Basic Auth | ✅ 5/min | Reset configuration |
| `/setup/export` | ✅ Basic Auth | ✅ 5/5min | Export backup |

### Deployment Security

**Required Actions:**

1. **Set Strong Password**: Use a strong, unique `SETUP_PASSWORD`
2. **Rotate Tokens**: Periodically rotate `SETUP_PASSWORD` and `ZEROCLAW_GATEWAY_TOKEN`
3. **Monitor Access**: Review Railway logs for suspicious activity
4. **Keep Updated**: Rebuild image regularly to get ZeroClaw security updates

## Reporting Vulnerabilities

If you discover a security issue:

1. **Do not** open a public issue
2. Email security details to the repository maintainers
3. Include:
   * Description of the vulnerability
   * Steps to reproduce
   * Potential impact
   * Suggested fix (if any)

We will respond within 48 hours and work on a fix.

## Security Checklist for Deploying

- [ ] Set a strong `SETUP_PASSWORD` (16+ characters, random)
- [ ] Use Railway's secret generation for `ZEROCLAW_GATEWAY_TOKEN`
- [ ] Enable Railway's automatic SSL/TLS
- [ ] Review Railway logs after deployment
- [ ] Test `/setup` access with incorrect password (should reject)
- [ ] Verify `/healthz` works without authentication
- [ ] Keep ZeroClaw updated by rebuilding periodically

## Security Features by Design

* **Minimal Attack Surface**: Only `/setup` and `/healthz` exposed before configuration
* **Stateless Rate Limiting**: In-memory tracking, no database required
* **Graceful Degradation**: If rate limit exceeded, returns clear 429 error
* **No Secrets in Logs**: Automatic redaction of API keys in output
* **Secure Defaults**: Gateway token auto-generated if not provided

## Compliance

This template follows security best practices:

* OWASP Top 10 considerations
* Least privilege principle (internal gateway binding)
* Defense in depth (authentication + rate limiting)
* Secure defaults (no hardcoded secrets)

## Updates

This security policy applies to the current version. Check the repository for updates when deploying.

Last updated: 2026-02-18
