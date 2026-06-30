# NVIDIA NIM — AI metadata (Phase 9)

Project AP-I uses an **OpenAI-compatible** HTTP API for YouTube titles, descriptions, and Instagram captions.

## Recommended provider: NVIDIA build.nvidia.com (free dev tier)

| Setting | Value |
|---------|--------|
| Sign up | https://build.nvidia.com (NVIDIA Developer Program) |
| API keys | Avatar → **API Keys** → Generate (`nvapi-...`) |
| Base URL | `https://integrate.api.nvidia.com/v1` |
| `.env` key | `AI_PROVIDER_API_KEY=<your nvapi key>` |
| Default model | `meta/llama-3.1-8b-instruct` (change via `AI_MODEL`) |

Pick models with the **Free Endpoint** filter in the catalog. Free tier is roughly **40 requests/minute** — Phase 9 will use fallback templates when rate-limited or unavailable.

## Configure

```bash
node scripts/setup-local-env.mjs   # sets base URL + default model
# Add your key to .env:
# AI_PROVIDER_API_KEY=nvapi-...
node --env-file=.env scripts/test-nvidia-ai.mjs
```

## Worker integration (Phase 9)

The worker `AiMetadataProvider` will call:

```http
POST {AI_PROVIDER_BASE_URL}/chat/completions
Authorization: Bearer {AI_PROVIDER_API_KEY}
```

Same interface works with OpenAI, Together, Fireworks, or self-hosted vLLM — only change base URL, key, and model id.

## Rate-limit strategy (MVP)

1. One metadata request per job (batch title + description + caption in one prompt).
2. On HTTP 429 → use `fallbacks.ts` template, set `metadata_status = fallback_used`.
3. Never block upload solely on AI failure unless admin config requires it (per worker spec).
