import { z } from 'zod';

export const dependencyStatusSchema = z.enum(['up', 'down']);

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  checks: z.object({
    postgres: dependencyStatusSchema,
    redis: dependencyStatusSchema,
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
