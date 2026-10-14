/**
 * Known-insecure default secrets. Development may fall back to these with a
 * loud warning; production must refuse to boot when any of them is in effect.
 * Single source of truth so the fail-closed check cannot drift from the code
 * that consumes the values.
 */
export const DEFAULT_JWT_SECRET = 'whirlcrypt-jwt-secret-change-in-production';
export const DEFAULT_METADATA_KEY = 'whirlcrypt-metadata-master-key-change-in-production-32-bytes!!';
export const DEFAULT_DB_PASSWORD = 'whirlcrypt_password';
/** Dev-only fallback in docker-compose.yml; equally unacceptable in production. */
export const COMPOSE_DEV_DB_PASSWORD = 'whirlcrypt_dev_only';
