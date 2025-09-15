#!/bin/bash

# PostgreSQL Security Hardening Deployment Script
# This script automates the deployment of security configurations for Whirlcrypt
# Usage: ./deploy-database-security.sh [--auto]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCS_DIR="$PROJECT_ROOT/docs"
BACKUP_DIR="/tmp/postgresql-backup-$(date +%Y%m%d-%H%M%S)"

# Auto mode flag
AUTO_MODE=false
if [[ "$1" == "--auto" ]]; then
    AUTO_MODE=true
fi

# Logging
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

prompt_continue() {
    if [[ "$AUTO_MODE" == "false" ]]; then
        echo -e "${YELLOW}Press Enter to continue or Ctrl+C to abort...${NC}"
        read -r
    fi
}

# Check if running as root or with sudo
check_permissions() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root or with sudo"
    fi
}

# Find PostgreSQL configuration directory
find_pg_config() {
    local pg_config_dir
    pg_config_dir=$(find /etc -name "postgresql.conf" 2>/dev/null | head -1 | xargs dirname)
    
    if [[ -z "$pg_config_dir" ]]; then
        error "PostgreSQL configuration directory not found"
    fi
    
    echo "$pg_config_dir"
}

# Backup existing configuration
backup_config() {
    local pg_config_dir="$1"
    
    log "Creating backup of existing configuration..."
    mkdir -p "$BACKUP_DIR"
    
    if [[ -f "$pg_config_dir/postgresql.conf" ]]; then
        cp "$pg_config_dir/postgresql.conf" "$BACKUP_DIR/"
        success "Backed up postgresql.conf"
    fi
    
    if [[ -f "$pg_config_dir/pg_hba.conf" ]]; then
        cp "$pg_config_dir/pg_hba.conf" "$BACKUP_DIR/"
        success "Backed up pg_hba.conf"
    fi
    
    log "Backup created in: $BACKUP_DIR"
}

# Apply security configuration
apply_security_config() {
    local pg_config_dir="$1"
    
    log "Applying PostgreSQL security configuration..."
    
    # Apply postgresql.conf security settings
    if [[ -f "$DOCS_DIR/postgresql-security.conf" ]]; then
        cp "$DOCS_DIR/postgresql-security.conf" "$pg_config_dir/postgresql.conf"
        chown postgres:postgres "$pg_config_dir/postgresql.conf"
        chmod 640 "$pg_config_dir/postgresql.conf"
        success "Applied postgresql.conf security settings"
    else
        warning "postgresql-security.conf not found, skipping"
    fi
    
    # Apply pg_hba.conf security settings
    if [[ -f "$DOCS_DIR/pg_hba-security.conf" ]]; then
        cp "$DOCS_DIR/pg_hba-security.conf" "$pg_config_dir/pg_hba.conf"
        chown postgres:postgres "$pg_config_dir/pg_hba.conf"
        chmod 640 "$pg_config_dir/pg_hba.conf"
        success "Applied pg_hba.conf security settings"
    else
        warning "pg_hba-security.conf not found, skipping"
    fi
}

# Create secure log directory
setup_logging() {
    log "Setting up secure logging directory..."
    
    mkdir -p /var/log/postgresql
    chown postgres:postgres /var/log/postgresql
    chmod 750 /var/log/postgresql
    
    success "Secure logging directory created"
}

# Run security audit
run_security_audit() {
    log "Running security audit..."
    
    if [[ -f "$DOCS_DIR/database-security-audit.sql" ]]; then
        local audit_report="$PROJECT_ROOT/security-audit-$(date +%Y%m%d-%H%M%S).txt"
        
        if sudo -u postgres psql -f "$DOCS_DIR/database-security-audit.sql" > "$audit_report" 2>&1; then
            success "Security audit completed: $audit_report"
        else
            warning "Security audit failed, check PostgreSQL service status"
        fi
    else
        warning "Security audit script not found, skipping"
    fi
}

# Apply user security
apply_user_security() {
    log "Applying user security configuration..."
    
    if [[ -f "$DOCS_DIR/database-user-security.sql" ]]; then
        if sudo -u postgres psql -f "$DOCS_DIR/database-user-security.sql"; then
            success "User security configuration applied"
            warning "Remember to update application configuration with new credentials"
        else
            warning "User security configuration failed"
        fi
    else
        warning "User security script not found, skipping"
    fi
}

# Apply extension security
apply_extension_security() {
    log "Applying extension security configuration..."
    
    if [[ -f "$DOCS_DIR/database-extension-security.sql" ]]; then
        if sudo -u postgres psql -f "$DOCS_DIR/database-extension-security.sql"; then
            success "Extension security configuration applied"
        else
            warning "Extension security configuration failed"
        fi
    else
        warning "Extension security script not found, skipping"
    fi
}

# Restart PostgreSQL service
restart_postgresql() {
    log "Restarting PostgreSQL service..."
    
    if systemctl restart postgresql; then
        success "PostgreSQL service restarted"
        
        # Wait for service to be ready
        sleep 5
        
        if systemctl is-active --quiet postgresql; then
            success "PostgreSQL service is running"
        else
            error "PostgreSQL service failed to start"
        fi
    else
        error "Failed to restart PostgreSQL service"
    fi
}

# Test database connection
test_connection() {
    log "Testing database connection..."
    
    if sudo -u postgres psql -c "SELECT version();" > /dev/null 2>&1; then
        success "Database connection test passed"
    else
        warning "Database connection test failed"
    fi
}

# Main execution
main() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                PostgreSQL Security Hardening                ║"
    echo "║                    Whirlcrypt Project                       ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Pre-flight checks
    check_permissions
    
    local pg_config_dir
    pg_config_dir=$(find_pg_config)
    log "Found PostgreSQL configuration directory: $pg_config_dir"
    
    # Show what will be done
    echo -e "\n${YELLOW}This script will:${NC}"
    echo "1. Backup existing PostgreSQL configuration"
    echo "2. Apply security hardening configurations"
    echo "3. Set up secure logging"
    echo "4. Run security audit"
    echo "5. Apply user security settings"
    echo "6. Apply extension security settings"
    echo "7. Restart PostgreSQL service"
    echo "8. Test database connection"
    echo ""
    
    if [[ "$AUTO_MODE" == "false" ]]; then
        echo -e "${RED}⚠️  This will modify your PostgreSQL configuration!${NC}"
        echo -e "${YELLOW}Make sure you have a backup of your data before proceeding.${NC}"
        echo ""
        prompt_continue
    fi
    
    # Execute steps
    backup_config "$pg_config_dir"
    apply_security_config "$pg_config_dir"
    setup_logging
    restart_postgresql
    run_security_audit
    apply_user_security
    apply_extension_security
    test_connection
    
    # Final summary
    echo -e "\n${GREEN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                   Security Hardening Complete               ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Review the security audit report"
    echo "2. Update application configuration with new database credentials"
    echo "3. Test application functionality"
    echo "4. Set up monitoring and alerting"
    echo "5. Schedule regular security reviews"
    echo ""
    echo -e "${BLUE}Backup location: $BACKUP_DIR${NC}"
    echo -e "${BLUE}Documentation: $PROJECT_ROOT/docs/DATABASE-SECURITY-GUIDE.md${NC}"
}

# Run main function
main "$@"
