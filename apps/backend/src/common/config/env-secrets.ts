/**
 * Centralized secrets access with production-strength validation.
 *
 * In production (NODE_ENV=production) any secret shorter than `minLength`
 * fails fast at startup, preventing weak/guessable JWT or DB secrets from
 * going live (CWE-321 / OWASP A05 Security Misconfiguration).
 */

export function getSecret(name: string, minLength = 16): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`${name} environment variable is required`);
  }
  if (process.env.NODE_ENV === 'production' && value.length < minLength) {
    throw new Error(
      `${name} must be at least ${minLength} characters in production ` +
      `(current length: ${value.length}). Generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
    );
  }
  return value;
}
