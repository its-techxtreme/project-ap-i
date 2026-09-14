/** Smoke NVIDIA NIM metadata endpoint (OpenAI-compatible). */
const baseUrl = (process.env.AI_PROVIDER_BASE_URL ?? 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '')
const apiKey = process.env.AI_PROVIDER_API_KEY
const model = process.env.AI_MODEL ?? 'meta/llama-3.1-8b-instruct'

if (!apiKey || apiKey === 'REPLACE_ME') {
  console.error('Set AI_PROVIDER_API_KEY in .env (nvapi- key from https://build.nvidia.com → API Keys).')
  process.exit(1)
}

const prompt = `Return JSON only with keys youtubeTitle, youtubeDescription, instagramCaption for a short memes niche clip. Keep titles under 70 chars.`

const res = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [
      { role: 'system', content: 'You write social video metadata. Output valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 512,
    temperature: 0.4,
  }),
})

const body = await res.json()
if (!res.ok) {
  console.error(`NVIDIA API error (${res.status}):`, body)
  if (res.status === 429) {
    console.error('Rate limited — free tier is ~40 RPM; retry with backoff.')
  }
  process.exit(1)
}

const text = body.choices?.[0]?.message?.content ?? ''
console.log('NVIDIA AI OK')
console.log('Model:', model)
console.log('Response preview:\n', text.slice(0, 500))
