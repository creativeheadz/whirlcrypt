#!/bin/bash

# Whirlcrypt Production Startup Script
# This script builds and starts the Whirlcrypt application in production mode

set -e

echo "🚀 Starting Whirlcrypt in production mode..."

# Change to the application directory
cd /home/andrei/whirlcrypt

# Build the application
echo "📦 Building application..."
npm run build

# Start the backend server
echo "🌐 Starting backend server..."
cd backend
npm start
