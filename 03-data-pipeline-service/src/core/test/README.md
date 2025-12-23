# Pipeline Testing Framework

Lightweight testing utilities for pipeline processors. Works with **existing processors without modification**.

## Quick Start

```python
from src.core.test import ProcessorTestCase, MockContext

class TestMyProcessor(ProcessorTestCase):
    processor_module = "src.core.processors.openai.usage"

    async def test_success(self):
        result = await self.execute_processor(
            step_config={"config": {"start_date": "2025-01-01"}},
            context=MockContext(org_slug="test_org").to_dict()
        )
        self.assert_success(result)
```

## Key Components

### 1. `ProcessorTestCase` - Test individual processors

```python
class TestOpenAIUsage(ProcessorTestCase):
    processor_module = "src.core.processors.openai.usage"

    def setup(self):
        """Called before each test"""
        self.ctx = MockContext(org_slug="test")

    async def test_execute(self):
        result = await self.execute_processor(
            step_config={...},
            context=self.ctx.to_dict()
        )
        self.assert_success(result)
        self.assert_has_key(result, "rows_processed")
```

### 2. `MockContext` - Mock execution context

```python
ctx = MockContext(org_slug="test_org")
ctx.add_secret("OPENAI", "sk-test-key")
ctx.add_variable("date", "2025-01-01")
```

### 3. `MockBigQueryClient` - Mock BQ operations

```python
mock_bq = MockBigQueryClient()
mock_bq.add_query_result("SELECT * FROM table", [{"id": 1}])
mock_bq.add_table_data("project.dataset.table", [...])

# After test
mock_bq.assert_rows_inserted("project.dataset.output", min_count=1)
```

### 4. Test Data Factories

```python
from src.core.test.fixtures import (
    make_openai_usage_data,
    make_gcp_billing_data,
    make_anthropic_usage_data,
)

data = make_openai_usage_data(count=10, date="2025-01-01")
```

## Available Assertions

| Method | Description |
|--------|-------------|
| `assert_success(result)` | Assert status is SUCCESS |
| `assert_failed(result)` | Assert status is FAILED |
| `assert_has_key(result, key)` | Assert result contains key |
| `assert_equals(actual, expected)` | Assert equality |
| `assert_true(condition)` | Assert condition is True |
| `assert_in(item, collection)` | Assert item in collection |
| `assert_rows_processed(result, min=0, max=None)` | Assert row count range |
| `assert_error_contains(result, text)` | Assert error message contains text |

## Running Tests

### With pytest (recommended)
```bash
python -m pytest tests/processors/ -v
```

### With TestRunner (standalone)
```bash
python -m src.core.test.runner --test-dir tests/processors -v
```

### Programmatically
```python
from src.core.test import TestRunner
import asyncio

runner = TestRunner(verbose=True)
results = asyncio.run(runner.run_all())
print(runner.format_results(results))
```

## Integration with pytest

The framework works alongside pytest:

```python
import pytest
from src.core.test import MockContext

@pytest.fixture
def mock_context():
    return MockContext(org_slug="pytest_org")

@pytest.mark.asyncio
async def test_my_processor(mock_context):
    from src.core.processors.openai.usage import get_engine

    processor = get_engine()
    result = await processor.execute(
        {"config": {}},
        mock_context.to_dict()
    )
    assert result["status"] == "SUCCESS"
```

## Philosophy

- **Non-invasive**: Existing processors work without changes
- **Lightweight**: No heavy dependencies
- **Familiar**: Similar to unittest/pytest patterns
- **Practical**: Mock utilities for real use cases
