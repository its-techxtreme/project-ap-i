import { z } from 'zod'
import { NICHE_SLUGS, PLATFORMS } from './constants'
import { validateSourceUrl } from './urls'

/**
 * Zod schema for the job submission form.
 * Used by both frontend (client-side) and Vercel server action (server-side).
 * The server MUST re-validate with this schema even if frontend already validated.
 */
export const SubmitJobSchema = z
  .object({
    sourceUrl: z
      .string()
      .min(1, 'URL is required.')
      .refine((url) => {
        const result = validateSourceUrl(url)
        return result.valid
      }, 'Only YouTube and Instagram links are supported.'),

    sourcePlatform: z.enum(PLATFORMS, {
      errorMap: () => ({ message: 'Platform must be youtube or instagram.' }),
    }),

    nicheId: z.string().uuid('Please select a valid niche.'),

    rightsConfirmed: z.literal(true, {
      errorMap: () => ({ message: 'You must confirm rights permission before submitting.' }),
    }),
  })
  .strict()

export type SubmitJobInput = z.infer<typeof SubmitJobSchema>

/**
 * Schema for the worker job claim response.
 */
export const WorkerClaimedJobSchema = z.object({
  id: z.string().uuid(),
  sourceUrl: z.string().url(),
  sourcePlatform: z.enum(PLATFORMS),
  nicheId: z.string().uuid(),
  rightsConfirmed: z.literal(true),
  status: z.string(),
  lockedBy: z.string().nullable(),
  lockedAt: z.string().datetime().nullable(),
  lockExpiresAt: z.string().datetime().nullable(),
})

export type WorkerClaimedJob = z.infer<typeof WorkerClaimedJobSchema>

/**
 * Schema for niche slug validation.
 * Use this when validating niche slugs from the database or config.
 */
export const NicheSlugSchema = z.enum(NICHE_SLUGS)
