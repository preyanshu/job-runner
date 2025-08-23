#!/bin/bash

echo "Starting Job Runner System..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Docker is not running. Please start Docker first."
    exit 1
fi

# Start Redis and MongoDB
echo "Starting Redis and MongoDB..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check if services are running
if ! docker-compose ps | grep -q "Up"; then
    echo "Failed to start services. Check docker-compose logs."
    exit 1
fi

echo "Services started successfully!"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npx tsc

# Start the application
echo "Starting Job Runner application..."
npm start 