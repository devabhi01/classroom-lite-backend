export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  frontendUrl: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  emailFrom: string;
}

const cleanEnv = (val?: string): string => {
  if (!val) return '';
  return val.trim().replace(/^['"]|['"]$/g, '').trim();
};

export const configuration = (): AppConfig => {
  const rawDbUrl = cleanEnv(process.env.DATABASE_URL);
  const databaseUrl =
    rawDbUrl ||
    'postgresql://username:password@ep-example.neon.tech/tdp_classroom_lite?sslmode=require';

  return {
    port: parseInt(cleanEnv(process.env.PORT) || '3000', 10),
    databaseUrl,
    jwtSecret: cleanEnv(process.env.JWT_SECRET) || 'tdp-classroom-lite-jwt-secret-key-2025',
    jwtExpiresIn: cleanEnv(process.env.JWT_EXPIRES_IN) || '1d',
    frontendUrl: cleanEnv(process.env.FRONTEND_URL) || 'http://localhost:5173',
    smtpHost: cleanEnv(process.env.SMTP_HOST) || 'smtp.gmail.com',
    smtpPort: parseInt(cleanEnv(process.env.SMTP_PORT) || '587', 10),
    smtpUser: cleanEnv(process.env.SMTP_USER || process.env.GMAIL_USER),
    smtpPass: cleanEnv(process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD),
    emailFrom: cleanEnv(process.env.EMAIL_FROM),
  };
};
