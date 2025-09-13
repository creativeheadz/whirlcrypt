#!/bin/bash

# Whirlcrypt Setup Script
# This script helps set up the development or production environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check dependencies
check_dependencies() {
    print_status "Checking dependencies..."
    
    local missing_deps=()
    
    if ! command_exists node; then
        missing_deps+=("node")
    fi
    
    if ! command_exists npm; then
        missing_deps+=("npm")
    fi
    
    if ! command_exists docker; then
        missing_deps+=("docker")
    fi
    
    if ! command_exists docker-compose; then
        missing_deps+=("docker-compose")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "Missing required dependencies: ${missing_deps[*]}"
        print_status "Please install the missing dependencies and run this script again."
        exit 1
    fi
    
    print_success "All dependencies are installed"
}

# Setup environment file
setup_env() {
    print_status "Setting up environment configuration..."
    
    local env_file="./backend/.env"
    
    if [ ! -f "$env_file" ]; then
        print_status "Creating backend environment file..."
        cat > "$env_file" << EOF
# Server Configuration
NODE_ENV=development
PORT=3001

# Database Configuration
DB_HOST=localhost
DB_PORT=5433
DB_NAME=whirlcrypt_dev
DB_USER=whirlcrypt_user
DB_PASSWORD=whirlcrypt_password
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=10000
DB_SSL=false

# Redis Configuration (optional)
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=

# Storage Configuration
STORAGE_PROVIDER=local
UPLOAD_DIR=./uploads

# CORS Configuration
CORS_ORIGIN=http://localhost:5173

# File Configuration
DEFAULT_RETENTION_HOURS=24
MAX_RETENTION_HOURS=168
MAX_FILE_SIZE=104857600
CLEANUP_INTERVAL_MINUTES=60

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF
        print_success "Backend environment file created"
    else
        print_warning "Backend environment file already exists"
    fi
}

# Install dependencies
install_dependencies() {
    print_status "Installing Node.js dependencies..."
    
    # Install root dependencies
    npm install
    
    # Install backend dependencies
    cd backend && npm install && cd ..
    
    # Install frontend dependencies
    cd frontend && npm install && cd ..
    
    # Install shared dependencies
    cd shared && npm install && cd ..
    
    print_success "Dependencies installed successfully"
}

# Setup database
setup_database() {
    print_status "Setting up development database..."
    
    # Start database services
    docker-compose -f docker-compose.dev.yml up -d postgres-dev redis-dev
    
    # Wait for database to be ready
    print_status "Waiting for database to be ready..."
    sleep 10
    
    # Check if database is ready
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec whirlcrypt-postgres-dev pg_isready -U whirlcrypt_user -d whirlcrypt_dev > /dev/null 2>&1; then
            break
        fi
        
        print_status "Waiting for database... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        print_error "Database failed to start"
        exit 1
    fi
    
    print_success "Database is ready"
}

# Build the application
build_app() {
    print_status "Building the application..."
    
    # Build shared types first
    cd shared && npm run build && cd ..
    
    # Build backend
    cd backend && npm run build && cd ..
    
    # Build frontend
    cd frontend && npm run build && cd ..
    
    print_success "Application built successfully"
}

# Start development environment
start_dev() {
    print_status "Starting development environment..."
    
    # Start database services
    docker-compose -f docker-compose.dev.yml up -d
    
    print_success "Development services started"
    print_status "Access points:"
    print_status "- Application: http://localhost:5173"
    print_status "- API: http://localhost:3001"
    print_status "- Database Admin: http://localhost:8080"
    print_status "- Redis Insight: http://localhost:8001"
    print_status ""
    print_status "To start the development server:"
    print_status "npm run dev"
}

# Start production environment
start_prod() {
    print_status "Starting production environment..."
    
    # Build production image
    docker-compose up --build -d
    
    print_success "Production environment started"
    print_status "Access points:"
    print_status "- Application: http://localhost:80"
    print_status "- API: http://localhost:3001"
}

# Main menu
show_menu() {
    echo ""
    print_status "Whirlcrypt Setup Script"
    echo "Please select an option:"
    echo "1) Full development setup (recommended for first time)"
    echo "2) Install dependencies only"
    echo "3) Setup database only"
    echo "4) Build application only"
    echo "5) Start development environment"
    echo "6) Start production environment"
    echo "7) Stop all services"
    echo "8) Clean up (remove containers and volumes)"
    echo "9) Exit"
    echo ""
}

# Stop services
stop_services() {
    print_status "Stopping all services..."
    docker-compose -f docker-compose.dev.yml down
    docker-compose down
    print_success "All services stopped"
}

# Cleanup
cleanup() {
    print_warning "This will remove all containers, volumes, and data. Are you sure? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        print_status "Cleaning up..."
        docker-compose -f docker-compose.dev.yml down -v
        docker-compose down -v
        docker system prune -f
        print_success "Cleanup completed"
    else
        print_status "Cleanup cancelled"
    fi
}

# Full development setup
full_dev_setup() {
    print_status "Starting full development setup..."
    check_dependencies
    setup_env
    install_dependencies
    setup_database
    build_app
    print_success "Development setup completed!"
    print_status "You can now run 'npm run dev' to start the development server"
}

# Handle command line arguments
if [ "$1" = "--dev" ]; then
    full_dev_setup
    exit 0
elif [ "$1" = "--prod" ]; then
    check_dependencies
    start_prod
    exit 0
fi

# Interactive menu
while true; do
    show_menu
    read -p "Enter your choice (1-9): " choice
    
    case $choice in
        1)
            full_dev_setup
            ;;
        2)
            check_dependencies
            install_dependencies
            ;;
        3)
            setup_database
            ;;
        4)
            build_app
            ;;
        5)
            start_dev
            ;;
        6)
            start_prod
            ;;
        7)
            stop_services
            ;;
        8)
            cleanup
            ;;
        9)
            print_status "Goodbye!"
            exit 0
            ;;
        *)
            print_error "Invalid option. Please try again."
            ;;
    esac
    
    echo ""
    read -p "Press Enter to continue..."
done