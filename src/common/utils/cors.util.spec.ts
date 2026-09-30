import { describe, it, expect } from 'vitest';
import { parseAllowedOrigins, isOriginAllowed } from './cors.util.js';

describe('CORS Utility', () => {
  describe('parseAllowedOrigins', () => {
    it('should return default localhost origins when input is undefined or empty', () => {
      const origins = parseAllowedOrigins();
      expect(origins).toContain('http://localhost:5173');
      expect(origins).toContain('http://localhost:3000');
    });

    it('should split comma-separated origins and remove trailing slashes', () => {
      const input = 'https://my-app.vercel.app/, http://localhost:5173/ , https://another.com';
      const origins = parseAllowedOrigins(input);
      expect(origins).toEqual([
        'https://my-app.vercel.app',
        'http://localhost:5173',
        'https://another.com',
      ]);
    });
  });

  describe('isOriginAllowed', () => {
    const allowed = [
      'https://classroom-lite.vercel.app',
      'https://*.mycustomdomain.com',
      'http://localhost:5173',
    ];

    it('should allow requests with no origin (e.g. server-to-server or tools)', () => {
      expect(isOriginAllowed(undefined, allowed)).toBe(true);
    });

    it('should allow exact match origin regardless of trailing slash or case', () => {
      expect(isOriginAllowed('https://classroom-lite.vercel.app', allowed)).toBe(true);
      expect(isOriginAllowed('https://classroom-lite.vercel.app/', allowed)).toBe(true);
      expect(isOriginAllowed('HTTPS://CLASSROOM-LITE.VERCEL.APP', allowed)).toBe(true);
    });

    it('should allow wildcard subdomain match', () => {
      expect(isOriginAllowed('https://app.mycustomdomain.com', allowed)).toBe(true);
      expect(isOriginAllowed('https://preview-1.mycustomdomain.com', allowed)).toBe(true);
    });

    it('should reject unlisted foreign origins', () => {
      expect(isOriginAllowed('https://malicious-site.com', allowed)).toBe(false);
      expect(isOriginAllowed('https://fake-classroom-lite.vercel.app.bad.com', allowed)).toBe(false);
      expect(isOriginAllowed('https://otherdomain.com', allowed)).toBe(false);
    });

    it('should allow everything if wildcard * is configured', () => {
      expect(isOriginAllowed('https://any-site.com', ['*'])).toBe(true);
    });
  });
});
