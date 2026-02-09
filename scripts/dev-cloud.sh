#!/bin/bash
# =============================================
# CloudAct - Dev-Cloud Environment Script
# =============================================
# Multi-tenant development with 4 services against cloudact-testing-1
#
# Usage:
#   ./scripts/dev-cloud.sh start      # Start all 4 services
#   ./scripts/dev-cloud.sh stop       # Stop all services
#   ./scripts/dev-cloud.sh restart    # Restart all services
#   ./scripts/dev-cloud.sh rebuild    # Rebuild and start
#   ./scripts/dev-cloud.sh logs       # Follow logs
#   ./scripts/dev-cloud.sh status     # Show status and health
#   ./scripts/dev-cloud.sh clean      # Stop and remove all
#   ./scripts/dev-cloud.sh bootstrap  # Run bootstrap (first time)
#   ./scripts/dev-cloud.sh native     # Start native (no Docker)
# =============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$REPO_ROOT/docker-compose.dev-cloud.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_status() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_header() { echo -e "${CYAN}$1${NC}"; }

# =============================================
# Prerequisites Check
# =============================================
check_prerequisites() {
    local errors=0

    # Check .env.dev-cloud files
    for service_dir in "02-api-service" "03-data-pipeline-service" "07-org-chat-backend" "01-fronted-system"; do
        if [ ! -f "$REPO_ROOT/$service_dir/.env.dev-cloud" ]; then
            print_error "Missing $service_dir/.env.dev-cloud"
            errors=$((errors + 1))
        fi
    done

    # Check for REPLACE_WITH_* placeholders
    for service_dir in "02-api-service" "03-data-pipeline-service" "07-org-chat-backend" "01-fronted-system"; do
        local env_file="$REPO_ROOT/$service_dir/.env.dev-cloud"
        if [ -f "$env_file" ]; then
            if grep -q "REPLACE_WITH_" "$env_file" 2>/dev/null; then
                print_warning "$service_dir/.env.dev-cloud has REPLACE_WITH_* placeholders that need real values"
            fi
        fi
    done

    if [ $errors -gt 0 ]; then
        print_error "$errors prerequisite(s) failed. Run setup first."
        exit 1
    fi

    print_status "Prerequisites check passed"
}

# =============================================
# Kill conflicting processes
# =============================================
kill_local_services() {
    print_status "Killing any conflicting local services..."
    pkill -9 -f "uvicorn.*8000" 2>/dev/null || true
    pkill -9 -f "uvicorn.*8001" 2>/dev/null || true
    pkill -9 -f "uvicorn.*8002" 2>/dev/null || true
    pkill -9 -f "next-server" 2>/dev/null || true
    pkill -9 -f "node.*next" 2>/dev/null || true
    for port in 3000 8000 8001 8002; do
        lsof -ti:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
    done
}

# =============================================
# Stop containers
# =============================================
stop_containers() {
    print_status "Stopping Docker containers..."
    docker-compose -f "$COMPOSE_FILE" down 2>/dev/null || true
    docker ps -q --filter "name=cloudact-" 2>/dev/null | xargs -r docker stop 2>/dev/null || true
    docker ps -aq --filter "name=cloudact-" 2>/dev/null | xargs -r docker rm 2>/dev/null || true
}

# =============================================
# Start (Docker)
# =============================================
start() {
    check_prerequisites
    stop_containers
    kill_local_services
    sleep 2
    print_status "Starting all 4 services via Docker..."
    docker-compose -f "$COMPOSE_FILE" up -d
    print_status "Waiting for services to initialize..."
    sleep 12
    show_status
}

# =============================================
# Stop
# =============================================
stop() {
    print_status "Stopping all services..."
    docker-compose -f "$COMPOSE_FILE" down
    print_status "All services stopped"
}

# =============================================
# Restart
# =============================================
restart() {
    stop
    start
}

# =============================================
# Rebuild
# =============================================
rebuild() {
    check_prerequisites
    stop_containers
    kill_local_services
    sleep 2
    print_status "Rebuilding and starting all 4 services..."
    docker-compose -f "$COMPOSE_FILE" up -d --build
    print_status "Waiting for services to initialize..."
    sleep 15
    show_status
}

# =============================================
# Logs
# =============================================
logs() {
    local service="${2:-}"
    if [ -n "$service" ]; then
        docker-compose -f "$COMPOSE_FILE" logs -f "$service"
    else
        docker-compose -f "$COMPOSE_FILE" logs -f
    fi
}

# =============================================
# Status & Health
# =============================================
show_status() {
    print_header "========================================="
    print_header " CloudAct Dev-Cloud Status"
    print_header "========================================="
    echo ""

    print_status "Container Status:"
    docker-compose -f "$COMPOSE_FILE" ps 2>/dev/null || true
    echo ""

    print_status "Health Checks:"

    # API Service
    echo -n "  API Service      (8000): "
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}HEALTHY${NC}"
    else
        echo -e "${RED}NOT READY${NC}"
    fi

    # Pipeline Service
    echo -n "  Pipeline Service (8001): "
    if curl -sf http://localhost:8001/health > /dev/null 2>&1; then
        echo -e "${GREEN}HEALTHY${NC}"
    else
        echo -e "${RED}NOT READY${NC}"
    fi

    # Chat Backend
    echo -n "  Chat Backend     (8002): "
    if curl -sf http://localhost:8002/health > /dev/null 2>&1; then
        echo -e "${GREEN}HEALTHY${NC}"
    else
        echo -e "${RED}NOT READY${NC}"
    fi

    # Frontend
    echo -n "  Frontend         (3000): "
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
    echo "  Chat Backend Health:   http://localhost:8002/health"

    echo ""
    print_status "Test Credentials:"
    echo "  Email:    demo@cloudact.ai"
    echo "  Password: Demo1234"
    echo ""
}

# =============================================
# Bootstrap (first time setup)
# =============================================
bootstrap() {
    local ROOT_KEY="test-api-key-for-cloudact-testing-32chars"

    print_status "Running bootstrap..."
    echo ""

    # Check API is up
    if ! curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        print_error "API service not running. Start services first: ./scripts/dev-cloud.sh start"
        exit 1
    fi

    # Run bootstrap
    print_status "POST /api/v1/admin/bootstrap"
    curl -s -X POST http://localhost:8000/api/v1/admin/bootstrap \
        -H "X-CA-Root-Key: $ROOT_KEY" \
        -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || true
    echo ""

    print_status "Bootstrap complete. You can now onboard organizations."
}

# =============================================
# Native (no Docker) - run services directly
# =============================================
native() {
    check_prerequisites
    kill_local_services
    sleep 1

    print_status "Starting services natively (no Docker)..."
    echo ""

    # API Service
    print_status "Starting API Service on :8000..."
    (cd "$REPO_ROOT/02-api-service" && python3 -m uvicorn src.app.main:app --port 8000 --reload) &

    # Pipeline Service
    print_status "Starting Pipeline Service on :8001..."
    (cd "$REPO_ROOT/03-data-pipeline-service" && python3 -m uvicorn src.app.main:app --port 8001 --reload) &

    # Chat Backend
    print_status "Starting Chat Backend on :8002..."
    (cd "$REPO_ROOT/07-org-chat-backend" && python3 -m uvicorn src.app.main:app --port 8002 --reload) &

    # Frontend
    print_status "Starting Frontend on :3000..."
    (cd "$REPO_ROOT/01-fronted-system" && npm run dev) &

    echo ""
    print_status "All 4 services starting in background. Use 'ps aux | grep uvicorn' to check."
    print_status "Stop with: ./scripts/dev-cloud.sh stop-native"
    wait
}

# =============================================
# Stop native processes
# =============================================
stop_native() {
    kill_local_services
    print_status "Native services stopped"
}

# =============================================
# Clean everything
# =============================================
clean() {
    print_status "Stopping and removing all Docker resources..."
    docker-compose -f "$COMPOSE_FILE" down -v --rmi all 2>/dev/null || true
    print_status "Cleanup complete"
}

# =============================================
# Main
# =============================================
case "${1:-start}" in
    start)       start ;;
    stop)        stop ;;
    restart)     restart ;;
    rebuild)     rebuild ;;
    logs)        logs "$@" ;;
    status)      show_status ;;
    bootstrap)   bootstrap ;;
    native)      native ;;
    stop-native) stop_native ;;
    clean)       clean ;;
    *)
        echo "Usage: $0 {start|stop|restart|rebuild|logs|status|bootstrap|native|stop-native|clean}"
        echo ""
        echo "Docker Commands:"
        echo "  start       Start all 4 services in Docker"
        echo "  stop        Stop all Docker services"
        echo "  restart     Restart all Docker services"
        echo "  rebuild     Rebuild images and start"
        echo "  logs        Follow container logs (optional: logs <service>)"
        echo "  status      Show container status and health checks"
        echo "  clean       Stop and remove all (including images/volumes)"
        echo ""
        echo "Native Commands:"
        echo "  native      Start all services without Docker (uvicorn + npm)"
        echo "  stop-native Kill native service processes"
        echo ""
        echo "Setup Commands:"
        echo "  bootstrap   Run API bootstrap (creates BigQuery meta tables)"
        echo ""
        echo "Services:"
        echo "  api-service       Port 8000 - FastAPI (bootstrap, org mgmt, cost reads)"
        echo "  pipeline-service  Port 8001 - FastAPI (pipeline execution, BQ writes)"
        echo "  chat-backend      Port 8002 - FastAPI + Google ADK (AI chat)"
        echo "  frontend          Port 3000 - Next.js (Supabase auth, Stripe billing)"
        exit 1
        ;;
esac
