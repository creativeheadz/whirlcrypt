import cron from 'node-cron';
import { CertificateTransparencyMonitor } from '../services/CertificateTransparencyMonitor';
import { config } from '../config/config';

import { createLogger } from '../utils/logger';

const log = createLogger('jobs/certificateMonitoring');

/**
 * Certificate Transparency Monitoring Job
 * Runs periodic checks for certificate misissuance and security threats
 */

export class CertificateMonitoringJob {
  private monitor: CertificateTransparencyMonitor;
  private isRunning: boolean = false;
  private lastRun?: Date;

  constructor() {
    // Initialize with domains from environment or config
    const monitoredDomains = this.getMonitoredDomains();
    this.monitor = new CertificateTransparencyMonitor(monitoredDomains);
    
    log.info(`CT Monitor initialized with domains: ${monitoredDomains.join(', ')}`);
  }

  /**
   * Start the certificate monitoring job
   */
  start(): void {
    // Run every 6 hours (adjust based on your security requirements)
    const schedule = process.env.CT_MONITOR_SCHEDULE || '0 */6 * * *';
    
    cron.schedule(schedule, async () => {
      await this.runMonitoring();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // Run initial check after 1 minute
    setTimeout(() => {
      this.runMonitoring();
    }, 60000);

    log.info(`Certificate monitoring job scheduled: ${schedule}`);
  }

  /**
   * Run certificate monitoring for all domains
   */
  async runMonitoring(): Promise<void> {
    if (this.isRunning) {
      log.info('Certificate monitoring already running, skipping...');
      return;
    }

    this.isRunning = true;
    this.lastRun = new Date();

    try {
      log.info('Starting certificate transparency monitoring...');
      
      const results = await this.monitor.monitorAllDomains();
      
      // Log summary
      const totalCertificates = results.reduce((sum, r) => sum + r.totalFound, 0);
      const totalSuspicious = results.reduce((sum, r) => sum + r.suspiciousCertificates.length, 0);
      const totalNew = results.reduce((sum, r) => sum + r.newCertificates, 0);

      log.info(`CT monitoring completed:`);
      log.info(`  - Domains monitored: ${results.length}`);
      log.info(`  - Total certificates found: ${totalCertificates}`);
      log.info(`  - New certificates: ${totalNew}`);
      log.info(`  - Suspicious certificates: ${totalSuspicious}`);

      // Store results for admin dashboard (optional)
      await this.storeMonitoringResults(results);

      if (totalSuspicious > 0) {
        log.warn(`${totalSuspicious} suspicious certificates detected! Check logs for details.`);
      }

    } catch (error) {
      log.error('Certificate monitoring failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get domains to monitor from environment/config
   */
  private getMonitoredDomains(): string[] {
    // Get domains from environment variable
    const envDomains = process.env.CT_MONITOR_DOMAINS;
    if (envDomains) {
      return envDomains.split(',').map(d => d.trim()).filter(d => d.length > 0);
    }

    // Fallback to common domain patterns
    const domains: string[] = [];
    
    // Add primary domain if configured
    if (process.env.DOMAIN) {
      domains.push(process.env.DOMAIN);
    }

    // Add common subdomains
    const baseDomain = process.env.DOMAIN || 'whirlcrypt.com';
    domains.push(
      baseDomain,
      `www.${baseDomain}`,
      `api.${baseDomain}`,
      `admin.${baseDomain}`,
      `app.${baseDomain}`
    );

    return [...new Set(domains)]; // Remove duplicates
  }

  /**
   * Store monitoring results for dashboard/reporting
   */
  private async storeMonitoringResults(results: any[]): Promise<void> {
    try {
      // In a full implementation, you might store this in database
      // For now, just log the summary
      const summary = {
        timestamp: new Date().toISOString(),
        results: results.map(r => ({
          domain: r.domain,
          totalCertificates: r.totalFound,
          newCertificates: r.newCertificates,
          suspiciousCertificates: r.suspiciousCertificates.length,
          lastChecked: r.lastChecked
        }))
      };

      // Could store in database, send to monitoring service, etc.
      log.info('CT Monitoring Summary:', JSON.stringify(summary, null, 2));

    } catch (error) {
      log.error('Failed to store CT monitoring results:', error);
    }
  }

  /**
   * Add domain to monitoring
   */
  addDomain(domain: string): void {
    this.monitor.addDomain(domain);
  }

  /**
   * Remove domain from monitoring
   */
  removeDomain(domain: string): void {
    this.monitor.removeDomain(domain);
  }

  /**
   * Get monitoring statistics
   */
  getStatistics() {
    return {
      ...this.monitor.getStatistics(),
      isRunning: this.isRunning,
      lastRun: this.lastRun
    };
  }

  /**
   * Force run monitoring (for admin interface)
   */
  async forceRun(): Promise<void> {
    log.info('Force running certificate monitoring...');
    await this.runMonitoring();
  }

  /**
   * Clear monitoring cache
   */
  clearCache(): void {
    this.monitor.clearCache();
  }
}

// Export singleton instance
export const certificateMonitoringJob = new CertificateMonitoringJob();
