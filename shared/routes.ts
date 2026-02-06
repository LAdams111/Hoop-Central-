import { z } from "zod";
import { insertPlayerSchema, insertPlayerStatsSchema, players, playerStats } from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  players: {
    list: {
      method: 'GET' as const,
      path: '/api/players',
      input: z.object({
        search: z.string().optional(),
        position: z.string().optional(),
        sortBy: z.enum(["views", "name"]).optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof players.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/players/:id',
      responses: {
        200: z.custom<typeof players.$inferSelect & { stats: typeof playerStats.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
  },
  teams: {
    roster: {
      method: 'GET' as const,
      path: '/api/teams/:team/roster/:season',
      responses: {
        200: z.array(z.custom<typeof players.$inferSelect>()),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
