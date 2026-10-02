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

export const configuration = (): AppConfig => {
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://username:password@ep-example.neon.tech/tdp_classroom_lite?sslmode=require';

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    databaseUrl,
    jwtSecret: process.env.JWT_SECRET || 'tdp-classroom-lite-jwt-secret-key-2025',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    smtpUser: process.env.SMTP_USER || process.env.GMAIL_USER || '',
    smtpPass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '',
    emailFrom: process.env.EMAIL_FROM || '',
  };
};
