.PHONY: help docker-build docker-up docker-down docker-logs docker-shell docker-test docker-clean

# Default target
help:
	@echo "Convergence Data Pipeline - Docker Commands"
	@echo ""
	@echo "Available targets:"
	@echo "  make docker-build    - Build Docker image"
	@echo "  make docker-up       - Start services"
	@echo "  make docker-down     - Stop services"
	@echo "  make docker-logs     - View logs"
	@echo "  make docker-shell    - Open shell in container"
	@echo "  make docker-test     - Run automated tests"
	@echo "  make docker-restart  - Restart services"
	@echo "  make docker-clean    - Clean up everything"
	@echo ""

# Build Docker image
docker-build:
	@echo "🔨 Building Docker image..."
	docker-compose build

# Start services
docker-up:
	@echo "🚀 Starting services..."
	docker-compose up -d
	@echo "✅ Services started!"
	@echo "   API: http://localhost:8080"
	@echo "   Health: http://localhost:8080/health"

# Stop services
docker-down:
	@echo "🛑 Stopping services..."
	docker-compose down

# View logs
docker-logs:
	@echo "📋 Viewing logs..."
	docker-compose logs -f --tail=100 convergence-api

# Open shell in container
docker-shell:
	@echo "🐚 Opening shell in container..."
	docker-compose exec convergence-api bash

# Restart services
docker-restart:
	@echo "🔄 Restarting services..."
	docker-compose restart
	@echo "✅ Services restarted!"

# Run automated tests
docker-test: docker-up
	@echo "🧪 Running automated tests..."
	@sleep 5
	./docker-test.sh

# Clean up everything
docker-clean:
	@echo "🧹 Cleaning up..."
	docker-compose down -v
	docker system prune -f
	@echo "✅ Cleanup complete!"

# Build and start
docker-start: docker-build docker-up
	@echo "✅ Build and start complete!"

# Full test cycle
docker-full-test: docker-clean docker-build docker-test
	@echo "✅ Full test cycle complete!"
