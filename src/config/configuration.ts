export interface AppConfig {
  port: number;
  mongodbUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  frontendUrl: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  fast2smsApiKey?: string;
}

export const configuration = (): AppConfig => {
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) {
    throw new Error(
      'FATAL: MONGODB_URI environment variable is missing! Please configure MONGODB_URI in your .env file.',
    );
  }

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    mongodbUri,
    jwtSecret: process.env.JWT_SECRET || 'tdp-classroom-lite-jwt-secret-key-2025',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpFrom: process.env.SMTP_FROM || 'TDP Classroom Lite <noreply@tdpclassroom.com>',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM || '',
    fast2smsApiKey: process.env.FAST2SMS_API_KEY || '',
  };
};
