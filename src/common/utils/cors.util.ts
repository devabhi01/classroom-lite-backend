export const parseAllowedOrigins = (envUrl?: string): string[] => {
  const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];

  if (!envUrl) {
    return defaultOrigins;
  }

  const origins = envUrl
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o.length > 0);

  return origins.length > 0 ? origins : defaultOrigins;
};

export const isOriginAllowed = (
  origin: string | undefined,
  allowedOrigins: string[],
): boolean => {
  // If no origin header is provided (e.g. server-to-server health checks, curl, Postman), allow
  if (!origin) {
    return true;
  }

  const cleanOrigin = origin.trim().replace(/\/+$/, '').toLowerCase();

  return allowedOrigins.some((allowed) => {
    if (allowed === '*') return true;
    const cleanAllowed = allowed.trim().replace(/\/+$/, '').toLowerCase();

    // Exact match
    if (cleanOrigin === cleanAllowed) {
      return true;
    }

    // Wildcard matching (e.g. "https://*.vercel.app" or "https://*.netlify.app")
    if (cleanAllowed.includes('*')) {
      const escaped = cleanAllowed
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]+');
      const regex = new RegExp(`^${escaped}$`, 'i');
      if (regex.test(cleanOrigin)) {
        return true;
      }
    }

    return false;
  });
};
