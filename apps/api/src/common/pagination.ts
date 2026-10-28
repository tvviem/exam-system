import { z } from 'zod';

// Q67: mặc định 20, tối đa 100.
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Page = z.infer<typeof pageSchema>;
