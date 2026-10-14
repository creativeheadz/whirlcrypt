#!/bin/bash

# Whirlcrypt Service Setup Script
# This script sets up Whirlcrypt as a systemd service

set -e

echo "Setting up Whirlcrypt as a systemd service..."

# Copy service file to systemd directory
echo "Installing service file..."
sudo cp whirlcrypt.service /etc/systemd/system/

# Reload systemd
echo "Reloading systemd..."
sudo systemctl daemon-reload

# Enable the service
echo "Enabling Whirlcrypt service..."
sudo systemctl enable whirlcrypt

echo "Whirlcrypt service setup complete!"
echo ""
echo "Available commands:"
echo "  sudo systemctl start whirlcrypt    # Start the service"
echo "  sudo systemctl stop whirlcrypt     # Stop the service"
echo "  sudo systemctl restart whirlcrypt  # Restart the service"
echo "  sudo systemctl status whirlcrypt   # Check service status"
echo "  sudo journalctl -u whirlcrypt -f   # View service logs"
echo ""
echo "The service will automatically start on boot."
