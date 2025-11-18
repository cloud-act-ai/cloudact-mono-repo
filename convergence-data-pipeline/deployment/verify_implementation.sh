#!/bin/bash
# Verification script for Agent 3 implementation

echo "=========================================="
echo "Agent 3 Implementation Verification"
echo "=========================================="
echo ""

# Check created files
echo "1. Checking created files..."
files=(
    "test_api_keys.json"
    "test_request_size_limits.py"
    "TEST_API_KEYS_README.md"
    "QA_TEST_GUIDE.md"
    "AGENT3_IMPLEMENTATION_SUMMARY.md"
)

all_exist=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✓ $file"
    else
        echo "   ✗ $file NOT FOUND"
        all_exist=false
    fi
done

# Check .env configuration
echo ""
echo "2. Checking .env configuration..."
if grep -q "ENABLE_DEV_MODE=true" .env; then
    echo "   ✓ ENABLE_DEV_MODE=true set in .env"
else
    echo "   ✗ ENABLE_DEV_MODE not set in .env"
    all_exist=false
fi

# Verify test_api_keys.json is valid JSON
echo ""
echo "3. Validating test_api_keys.json..."
if python3 -c "import json; json.load(open('test_api_keys.json'))" 2>/dev/null; then
    echo "   ✓ Valid JSON"
    num_keys=$(python3 -c "import json; print(len(json.load(open('test_api_keys.json')).get('test_keys', [])))")
    echo "   ✓ $num_keys test keys defined"
else
    echo "   ✗ Invalid JSON"
    all_exist=false
fi

# Check Python imports
echo ""
echo "4. Testing Python imports..."
if python3 -c "from src.app.dependencies.auth import load_test_api_keys, get_test_customer_from_api_key" 2>/dev/null; then
    echo "   ✓ Auth module imports successfully"
else
    echo "   ✗ Auth module import failed"
    all_exist=false
fi

# Check middleware file
echo ""
echo "5. Checking middleware implementation..."
if [ -f "src/app/middleware/validation.py" ]; then
    if grep -q "MAX_REQUEST_SIZE_BYTES = 10 \* 1024 \* 1024" src/app/middleware/validation.py; then
        echo "   ✓ Request size limit configured (10 MB)"
    else
        echo "   ✗ Request size limit not found"
    fi
else
    echo "   ✗ validation.py not found"
    all_exist=false
fi

# Summary
echo ""
echo "=========================================="
if [ "$all_exist" = true ]; then
    echo "✓ ALL CHECKS PASSED"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Start server: uvicorn src.app.main:app --reload --port 8080"
    echo "2. Run tests: python test_request_size_limits.py"
    echo "3. Read docs: cat QA_TEST_GUIDE.md"
    exit 0
else
    echo "✗ SOME CHECKS FAILED"
    echo "=========================================="
    echo ""
    echo "Please review the errors above."
    exit 1
fi
