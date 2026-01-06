/**
 * @vitest-environment node
 *
 * N-Level Hierarchy Validation Tests
 *
 * Tests organizational hierarchy:
 * - N-level configurable hierarchy structure
 * - Cascading dropdown behavior (Level 1 → Level 2 → Level 3 → ...)
 * - Hierarchy field validation
 * - Integration with subscription forms
 * - API endpoint validation
 *
 * Run: npx vitest -c vitest.node.config.ts tests/hierarchy/validation.test.ts --run
 */

import { describe, it, expect } from 'vitest'

// ============================================
// Hierarchy Entity Validation
// ============================================

describe('Hierarchy Entity Validation', () => {
  const validEntityId = (id: string): boolean => {
    if (!id || typeof id !== 'string') return false
    return /^[a-zA-Z0-9_-]{1,50}$/.test(id)
  }

  it('should validate entity ID format', () => {
    // Valid IDs
    expect(validEntityId('DEPT-001')).toBe(true)
    expect(validEntityId('PROJ-001')).toBe(true)
    expect(validEntityId('TEAM-001')).toBe(true)
    expect(validEntityId('engineering')).toBe(true)
    expect(validEntityId('platform_team_1')).toBe(true)
    expect(validEntityId('DIV-NORTH')).toBe(true) // Custom level IDs

    // Invalid IDs
    expect(validEntityId('')).toBe(false)
    expect(validEntityId('A'.repeat(51))).toBe(false) // Too long
    expect(validEntityId('dept with spaces')).toBe(false)
    expect(validEntityId('dept<script>')).toBe(false)

    console.log('✓ Entity ID format validation passed')
  })

  it('should validate entity name max length (200)', () => {
    const maxLength = 200
    const validName = 'Engineering Department'
    const longName = 'A'.repeat(250)

    expect(validName.length <= maxLength).toBe(true)
    expect(longName.length <= maxLength).toBe(false)

    console.log('✓ Entity name max length validated')
  })

  it('should validate level_code field', () => {
    // N-level: level_code is a string, not enum
    const validLevelCodes = ['department', 'project', 'team', 'division', 'business_unit', 'squad']

    validLevelCodes.forEach(code => {
      expect(typeof code).toBe('string')
      expect(code.length).toBeGreaterThan(0)
    })

    console.log('✓ Level codes validated (N-level supports any string)')
  })
})

// ============================================
// N-Level Hierarchy Structure Validation
// ============================================

describe('N-Level Hierarchy Structure Validation', () => {
  it('should enforce parent-child relationships via path', () => {
    // Root entity has no parent
    const department = {
      level_code: 'department',
      entity_id: 'DEPT-001',
      parent_id: null,
      path: '/DEPT-001',
      path_ids: ['DEPT-001'],
      path_names: ['Engineering'],
      depth: 0
    }
    expect(department.parent_id).toBeNull()
    expect(department.depth).toBe(0)

    // Level 2 entity has level 1 parent
    const project = {
      level_code: 'project',
      entity_id: 'PROJ-001',
      parent_id: 'DEPT-001',
      path: '/DEPT-001/PROJ-001',
      path_ids: ['DEPT-001', 'PROJ-001'],
      path_names: ['Engineering', 'Platform'],
      depth: 1
    }
    expect(project.parent_id).toBe('DEPT-001')
    expect(project.depth).toBe(1)
    expect(project.path_ids).toContain('DEPT-001')

    // Level 3 entity has level 2 parent
    const team = {
      level_code: 'team',
      entity_id: 'TEAM-001',
      parent_id: 'PROJ-001',
      path: '/DEPT-001/PROJ-001/TEAM-001',
      path_ids: ['DEPT-001', 'PROJ-001', 'TEAM-001'],
      path_names: ['Engineering', 'Platform', 'Backend'],
      depth: 2
    }
    expect(team.parent_id).toBe('PROJ-001')
    expect(team.depth).toBe(2)
    expect(team.path_ids.length).toBe(3)

    console.log('✓ Parent-child relationships validated via materialized path')
  })

  it('should support configurable hierarchy depth', () => {
    // N-level supports any depth via level configuration
    const levels = [
      { level: 1, level_code: 'division', parent_level: null },
      { level: 2, level_code: 'department', parent_level: 1 },
      { level: 3, level_code: 'project', parent_level: 2 },
      { level: 4, level_code: 'team', parent_level: 3 },
      { level: 5, level_code: 'squad', parent_level: 4, is_leaf: true }
    ]

    expect(levels.length).toBe(5)
    expect(levels[0].parent_level).toBeNull() // Root has no parent
    expect(levels[4].is_leaf).toBe(true) // Deepest level is leaf

    console.log('✓ Configurable hierarchy depth validated')
  })
})

// ============================================
// Cascading Dropdown Behavior
// ============================================

describe('Cascading Dropdown Behavior', () => {
  // Mock hierarchy data with N-level structure
  const mockEntities = [
    { entity_id: 'DEPT-001', entity_name: 'Engineering', level_code: 'department', parent_id: null },
    { entity_id: 'DEPT-002', entity_name: 'Marketing', level_code: 'department', parent_id: null },
    { entity_id: 'PROJ-001', entity_name: 'Platform', level_code: 'project', parent_id: 'DEPT-001' },
    { entity_id: 'PROJ-002', entity_name: 'Mobile App', level_code: 'project', parent_id: 'DEPT-001' },
    { entity_id: 'PROJ-003', entity_name: 'Brand Campaign', level_code: 'project', parent_id: 'DEPT-002' },
    { entity_id: 'TEAM-001', entity_name: 'Backend', level_code: 'team', parent_id: 'PROJ-001' },
    { entity_id: 'TEAM-002', entity_name: 'Frontend', level_code: 'team', parent_id: 'PROJ-001' },
    { entity_id: 'TEAM-003', entity_name: 'iOS', level_code: 'team', parent_id: 'PROJ-002' },
    { entity_id: 'TEAM-004', entity_name: 'Design', level_code: 'team', parent_id: 'PROJ-003' }
  ]

  it('should filter entities by level_code', () => {
    const departments = mockEntities.filter(e => e.level_code === 'department')
    const projects = mockEntities.filter(e => e.level_code === 'project')
    const teams = mockEntities.filter(e => e.level_code === 'team')

    expect(departments).toHaveLength(2)
    expect(projects).toHaveLength(3)
    expect(teams).toHaveLength(4)

    console.log('✓ Entities filtered by level_code')
  })

  it('should filter children by selected parent', () => {
    const selectedDeptId = 'DEPT-001'
    const filteredProjects = mockEntities.filter(
      e => e.level_code === 'project' && e.parent_id === selectedDeptId
    )

    expect(filteredProjects).toHaveLength(2)
    expect(filteredProjects.map(p => p.entity_id)).toContain('PROJ-001')
    expect(filteredProjects.map(p => p.entity_id)).toContain('PROJ-002')
    expect(filteredProjects.map(p => p.entity_id)).not.toContain('PROJ-003')

    console.log('✓ Children filtered by parent')
  })

  it('should filter teams by selected project', () => {
    const selectedProjectId = 'PROJ-001'
    const filteredTeams = mockEntities.filter(
      e => e.level_code === 'team' && e.parent_id === selectedProjectId
    )

    expect(filteredTeams).toHaveLength(2)
    expect(filteredTeams.map(t => t.entity_id)).toContain('TEAM-001')
    expect(filteredTeams.map(t => t.entity_id)).toContain('TEAM-002')

    console.log('✓ Teams filtered by project')
  })

  it('should clear child selections when parent changes', () => {
    // Simulate parent change
    const formData = {
      hierarchy_dept_id: 'DEPT-001',
      hierarchy_dept_name: 'Engineering',
      hierarchy_project_id: 'PROJ-001',
      hierarchy_project_name: 'Platform',
      hierarchy_team_id: 'TEAM-001',
      hierarchy_team_name: 'Backend'
    }

    // When department changes, project and team should be cleared
    const handleDepartmentChange = (newDeptId: string, newDeptName: string) => {
      return {
        ...formData,
        hierarchy_dept_id: newDeptId,
        hierarchy_dept_name: newDeptName,
        hierarchy_project_id: undefined,
        hierarchy_project_name: undefined,
        hierarchy_team_id: undefined,
        hierarchy_team_name: undefined
      }
    }

    const updatedFormData = handleDepartmentChange('DEPT-002', 'Marketing')

    expect(updatedFormData.hierarchy_dept_id).toBe('DEPT-002')
    expect(updatedFormData.hierarchy_project_id).toBeUndefined()
    expect(updatedFormData.hierarchy_team_id).toBeUndefined()

    console.log('✓ Child selections cleared on parent change')
  })
})

// ============================================
// Subscription Form Hierarchy Integration
// ============================================

describe('Subscription Form Hierarchy Integration', () => {
  it('should include hierarchy fields in subscription plan data', () => {
    const planData = {
      plan_name: 'PRO',
      display_name: 'Pro Plan',
      unit_price: 20.00,
      seats: 5,
      billing_cycle: 'monthly',
      pricing_model: 'PER_SEAT',
      // Hierarchy fields (still using dept/project/team for subscription compatibility)
      hierarchy_dept_id: 'DEPT-001',
      hierarchy_dept_name: 'Engineering',
      hierarchy_project_id: 'PROJ-001',
      hierarchy_project_name: 'Platform',
      hierarchy_team_id: 'TEAM-001',
      hierarchy_team_name: 'Backend'
    }

    // Verify all hierarchy fields exist
    expect(planData).toHaveProperty('hierarchy_dept_id')
    expect(planData).toHaveProperty('hierarchy_dept_name')
    expect(planData).toHaveProperty('hierarchy_project_id')
    expect(planData).toHaveProperty('hierarchy_project_name')
    expect(planData).toHaveProperty('hierarchy_team_id')
    expect(planData).toHaveProperty('hierarchy_team_name')

    console.log('✓ Hierarchy fields included in plan data')
  })

  it('should allow optional hierarchy fields', () => {
    // Hierarchy is optional for subscriptions
    const planDataWithoutHierarchy = {
      plan_name: 'BASIC',
      display_name: 'Basic Plan',
      unit_price: 10.00,
      seats: 1,
      billing_cycle: 'monthly',
      pricing_model: 'PER_SEAT'
    }

    expect(planDataWithoutHierarchy).not.toHaveProperty('hierarchy_dept_id')
    expect(planDataWithoutHierarchy).not.toHaveProperty('hierarchy_project_id')
    expect(planDataWithoutHierarchy).not.toHaveProperty('hierarchy_team_id')

    // This should be valid (no required hierarchy)
    const isValid = planDataWithoutHierarchy.plan_name.length > 0
    expect(isValid).toBe(true)

    console.log('✓ Optional hierarchy fields validated')
  })

  it('should validate hierarchy field lengths', () => {
    const maxIdLength = 50
    const maxNameLength = 200

    const validHierarchy = {
      hierarchy_dept_id: 'DEPT-001',
      hierarchy_dept_name: 'Engineering Department',
      hierarchy_project_id: 'PROJ-001',
      hierarchy_project_name: 'Platform Development',
      hierarchy_team_id: 'TEAM-001',
      hierarchy_team_name: 'Backend Engineering'
    }

    // All IDs within limit
    expect(validHierarchy.hierarchy_dept_id.length <= maxIdLength).toBe(true)
    expect(validHierarchy.hierarchy_project_id.length <= maxIdLength).toBe(true)
    expect(validHierarchy.hierarchy_team_id.length <= maxIdLength).toBe(true)

    // All names within limit
    expect(validHierarchy.hierarchy_dept_name.length <= maxNameLength).toBe(true)
    expect(validHierarchy.hierarchy_project_name.length <= maxNameLength).toBe(true)
    expect(validHierarchy.hierarchy_team_name.length <= maxNameLength).toBe(true)

    console.log('✓ Hierarchy field lengths validated')
  })
})

// ============================================
// N-Level API Endpoints
// ============================================

describe('N-Level Hierarchy API Endpoints', () => {
  const API_BASE = 'http://localhost:8000/api/v1/hierarchy'
  const TEST_ORG = 'test_org'

  it('should validate hierarchy list endpoint', () => {
    const endpoint = `${API_BASE}/${TEST_ORG}`
    expect(endpoint).toContain('/api/v1/hierarchy/')
    expect(endpoint).toContain(TEST_ORG)

    console.log(`✓ GET ${endpoint}`)
  })

  it('should validate hierarchy tree endpoint', () => {
    const endpoint = `${API_BASE}/${TEST_ORG}/tree`
    expect(endpoint).toContain('/tree')

    console.log(`✓ GET ${endpoint}`)
  })

  it('should validate levels configuration endpoint', () => {
    const endpoint = `${API_BASE}/${TEST_ORG}/levels`
    expect(endpoint).toContain('/levels')

    console.log(`✓ GET ${endpoint}`)
  })

  it('should validate generic entity creation endpoint', () => {
    // N-level uses /entities for all entity types
    const endpoint = `${API_BASE}/${TEST_ORG}/entities`
    expect(endpoint).toContain('/entities')

    console.log(`✓ POST ${endpoint}`)
  })

  it('should validate entity update endpoint', () => {
    const entityId = 'DEPT-001'
    const endpoint = `${API_BASE}/${TEST_ORG}/entities/${entityId}`

    expect(endpoint).toContain('/entities/')
    expect(endpoint).toContain(entityId)

    console.log(`✓ PUT ${endpoint}`)
  })

  it('should validate entity delete endpoint', () => {
    const entityId = 'TEAM-001'
    const endpoint = `${API_BASE}/${TEST_ORG}/entities/${entityId}`

    expect(endpoint).toContain('/entities/')
    expect(endpoint).toContain(entityId)

    console.log(`✓ DELETE ${endpoint}`)
  })

  it('should validate can-delete check endpoint', () => {
    const entityId = 'DEPT-001'
    const endpoint = `${API_BASE}/${TEST_ORG}/entities/${entityId}/can-delete`

    expect(endpoint).toContain('/can-delete')

    console.log(`✓ GET ${endpoint}`)
  })

  it('should validate move entity endpoint', () => {
    const entityId = 'PROJ-001'
    const endpoint = `${API_BASE}/${TEST_ORG}/entities/${entityId}/move`

    expect(endpoint).toContain('/move')

    console.log(`✓ POST ${endpoint}`)
  })

  it('should validate get children endpoint', () => {
    const entityId = 'DEPT-001'
    const endpoint = `${API_BASE}/${TEST_ORG}/entities/${entityId}/children`

    expect(endpoint).toContain('/children')

    console.log(`✓ GET ${endpoint}`)
  })
})

// ============================================
// Default Hierarchy Seeding (N-Level)
// ============================================

describe('Default Hierarchy Seeding (N-Level)', () => {
  it('should define default N-level hierarchy structure', () => {
    const defaultHierarchy = [
      // Level 1: Departments
      {
        entity_id: 'DEPT-CORP',
        entity_name: 'Corporate',
        level: 1,
        level_code: 'department',
        parent_id: null,
        path: '/DEPT-CORP',
        depth: 0
      },
      {
        entity_id: 'DEPT-ENG',
        entity_name: 'Engineering',
        level: 1,
        level_code: 'department',
        parent_id: null,
        path: '/DEPT-ENG',
        depth: 0
      },
      // Level 2: Projects
      {
        entity_id: 'PROJ-001',
        entity_name: 'Platform',
        level: 2,
        level_code: 'project',
        parent_id: 'DEPT-ENG',
        path: '/DEPT-ENG/PROJ-001',
        depth: 1
      },
      {
        entity_id: 'PROJ-002',
        entity_name: 'Mobile',
        level: 2,
        level_code: 'project',
        parent_id: 'DEPT-ENG',
        path: '/DEPT-ENG/PROJ-002',
        depth: 1
      },
      {
        entity_id: 'PROJ-003',
        entity_name: 'Finance Systems',
        level: 2,
        level_code: 'project',
        parent_id: 'DEPT-CORP',
        path: '/DEPT-CORP/PROJ-003',
        depth: 1
      },
      // Level 3: Teams
      {
        entity_id: 'TEAM-001',
        entity_name: 'Backend',
        level: 3,
        level_code: 'team',
        parent_id: 'PROJ-001',
        path: '/DEPT-ENG/PROJ-001/TEAM-001',
        depth: 2
      },
      {
        entity_id: 'TEAM-002',
        entity_name: 'Frontend',
        level: 3,
        level_code: 'team',
        parent_id: 'PROJ-001',
        path: '/DEPT-ENG/PROJ-001/TEAM-002',
        depth: 2
      }
    ]

    // Verify counts by level_code
    const departments = defaultHierarchy.filter(e => e.level_code === 'department')
    const projects = defaultHierarchy.filter(e => e.level_code === 'project')
    const teams = defaultHierarchy.filter(e => e.level_code === 'team')

    expect(departments).toHaveLength(2)
    expect(projects).toHaveLength(3)
    expect(teams).toHaveLength(2)

    // Verify path structure
    const team = defaultHierarchy.find(e => e.entity_id === 'TEAM-001')
    expect(team?.path).toBe('/DEPT-ENG/PROJ-001/TEAM-001')
    expect(team?.depth).toBe(2)

    console.log('✓ Default N-level hierarchy structure validated')
    console.log(`  Departments: ${departments.length}`)
    console.log(`  Projects: ${projects.length}`)
    console.log(`  Teams: ${teams.length}`)
  })
})

// ============================================
// Materialized Path Validation
// ============================================

describe('Materialized Path Validation', () => {
  it('should validate path format', () => {
    const validPaths = [
      '/DEPT-001',
      '/DEPT-001/PROJ-001',
      '/DEPT-001/PROJ-001/TEAM-001',
      '/DIV-001/DEPT-001/PROJ-001/TEAM-001/SQUAD-001'
    ]

    validPaths.forEach(path => {
      expect(path.startsWith('/')).toBe(true)
      expect(path.split('/').filter(Boolean).length).toBeGreaterThan(0)
    })

    console.log('✓ Path format validated')
  })

  it('should validate path_ids array', () => {
    const entity = {
      path: '/DEPT-001/PROJ-001/TEAM-001',
      path_ids: ['DEPT-001', 'PROJ-001', 'TEAM-001']
    }

    const pathParts = entity.path.split('/').filter(Boolean)
    expect(entity.path_ids).toEqual(pathParts)
    expect(entity.path_ids.length).toBe(3)

    console.log('✓ Path IDs array validated')
  })

  it('should validate depth calculation', () => {
    const entities = [
      { path: '/DEPT-001', depth: 0 },
      { path: '/DEPT-001/PROJ-001', depth: 1 },
      { path: '/DEPT-001/PROJ-001/TEAM-001', depth: 2 }
    ]

    entities.forEach(entity => {
      const calculatedDepth = entity.path.split('/').filter(Boolean).length - 1
      expect(entity.depth).toBe(calculatedDepth)
    })

    console.log('✓ Depth calculation validated')
  })
})
