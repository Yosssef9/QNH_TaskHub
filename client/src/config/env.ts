import { z } from 'zod'

const clientEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().trim().min(1).default('/api'),
  VITE_PORTAL_URL: z.string().trim().url().or(z.literal('')).default(''),
})

export const clientEnv = clientEnvSchema.parse(import.meta.env)
