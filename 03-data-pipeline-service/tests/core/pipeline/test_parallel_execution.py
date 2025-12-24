import pytest
import asyncio
from unittest.mock import MagicMock, patch
from src.core.pipeline.async_executor import AsyncPipelineExecutor, StepNode

@pytest.mark.asyncio
async def test_dag_parallel_structure():
    """
    Verify that steps with depends_on=[] are structured as parallel roots in the DAG.
    """
    # Mock steps config
    steps_config = [
        # Step 0: Parallel Root A
        {
            "step_id": "step_a",
            "depends_on": []
        },
        # Step 1: Parallel Root B
        {
            "step_id": "step_b",
            "depends_on": []
        },
        # Step 2: Dependent Step C (depends on A and B)
        {
            "step_id": "step_c",
            "depends_on": ["step_a", "step_b"]
        }
    ]
    
    executor = AsyncPipelineExecutor(
        org_slug="test_org",
        pipeline_id="test_pipeline"
    )
    
    # Manually invoke private DAG builder
    executor._build_dag(steps_config)
    
    # Verify DAG structure
    assert "step_a" in executor.step_dag
    assert "step_b" in executor.step_dag
    assert "step_c" in executor.step_dag
    
    # 1. Verify Roots have NO dependencies
    assert len(executor.step_dag["step_a"].dependencies) == 0, "Step A should have no dependencies"
    assert len(executor.step_dag["step_b"].dependencies) == 0, "Step B should have no dependencies"
    
    # 2. Verify Leaf C has correct dependencies
    assert executor.step_dag["step_c"].dependencies == {"step_a", "step_b"}
    
    # 3. Verify Execution Levels (This is the real test of parallelism)
    levels = executor._get_execution_levels()
    
    # Expect 2 levels:
    # Level 0: [step_a, step_b] (Parallel)
    # Level 1: [step_c]         (Dependent)
    assert len(levels) == 2
    
    first_level = set(levels[0])
    assert "step_a" in first_level
    assert "step_b" in first_level
    assert len(first_level) == 2
    
    second_level = set(levels[1])
    assert "step_c" in second_level

@pytest.mark.asyncio
async def test_dag_mixed_implicit_explicit():
    """
    Verify mixed explicit parallel and implicit sequential steps.
    """
    steps_config = [
        # Step 0: Implicit root (start of sequence)
        {
            "step_id": "step_1"
        },
        # Step 1: Implicit sequence (depends on step_1)
        {
            "step_id": "step_2"
        },
        # Step 2: Explicit parallel branch
        {
            "step_id": "step_parallel",
            "depends_on": []
        }
    ]
    
    executor = AsyncPipelineExecutor(org_slug="test", pipeline_id="test")
    executor._build_dag(steps_config)
    
    # Checks
    # step_1 depends on nothing (root)
    assert len(executor.step_dag["step_1"].dependencies) == 0
    
    # step_2 implicitly depends on step_1
    assert executor.step_dag["step_2"].dependencies == {"step_1"}
    
    # step_parallel explicitly depends on nothing (parallel root)
    assert len(executor.step_dag["step_parallel"].dependencies) == 0
    
    # Levels should be:
    # Level 0: step_1, step_parallel
    # Level 1: step_2
    levels = executor._get_execution_levels()
    level_0 = set(levels[0])
    
    assert "step_1" in level_0
    assert "step_parallel" in level_0
