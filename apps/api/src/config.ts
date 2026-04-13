import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  WEB_ORIGIN: z.string().min(1),
  STORAGE_DIR: z.string().default("apps/api/storage"),
  PYTHON_SERVICE_URL: z.string().default("http://localhost:8000"),
  ADMIN_BOOTSTRAP_SECRET: z.string().min(16).optional(),
  MONEY_ORDER_FRONT_IMAGE_PATH: z.string().optional(),
  MONEY_ORDER_BACK_IMAGE_PATH: z.string().optional(),
});

export const env = envSchema.parse(process.env);
