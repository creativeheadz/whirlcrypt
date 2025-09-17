import axios from 'axios';
import { createHash } from 'crypto';

/**
 * Certificate Transparency Monitor - Wormhole-inspired security monitoring
 * Monitors CT logs for certificate misissuance and potential attacks
 */

export interface CTLogEntry {
  logId: string;
  timestamp: Date;
  leafInput: string;
  extraData: string;
  certificate?: ParsedCertificate;
}

export interface ParsedCertificate {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  subjectAltNames: string[];
  fingerprint: string;
}

export interface CTMonitoringResult {
  domain: string;
  certificates: CTLogEntry[];
  suspiciousCertificates: CTLogEntry[];
  lastChecked: Date;
  totalFound: number;
  newCertificates: number;
}

export class CertificateTransparencyMonitor {
  private static readonly CT_LOGS = [
    'https://ct.googleapis.com/logs/argon2024/',
    'https://ct.googleapis.com/logs/xenon2024/',
    'https://ct.cloudflare.com/logs/nimbus2024/',
    'https://ct.digicert.com/log/',
    'https://ct.letsencrypt.org/2024h1/'
  ];

  private static readonly SUSPICIOUS_PATTERNS = [
    /phishing/i,
    /malware/i,
    /fake/i,
    /scam/i,
    /fraud/i,
    /suspicious/i,
    /test/i,
    /dev/i,
    /staging/i
  ];

  private knownCertificates: Set<string> = new Set();
  private monitoredDomains: string[] = [];

  constructor(domains: string[] = []) {
    this.monitoredDomains = domains;
  }

  /**
   * Add domain to monitoring list
   */
  addDomain(domain: string): void {
    if (!this.monitoredDomains.includes(domain)) {
      this.monitoredDomains.push(domain);
      console.log(`🔍 Added domain to CT monitoring: ${domain}`);
    }
  }

  /**
   * Remove domain from monitoring
   */
  removeDomain(domain: string): void {
    const index = this.monitoredDomains.indexOf(domain);
    if (index > -1) {
      this.monitoredDomains.splice(index, 1);
      console.log(`🗑️ Removed domain from CT monitoring: ${domain}`);
    }
  }

  /**
   * Monitor all configured domains for new certificates
   */
  async monitorAllDomains(): Promise<CTMonitoringResult[]> {
    const results: CTMonitoringResult[] = [];
    
    for (const domain of this.monitoredDomains) {
      try {
        const result = await this.monitorDomain(domain);
        results.push(result);
        
        // Alert on suspicious certificates
        if (result.suspiciousCertificates.length > 0) {
          await this.alertSuspiciousCertificates(domain, result.suspiciousCertificates);
        }
        
        // Alert on new certificates
        if (result.newCertificates > 0) {
          console.log(`🆕 Found ${result.newCertificates} new certificates for ${domain}`);
        }
        
      } catch (error) {
        console.error(`❌ CT monitoring failed for ${domain}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Monitor a specific domain for certificates
   */
  async monitorDomain(domain: string): Promise<CTMonitoringResult> {
    console.log(`🔍 Monitoring CT logs for domain: ${domain}`);
    
    const allCertificates: CTLogEntry[] = [];
    const suspiciousCertificates: CTLogEntry[] = [];
    let newCertificates = 0;

    // Query multiple CT logs for comprehensive coverage
    for (const logUrl of CertificateTransparencyMonitor.CT_LOGS) {
      try {
        const certificates = await this.queryCTLog(logUrl, domain);
        
        for (const cert of certificates) {
          const certHash = this.getCertificateHash(cert);
          
          // Check if this is a new certificate
          if (!this.knownCertificates.has(certHash)) {
            this.knownCertificates.add(certHash);
            newCertificates++;
          }
          
          allCertificates.push(cert);
          
          // Check for suspicious patterns
          if (this.isSuspiciousCertificate(cert, domain)) {
            suspiciousCertificates.push(cert);
          }
        }
        
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`⚠️ Failed to query CT log ${logUrl}:`, message);
      }
    }

    return {
      domain,
      certificates: allCertificates,
      suspiciousCertificates,
      lastChecked: new Date(),
      totalFound: allCertificates.length,
      newCertificates
    };
  }

  /**
   * Query a specific CT log for domain certificates
   */
  private async queryCTLog(logUrl: string, domain: string): Promise<CTLogEntry[]> {
    try {
      // Use crt.sh API as it's more accessible than raw CT logs
      const crtShUrl = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
      
      const response = await axios.get(crtShUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Whirlcrypt-CT-Monitor/1.0'
        }
      });

      if (!Array.isArray(response.data)) {
        return [];
      }

      return response.data.map((entry: any) => ({
        logId: 'crt.sh',
        timestamp: new Date(entry.not_before || entry.entry_timestamp),
        leafInput: entry.id?.toString() || '',
        extraData: '',
        certificate: {
          subject: entry.name_value || entry.common_name || '',
          issuer: entry.issuer_name || '',
          serialNumber: entry.serial_number || '',
          notBefore: new Date(entry.not_before),
          notAfter: new Date(entry.not_after),
          subjectAltNames: entry.name_value ? entry.name_value.split('\n') : [],
          fingerprint: this.generateFingerprint(entry)
        }
      }));

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Failed to query ${logUrl}:`, message);
      return [];
    }
  }

  /**
   * Check if a certificate is suspicious
   */
  private isSuspiciousCertificate(cert: CTLogEntry, expectedDomain: string): boolean {
    if (!cert.certificate) return false;

    const { subject, subjectAltNames } = cert.certificate;
    const allNames = [subject, ...subjectAltNames].join(' ').toLowerCase();
    const expectedLower = expectedDomain.toLowerCase();

    // Check for suspicious patterns
    for (const pattern of CertificateTransparencyMonitor.SUSPICIOUS_PATTERNS) {
      if (pattern.test(allNames)) {
        return true;
      }
    }

    // Check for typosquatting (similar but not exact domain)
    if (allNames.includes(expectedLower.replace(/\./g, '')) && !allNames.includes(expectedLower)) {
      return true;
    }

    // Check for suspicious TLDs with similar domain names
    const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.gq'];
    for (const tld of suspiciousTlds) {
      if (allNames.includes(expectedLower.replace(/\.[^.]+$/, tld))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate certificate hash for deduplication
   */
  private getCertificateHash(cert: CTLogEntry): string {
    const data = `${cert.logId}-${cert.timestamp.getTime()}-${cert.leafInput}`;
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate certificate fingerprint
   */
  private generateFingerprint(certData: any): string {
    const data = JSON.stringify(certData);
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Alert on suspicious certificates
   */
  private async alertSuspiciousCertificates(domain: string, certificates: CTLogEntry[]): Promise<void> {
    console.warn(`🚨 SUSPICIOUS CERTIFICATES DETECTED for ${domain}:`);
    
    for (const cert of certificates) {
      if (cert.certificate) {
        console.warn(`  - Subject: ${cert.certificate.subject}`);
        console.warn(`  - Issuer: ${cert.certificate.issuer}`);
        console.warn(`  - SANs: ${cert.certificate.subjectAltNames.join(', ')}`);
        console.warn(`  - Fingerprint: ${cert.certificate.fingerprint}`);
        console.warn(`  - Issued: ${cert.certificate.notBefore.toISOString()}`);
        console.warn('  ---');
      }
    }

    // In production, you might want to:
    // - Send alerts to security team
    // - Log to security monitoring system
    // - Trigger automated response
    // - Update threat intelligence feeds
  }

  /**
   * Get monitoring statistics
   */
  getStatistics(): {
    monitoredDomains: number;
    knownCertificates: number;
    lastMonitoring?: Date;
  } {
    return {
      monitoredDomains: this.monitoredDomains.length,
      knownCertificates: this.knownCertificates.size,
      lastMonitoring: new Date() // In production, track actual last monitoring time
    };
  }

  /**
   * Clear known certificates cache
   */
  clearCache(): void {
    this.knownCertificates.clear();
    console.log('🗑️ Cleared CT monitoring certificate cache');
  }
}
