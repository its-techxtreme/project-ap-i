# AI metadata providers (Gemini + Groq)

Project AP-I generates YouTube title/description and Instagram caption in **one AI request** per job.

## Order of providers

1. **Google Gemini** (`@google/genai`) — primary  
   - Model default: `gemini-3.5-flash`  
   - Env: `GEMINI_API_KEY`, `GEMINI_MODEL`
2. **Groq** (OpenAI-compatible `openai` SDK) — fallback on Gemini failure / rate limits  
   - Base URL: `https://api.groq.com/openai/v1`  
   - Model default: `llama-3.3-70b-versatile`  
   - Env: `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL`
3. **OpenRouter** (optional tertiary)  
   - Base URL: `https://openrouter.ai/api/v1`  
   - Env: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`
4. **Template / source-caption fallback** — never crash the worker pipeline

## Security

- Put keys only in local `.env` / secret manager — never commit real values.
- Untrusted source title/caption/transcript are wrapped in `<<<UNTRUSTED_SOURCE_TEXT>>>` delimiters.
- Rotate keys if they were pasted into chat, screenshots, or tickets.

## Local smoke

```bash
pnpm --filter @project-api/worker test:metadata-integration
```
