#!/bin/bash
################################################################################
# releases.sh - List releases and deployment status
# Usage: ./releases.sh [list|deployed|images]
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"

ACTION=${1:-list}

case $ACTION in
    list|ls)
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}  Git Releases (Tags)${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo ""

        cd "$REPO_ROOT"

        # List all version tags with date and commit
        echo -e "${CYAN}Version Tags:${NC}"
        git tag -l "v*" --sort=-version:refname | while read tag; do
            DATE=$(git log -1 --format="%ci" "$tag" 2>/dev/null | cut -d' ' -f1)
            COMMIT=$(git rev-list -n 1 "$tag" 2>/dev/null | head -c 7)
            MSG=$(git tag -l --format='%(contents:subject)' "$tag" 2>/dev/null)
            echo "  $tag  ($DATE, $COMMIT)  $MSG"
        done

        echo ""
        echo -e "${YELLOW}Latest:${NC}"
        LATEST=$(git describe --tags --abbrev=0 2>/dev/null || echo "No tags")
        echo "  $LATEST"
        echo ""
        ;;

    deployed|status)
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}  Deployed Versions${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo ""

        for env in test stage prod; do
            case $env in
                test)  PROJECT="cloudact-testing-1" ;;
                stage) PROJECT="cloudact-stage" ;;
                prod)  PROJECT="cloudact-prod" ;;
            esac

            echo -e "${CYAN}$env ($PROJECT):${NC}"

            # Activate service account
            SA_KEY="$HOME/.gcp/cloudact-${env}.json"
            [ "$env" = "test" ] && SA_KEY="$HOME/.gcp/cloudact-testing-1-e44da390bf82.json"

            if [ -f "$SA_KEY" ]; then
                gcloud auth activate-service-account --key-file="$SA_KEY" 2>/dev/null || true

                for service in api-service pipeline-service frontend; do
                    # Get current image tag
                    IMAGE=$(gcloud run services describe cloudact-${service}-${env} \
                        --project=$PROJECT \
                        --region=us-central1 \
                        --format="value(spec.template.spec.containers[0].image)" 2>/dev/null || echo "N/A")

                    # Extract tag from image URL
                    TAG=$(echo "$IMAGE" | grep -o ':[^:]*$' | tr -d ':')
                    [ -z "$TAG" ] && TAG="N/A"

                    printf "  %-20s %s\n" "$service:" "$TAG"
                done
            else
                echo "  (credentials not found)"
            fi
            echo ""
        done
        ;;

    images)
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}  Docker Images in GCR${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo ""

        for env in stage prod; do
            case $env in
                stage) PROJECT="cloudact-stage" ;;
                prod)  PROJECT="cloudact-prod" ;;
            esac

            echo -e "${CYAN}$env ($PROJECT):${NC}"

            # Activate service account
            gcloud auth activate-service-account --key-file="$HOME/.gcp/cloudact-${env}.json" 2>/dev/null || true

            for service in api-service pipeline-service frontend; do
                IMAGE="gcr.io/${PROJECT}/cloudact-${service}-${env}"
                echo -e "  ${YELLOW}${service}:${NC}"

                # List tags for this image
                gcloud container images list-tags "$IMAGE" \
                    --format="table[no-heading](tags,timestamp.datetime)" \
                    --sort-by=~timestamp \
                    --limit=5 2>/dev/null | while read line; do
                    echo "    $line"
                done || echo "    No images found"
                echo ""
            done
        done
        ;;

    next)
        # Suggest next version
        cd "$REPO_ROOT"
        LATEST=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")

        # Parse current version
        MAJOR=$(echo $LATEST | sed 's/v//' | cut -d. -f1)
        MINOR=$(echo $LATEST | sed 's/v//' | cut -d. -f2)
        PATCH=$(echo $LATEST | sed 's/v//' | cut -d. -f3 | cut -d- -f1)

        echo -e "${BLUE}Current version: $LATEST${NC}"
        echo ""
        echo "Suggested next versions:"
        echo -e "  ${GREEN}Patch:${NC} v${MAJOR}.${MINOR}.$((PATCH + 1))  (bug fixes)"
        echo -e "  ${YELLOW}Minor:${NC} v${MAJOR}.$((MINOR + 1)).0  (new features)"
        echo -e "  ${RED}Major:${NC} v$((MAJOR + 1)).0.0  (breaking changes)"
        echo ""
        echo "Create release:"
        echo "  ./release.sh v${MAJOR}.${MINOR}.$((PATCH + 1)) --deploy --env prod"
        ;;

    -h|--help|help)
        echo "Usage: ./releases.sh [command]"
        echo ""
        echo "Commands:"
        echo "  list      List all git version tags (default)"
        echo "  deployed  Show deployed versions per environment"
        echo "  images    List Docker images in GCR"
        echo "  next      Suggest next version number"
        echo ""
        echo "Examples:"
        echo "  ./releases.sh                    # List all tags"
        echo "  ./releases.sh deployed           # Show what's deployed"
        echo "  ./releases.sh images             # Show GCR images"
        echo "  ./releases.sh next               # Suggest next version"
        ;;

    *)
        echo -e "${RED}Unknown command: $ACTION${NC}"
        echo "Use: ./releases.sh --help"
        exit 1
        ;;
esac
