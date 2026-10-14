#!/bin/bash

# Whirlcrypt Deployment Script
# This script handles building and deploying the application

set -e  # Exit on any error

echo "Starting Whirlcrypt deployment..."

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "Error: Must be run from the Whirlcrypt root directory"
    exit 1
fi

# Build the application
echo "Building application..."
npm run build

# Stop the service if it's running
echo "Stopping Whirlcrypt service..."
sudo systemctl stop whirlcrypt || echo "Service was not running"

# Start the service
echo "Starting Whirlcrypt service..."
sudo systemctl start whirlcrypt

# Enable the service to start on boot
echo "Enabling service for auto-start..."
sudo systemctl enable whirlcrypt

# Check service status
echo "Checking service status..."
sudo systemctl status whirlcrypt --no-pager

echo "Deployment complete!"
echo "Application should be available at http://localhost:3001"
echo ""
echo "Useful commands:"
echo "  - Check status: sudo systemctl status whirlcrypt"
echo "  - View logs: sudo journalctl -u whirlcrypt -f"
echo "  - Restart: sudo systemctl restart whirlcrypt"
echo "  - Stop: sudo systemctl stop whirlcrypt"
