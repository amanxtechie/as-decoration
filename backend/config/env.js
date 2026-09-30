/**
 * config/env.js
 * Centralised access to environment variables with sane defaults.
 */
import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: process.env.PORT || 5000,
  clientOrigin: (process.env.CLIENT_ORIGIN || "http://localhost:3000").split(",").map((s) => s.trim()),
  databaseUrl:
    process.env.DATABASE_URL || "postgresql://localhost:5432/asdecoration",
  dbPoolMax: Number(process.env.DB_POOL_MAX || 5),
  jwtSecret: process.env.JWT_SECRET || "dev_insecure_secret_change_me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  nodeEnv: process.env.NODE_ENV || "development",
  adminEmail: process.env.ADMIN_EMAIL || "admin@asdecoration.com",
  adminPassword: process.env.ADMIN_PASSWORD || "ChangeMe123!",
  maxUploadSize: Number(process.env.MAX_UPLOAD_SIZE || 8 * 1024 * 1024),
  allowedImageTypes: (process.env.ALLOWED_IMAGE_TYPES || "image/jpeg,image/png,image/webp").split(",").map((s) => s.trim()),
  whatsappNumber: process.env.WHATSAPP_NUMBER || "917667999217",
  businessName: process.env.BUSINESS_NAME || "AS Decoration",
};

export default env;
