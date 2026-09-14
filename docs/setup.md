# Laptop setup extras

README has the clone / env / stack steps. this page is just the bits I keep forgetting.

## Stack

- Docker n8n talks to the worker at `http://host.docker.internal:3001`
- `pnpm stack:up` / `pnpm stack:status` / `pnpm stack:down`
- laptop sleeps = queue sleeps. that's the deal

## n8n

Import JSON from `infra/n8n/workflows/`. credential names have to match. writeup: [infra/n8n/README.md](../infra/n8n/README.md) and [infra/n8n/credentials_setup.md](../infra/n8n/credentials_setup.md).

Activate WF-01, WF-07, WF-08 at least. hosted admin Retry only works if WF-07 is alive on this machine.

## Drive

[infra/google-drive/SETUP.md](../infra/google-drive/SETUP.md)

prefer a service account json if you can. old Testing-mode oauth tokens die.

## Chrome profiles

`playwright-profiles/` is gitignored. login once per niche:

```bash
pnpm --filter @project-api/worker smoke:playwright -- --login --profile memes-yt
```

never upload from `ig-collector`. that's harvest only.

## Titles / captions

see [captions.md](./captions.md)
