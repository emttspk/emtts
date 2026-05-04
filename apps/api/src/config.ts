import { config } from "dotenv";
import { z } from "zod";

config();

const DEFAULT_JWT_SECRET = "development-jwt-secret-at-least-32-chars-long";
const rawJwtSecret = String(process.env.JWT_SECRET ?? "").trim();

if (!rawJwtSecret) {
  console.warn("[STARTUP] JWT_SECRET is missing. Using development fallback secret.");
  process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
} else if (rawJwtSecret.length < 16) {
  console.warn("[STARTUP] JWT_SECRET is weak (less than 16 characters). Using development fallback secret.");
  process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
}

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().default(DEFAULT_JWT_SECRET),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  API_ORIGIN: z.string().optional(),
  STORAGE_DIR: z.string().default("storage"),
  PYTHON_SERVICE_URL: z.string().optional(),
  ADMIN_BOOTSTRAP_SECRET: z.string().min(16).optional(),
  MONEY_ORDER_FRONT_IMAGE_PATH: z.string().optional(),
  MONEY_ORDER_BACK_IMAGE_PATH: z.string().optional(),
  ENABLE_TEMPLATE_DESIGNER: z.string().default("false"),
  EP_GATEWAY_SECRET: z.string().optional(),
  EP_GATEWAY_INITIATE_URL: z.string().url().optional(),
  EP_GATEWAY_INQUIRY_URL: z.string().url().optional(),
  EP_GATEWAY_MERCHANT_ID: z.string().optional(),
  EP_GATEWAY_STORE_ID: z.string().optional(),
  EP_GATEWAY_USERNAME: z.string().optional(),
  EP_GATEWAY_PASSWORD: z.string().optional(),
  EP_GATEWAY_REQUEST_TIMEOUT_MS: z.coerce.number().default(15000),
  EP_GATEWAY_INITIATE_CONTENT_TYPE: z.string().default("application/json"),
  EP_GATEWAY_SIGNATURE_METHOD: z.string().default("hmac"),
  EP_GATEWAY_SIGNATURE_ALGO: z.string().default("sha256"),
  EP_GATEWAY_SIGNATURE_FORMAT: z.string().default("values"),
  EP_GATEWAY_SIGNATURE_FIELDS: z.string().default("reference,status,transactionId,amountCents,timestamp"),
  EP_GATEWAY_STATUS_SUCCESS_VALUES: z.string().default("SUCCESS,SUCCEEDED,PAID,00,000"),
  EP_GATEWAY_STATUS_FAILED_VALUES: z.string().default("FAILED,FAIL,ERROR,01,999"),
  EP_GATEWAY_STATUS_CANCELED_VALUES: z.string().default("CANCELED,CANCELLED,CANCEL"),
});

export const env = envSchema.parse(process.env);
