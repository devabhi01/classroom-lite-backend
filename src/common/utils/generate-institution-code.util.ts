/**
 * Generates a unique, short, human-readable institution code.
 * Example: TDP82K4
 */
export function generateInstitutionCode(prefix = 'TDP', randomChars = 4): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = prefix;
  for (let i = 0; i < randomChars; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  return result;
}
