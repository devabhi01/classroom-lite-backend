export interface AppConfig {
  port: number;
  mongodbUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  frontendUrl: string;
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
  };
};
