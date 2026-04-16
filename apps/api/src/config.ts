import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().default("development-secret-key-at-least-16-chars"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  STORAGE_DIR: z.string().default("storage"),
  PYTHON_SERVICE_URL: z.string().optional(),
  ADMIN_BOOTSTRAP_SECRET: z.string().min(16).optional(),
  MONEY_ORDER_FRONT_IMAGE_PATH: z.string().optional(),
  MONEY_ORDER_BACK_IMAGE_PATH: z.string().optional(),
});

export const env = envSchema.parse(process.env);
