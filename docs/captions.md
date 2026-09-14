# Titles and captions

Worker writes one YouTube title, one YouTube description, and one Instagram caption per job.

Order:

1. Gemini (`GEMINI_API_KEY`, default model `gemini-3.5-flash`)
2. Groq if Gemini flakes (`GROQ_API_KEY`)
3. OpenRouter only if you set those keys
4. if none of that works it uses cleaned source text + niche tags. job still moves

keys live in `.env` only. don't paste them in the readme.

```bash
pnpm --filter @project-api/worker test:metadata-integration
```
