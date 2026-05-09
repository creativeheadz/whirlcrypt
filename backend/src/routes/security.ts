import { Router } from 'express';
import { handleCSPViolation } from '../middleware/security';

const router = Router();

/**
 * CSP violation report endpoint.
 *
 * Receives Content-Security-Policy-Report-Only violation reports from the
 * browser. Referenced from the `report-uri` directive set in
 * cspMiddleware (backend/src/middleware/security.ts).
 *
 * The previous public Wall of Shame endpoints (stats / wall-of-shame /
 * trends / geography / live-feed / achievements / system-health) were
 * retired with the public /security page. AttackLogger and BanManager
 * keep collecting data; admin-only summaries live under /api/admin/.
 */
router.post('/csp-report', handleCSPViolation);

export default router;
