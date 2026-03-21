import { z } from 'zod';
import { insertUserSchema, insertSheetSchema, insertProblemSchema, sheets, problems, contests } from './schema';

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
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    register: {
      method: 'POST' as const,
      path: '/api/register',
      input: insertUserSchema,
      responses: {
        201: z.object({ id: z.number(), username: z.string() }),
        400: errorSchemas.validation,
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/login',
      input: z.object({ username: z.string(), password: z.string() }),
      responses: {
        200: z.object({ id: z.number(), username: z.string() }),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout',
      responses: {
        200: z.void(),
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/user',
      responses: {
        200: z.object({ id: z.number(), username: z.string() }),
        401: errorSchemas.unauthorized,
      },
    }
  },
  sheets: {
    list: {
      method: 'GET' as const,
      path: '/api/sheets',
      responses: {
        200: z.array(z.custom<typeof sheets.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/sheets',
      input: insertSheetSchema,
      responses: {
        201: z.custom<typeof sheets.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/sheets/:id',
      responses: {
        200: z.custom<typeof sheets.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/sheets/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    bulkUpload: {
      method: 'POST' as const,
      path: '/api/sheets/bulk-upload',
      responses: {
        201: z.object({
          sheet_name: z.string(),
          total_problems: z.number(),
          problems: z.array(z.custom<typeof problems.$inferSelect>()),
        }),
        400: errorSchemas.validation,
      }
    }
  },
  problems: {
    list: {
      method: 'GET' as const,
      path: '/api/sheets/:id/problems',
      responses: {
        200: z.array(z.custom<typeof problems.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/sheets/:id/problems',
      input: insertProblemSchema.omit({ sheetId: true }),
      responses: {
        201: z.custom<typeof problems.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/problems/:id',
      input: insertProblemSchema.partial().extend({ status: z.string().optional() }),
      responses: {
        200: z.custom<typeof problems.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/problems/:id',
      responses: {
        204: z.void(),
      },
    }
  },
  stats: {
    dashboard: {
      method: 'GET' as const,
      path: '/api/stats/dashboard',
      responses: {
        200: z.object({
          totalProblems: z.number(),
          totalSolved: z.number(),
          solvedToday: z.number(),
          streak: z.number(),
          progress: z.array(z.object({ date: z.string(), count: z.number() })),
        }),
      },
    },
  },
  contests: {
    list: {
      method: 'GET' as const,
      path: '/api/contests',
      responses: {
        200: z.array(z.custom<typeof contests.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/contests/:id',
      responses: {
        200: z.any(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/contests',
      input: z.any(),
      responses: {
        201: z.custom<typeof contests.$inferSelect>(),
        500: errorSchemas.internal,
      },
    },
    join: {
      method: 'POST' as const,
      path: '/api/contests/:id/join',
      responses: {
        200: z.any(),
        500: errorSchemas.internal,
      }
    },
    submit: {
      method: 'POST' as const,
      path: '/api/contests/:id/problems/:problemId/submit',
      input: z.object({ status: z.string() }),
      responses: {
        200: z.any(),
        500: errorSchemas.internal,
      }
    },
    blitzQueue: {
      method: 'POST' as const,
      path: '/api/contests/blitz/queue',
      responses: {
        200: z.custom<typeof contests.$inferSelect>(),
        500: errorSchemas.internal,
      }
    },
    leaderboard: {
      method: 'GET' as const,
      path: '/api/contests/:id/leaderboard',
      responses: {
        200: z.array(z.any()),
        500: errorSchemas.internal,
      }
    }
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
