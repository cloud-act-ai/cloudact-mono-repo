#!/bin/bash
# =============================================
# CloudAct - Docker Local Development Script
# =============================================
# Usage:
#   ./scripts/docker-local.sh start      # Start all services
#   ./scripts/docker-local.sh stop       # Stop all services
#   ./scripts/docker-local.sh restart    # Restart all services
#   ./scripts/docker-local.sh rebuild    # Rebuild and start
#   ./scripts/docker-local.sh logs       # Follow logs
#   ./scripts/docker-local.sh status     # Show status and health
#   ./scripts/docker-local.sh clean      # Stop and remove all
# =============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$REPO_ROOT/docker-compose.local.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    # Check Docker
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker daemon is not running. Please start Docker Desktop."
        exit 1
    fi

    # Check GCP credentials
    if [ ! -f ~/.gcp/cloudact-testing-1-e44da390bf82.json ]; then
        print_error "GCP credentials not found at ~/.gcp/cloudact-testing-1-e44da390bf82.json"
        exit 1
    fi

    # Check .env.local files
    for service_dir in "02-api-service" "03-data-pipeline-service" "01-fronted-system"; do
        if [ ! -f "$REPO_ROOT/$service_dir/.env.local" ]; then
            print_error "Missing $service_dir/.env.local"
            exit 1
        fi
    done

    print_status "Prerequisites check passed"
}

# Stop any existing Docker containers on our ports
stop_existing_containers() {
    print_status "Stopping any existing Docker containers..."

    # Stop containers from this compose file
    docker-compose -f "$COMPOSE_FILE" down 2>/dev/null || true

    # Find and stop any containers using our ports
    for port in 3000 8000 8001; do
        CONTAINER_ID=$(docker ps -q --filter "publish=$port" 2>/dev/null)
        if [ -n "$CONTAINER_ID" ]; then
            print_warning "Stopping container using port $port: $CONTAINER_ID"
            docker stop "$CONTAINER_ID" 2>/dev/null || true
            docker rm "$CONTAINER_ID" 2>/dev/null || true
        fi
    done

    # Also stop by container name pattern (cloudact-*)
    docker ps -q --filter "name=cloudact-" 2>/dev/null | xargs -r docker stop 2>/dev/null || true
    docker ps -aq --filter "name=cloudact-" 2>/dev/null | xargs -r docker rm 2>/dev/null || true
}

# Kill local services (non-Docker)
kill_local_services() {
    print_status "Killing any local (non-Docker) services..."
    pkill -9 -f "uvicorn.*8000" 2>/dev/null || true
    pkill -9 -f "uvicorn.*8001" 2>/dev/null || true
    pkill -9 -f "next-server" 2>/dev/null || true
    pkill -9 -f "node.*next" 2>/dev/null || true
    lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:8001 2>/dev/null | xargs kill -9 2>/dev/null || true
}

# Clear caches and old logs
clear_caches() {
    print_status "Clearing caches and old logs..."

    # Next.js cache
    rm -rf "$REPO_ROOT/01-fronted-system/.next" 2>/dev/null || true

    # Python caches
    find "$REPO_ROOT" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find "$REPO_ROOT" -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true

    # Clear old logs
    rm -f "$REPO_ROOT/logs/"*.log 2>/dev/null || true
    mkdir -p "$REPO_ROOT/logs"
}

# Clean restart - stop everything first
clean_stop() {
    stop_existing_containers
    kill_local_services
    clear_caches
    sleep 2
}

# Start services
start() {
    check_prerequisites
    clean_stop
    print_status "Starting Docker services..."
    docker-compose -f "$COMPOSE_FILE" up -d
    print_status "Waiting for services to start..."
    sleep 10
    show_status
}

# Stop services
stop() {
    print_status "Stopping Docker services..."
    docker-compose -f "$COMPOSE_FILE" down
    print_status "Docker services stopped"
}

# Restart services
restart() {
    print_status "Restarting Docker services..."
    stop
    start
}

# Rebuild and start
rebuild() {
    check_prerequisites
    clean_stop
    print_status "Rebuilding and starting Docker services..."
    docker-compose -f "$COMPOSE_FILE" up -d --build
    print_status "Waiting for services to start..."
    sleep 15
    show_status
}

# Show logs
logs() {
    docker-compose -f "$COMPOSE_FILE" logs -f
}

# Show status and health
show_status() {
    print_status "Container Status:"
    docker-compose -f "$COMPOSE_FILE" ps
    echo ""

    print_status "Health Checks:"
    echo -n "API Service (8000): "
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}HEALTHY${NC}"
        curl -s http://localhost:8000/health | python3 -m json.tool 2>/dev/null || true
    else
        echo -e "${RED}NOT READY${NC}"
    fi

    echo ""
    echo -n "Pipeline Service (8001): "
    if curl -s http://localhost:8001/health > /dev/null 2>&1; then
        echo -e "${GREEN}HEALTHY${NC}"
        curl -s http://localhost:8001/health | python3 -m json.tool 2>/dev/null || true
    else
        echo -e "${RED}NOT READY${NC}"
    fi

    echo ""
    echo -n "Frontend (3000): "
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}HEALTHY (HTTP $HTTP_CODE)${NC}"
    else
        echo -e "${RED}NOT READY (HTTP $HTTP_CODE)${NC}"
    fi

    echo ""
    print_status "Access URLs:"
    echo "  Frontend:              http://localhost:3000"
    echo "  API Service Docs:      http://localhost:8000/docs"
    echo "  Pipeline Service Docs: http://localhost:8001/docs"

    echo ""
    print_status "Checking logs for errors..."
    ERRORS=$(docker-compose -f "$COMPOSE_FILE" logs --tail=50 2>&1 | grep -i "error\|exception\|failed\|traceback" | grep -v "INFO" | head -10)
    if [ -n "$ERRORS" ]; then
        print_warning "Errors found in logs:"
        echo "$ERRORS"
    else
        echo "No errors found in logs"
    fi
}

# Clean everything
clean() {
    print_status "Stopping and removing all Docker resources..."
    docker-compose -f "$COMPOSE_FILE" down -v --rmi all 2>/dev/null || true
    print_status "Cleanup complete"
}

# Main
case "${1:-start}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    rebuild)
        rebuild
        ;;
    logs)
        logs
        ;;
    status)
        show_status
        ;;
    clean)
        clean
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|rebuild|logs|status|clean}"
        echo ""
        echo "Commands:"
        echo "  start     Start all services (default)"
        echo "  stop      Stop all services"
        echo "  restart   Restart all services"
        echo "  rebuild   Rebuild images and start"
        echo "  logs      Follow container logs"
        echo "  status    Show container status and health"
        echo "  clean     Stop and remove all (including images)"
        exit 1
        ;;
esac
