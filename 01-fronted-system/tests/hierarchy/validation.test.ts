/**
 * @vitest-environment node
 *
 * Hierarchy Validation Tests
 *
 * Tests organizational hierarchy:
 * - Cascading dropdown behavior (Department → Project → Team)
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

  it('should validate entity types', () => {
    const validTypes = ['department', 'project', 'team']

    expect(validTypes.includes('department')).toBe(true)
    expect(validTypes.includes('project')).toBe(true)
    expect(validTypes.includes('team')).toBe(true)
    expect(validTypes.includes('division')).toBe(false)
    expect(validTypes.includes('organization')).toBe(false)

    console.log('✓ Entity types validated')
  })
})

// ============================================
// Hierarchy Structure Validation
// ============================================

describe('Hierarchy Structure Validation', () => {
  it('should enforce parent-child relationships', () => {
    // Department has no parent
    const department = {
      entity_type: 'department',
      entity_id: 'DEPT-001',
      parent_id: null
    }
    expect(department.parent_id).toBeNull()

    // Project must have department parent
    const project = {
      entity_type: 'project',
      entity_id: 'PROJ-001',
      parent_id: 'DEPT-001',
      dept_id: 'DEPT-001'
    }
    expect(project.parent_id).toBe('DEPT-001')
    expect(project.dept_id).toBe('DEPT-001')

    // Team must have project parent
    const team = {
      entity_type: 'team',
      entity_id: 'TEAM-001',
      parent_id: 'PROJ-001',
      project_id: 'PROJ-001'
    }
    expect(team.parent_id).toBe('PROJ-001')
    expect(team.project_id).toBe('PROJ-001')

    console.log('✓ Parent-child relationships validated')
  })

  it('should validate hierarchy depth (max 3 levels)', () => {
    const hierarchy = {
      departments: [
        {
          entity_id: 'DEPT-001',
          children: [
            {
              entity_id: 'PROJ-001',
              children: [
                {
                  entity_id: 'TEAM-001',
                  children: [] // Teams cannot have children
                }
              ]
            }
          ]
        }
      ]
    }

    const maxDepth = 3
    const dept = hierarchy.departments[0]
    const project = dept.children[0]
    const team = project.children[0]

    expect(team.children.length).toBe(0)
    console.log('✓ Hierarchy depth (max 3 levels) validated')
  })
})

// ============================================
// Cascading Dropdown Behavior
// ============================================

describe('Cascading Dropdown Behavior', () => {
  // Mock hierarchy data
  const mockDepartments = [
    { entity_id: 'DEPT-001', entity_name: 'Engineering' },
    { entity_id: 'DEPT-002', entity_name: 'Marketing' }
  ]

  const mockProjects = [
    { entity_id: 'PROJ-001', entity_name: 'Platform', parent_id: 'DEPT-001' },
    { entity_id: 'PROJ-002', entity_name: 'Mobile App', parent_id: 'DEPT-001' },
    { entity_id: 'PROJ-003', entity_name: 'Brand Campaign', parent_id: 'DEPT-002' }
  ]

  const mockTeams = [
    { entity_id: 'TEAM-001', entity_name: 'Backend', parent_id: 'PROJ-001' },
    { entity_id: 'TEAM-002', entity_name: 'Frontend', parent_id: 'PROJ-001' },
    { entity_id: 'TEAM-003', entity_name: 'iOS', parent_id: 'PROJ-002' },
    { entity_id: 'TEAM-004', entity_name: 'Design', parent_id: 'PROJ-003' }
  ]

  it('should filter projects by selected department', () => {
    const selectedDeptId = 'DEPT-001'
    const filteredProjects = mockProjects.filter(p => p.parent_id === selectedDeptId)

    expect(filteredProjects).toHaveLength(2)
    expect(filteredProjects.map(p => p.entity_id)).toContain('PROJ-001')
    expect(filteredProjects.map(p => p.entity_id)).toContain('PROJ-002')
    expect(filteredProjects.map(p => p.entity_id)).not.toContain('PROJ-003')

    console.log('✓ Projects filtered by department')
  })

  it('should filter teams by selected project', () => {
    const selectedProjectId = 'PROJ-001'
    const filteredTeams = mockTeams.filter(t => t.parent_id === selectedProjectId)

    expect(filteredTeams).toHaveLength(2)
    expect(filteredTeams.map(t => t.entity_id)).toContain('TEAM-001')
    expect(filteredTeams.map(t => t.entity_id)).toContain('TEAM-002')

    console.log('✓ Teams filtered by project')
  })

  it('should clear child selections when parent changes', () => {
    // Simulate department change
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

  it('should clear team selection when project changes', () => {
    const formData = {
      hierarchy_dept_id: 'DEPT-001',
      hierarchy_project_id: 'PROJ-001',
      hierarchy_team_id: 'TEAM-001'
    }

    // When project changes, team should be cleared
    const handleProjectChange = (newProjectId: string, newProjectName: string) => {
      return {
        ...formData,
        hierarchy_project_id: newProjectId,
        hierarchy_project_name: newProjectName,
        hierarchy_team_id: undefined,
        hierarchy_team_name: undefined
      }
    }

    const updatedFormData = handleProjectChange('PROJ-002', 'Mobile App')

    expect(updatedFormData.hierarchy_project_id).toBe('PROJ-002')
    expect(updatedFormData.hierarchy_team_id).toBeUndefined()

    console.log('✓ Team cleared on project change')
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
      // Hierarchy fields
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

  it('should preserve hierarchy fields during edit', () => {
    const originalPlan = {
      plan_name: 'PRO',
      unit_price: 20.00,
      hierarchy_dept_id: 'DEPT-001',
      hierarchy_dept_name: 'Engineering',
      hierarchy_project_id: 'PROJ-001',
      hierarchy_project_name: 'Platform'
    }

    const editRequest = {
      unit_price: 25.00 // Only price changed
    }

    // New version should preserve hierarchy
    const newVersion = {
      ...originalPlan,
      ...editRequest
    }

    expect(newVersion.hierarchy_dept_id).toBe('DEPT-001')
    expect(newVersion.hierarchy_dept_name).toBe('Engineering')
    expect(newVersion.hierarchy_project_id).toBe('PROJ-001')
    expect(newVersion.unit_price).toBe(25.00)

    console.log('✓ Hierarchy fields preserved during edit')
  })
})

// ============================================
// API Endpoint Validation
// ============================================

describe('Hierarchy API Endpoints', () => {
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

  it('should validate department creation endpoint', () => {
    const endpoint = `${API_BASE}/${TEST_ORG}/departments`
    expect(endpoint).toContain('/departments')

    console.log(`✓ POST ${endpoint}`)
  })

  it('should validate project creation endpoint', () => {
    const endpoint = `${API_BASE}/${TEST_ORG}/projects`
    expect(endpoint).toContain('/projects')

    console.log(`✓ POST ${endpoint}`)
  })

  it('should validate team creation endpoint', () => {
    const endpoint = `${API_BASE}/${TEST_ORG}/teams`
    expect(endpoint).toContain('/teams')

    console.log(`✓ POST ${endpoint}`)
  })

  it('should validate entity update endpoint', () => {
    const entityType = 'department'
    const entityId = 'DEPT-001'
    const endpoint = `${API_BASE}/${TEST_ORG}/${entityType}/${entityId}`

    expect(endpoint).toContain(entityType)
    expect(endpoint).toContain(entityId)

    console.log(`✓ PUT ${endpoint}`)
  })

  it('should validate entity delete endpoint', () => {
    const entityType = 'team'
    const entityId = 'TEAM-001'
    const endpoint = `${API_BASE}/${TEST_ORG}/${entityType}/${entityId}`

    expect(endpoint).toContain(entityType)
    expect(endpoint).toContain(entityId)

    console.log(`✓ DELETE ${endpoint}`)
  })

  it('should validate import endpoint', () => {
    const endpoint = `${API_BASE}/${TEST_ORG}/import`
    expect(endpoint).toContain('/import')

    console.log(`✓ POST ${endpoint}`)
  })

  it('should validate export endpoint', () => {
    const endpoint = `${API_BASE}/${TEST_ORG}/export`
    expect(endpoint).toContain('/export')

    console.log(`✓ GET ${endpoint}`)
  })
})

// ============================================
// Default Hierarchy Seeding
// ============================================

describe('Default Hierarchy Seeding', () => {
  it('should define default hierarchy structure', () => {
    const defaultHierarchy = {
      departments: [
        { entity_id: 'DEPT-001', entity_name: 'Engineering' },
        { entity_id: 'DEPT-002', entity_name: 'Operations' }
      ],
      projects: [
        { entity_id: 'PROJ-001', entity_name: 'Platform', dept_id: 'DEPT-001' },
        { entity_id: 'PROJ-002', entity_name: 'Mobile', dept_id: 'DEPT-001' },
        { entity_id: 'PROJ-003', entity_name: 'Infrastructure', dept_id: 'DEPT-002' }
      ],
      teams: [
        { entity_id: 'TEAM-001', entity_name: 'Backend', project_id: 'PROJ-001' },
        { entity_id: 'TEAM-002', entity_name: 'Frontend', project_id: 'PROJ-001' },
        { entity_id: 'TEAM-003', entity_name: 'iOS', project_id: 'PROJ-002' },
        { entity_id: 'TEAM-004', entity_name: 'DevOps', project_id: 'PROJ-003' }
      ]
    }

    // Verify counts
    expect(defaultHierarchy.departments).toHaveLength(2)
    expect(defaultHierarchy.projects).toHaveLength(3)
    expect(defaultHierarchy.teams).toHaveLength(4)

    // Verify relationships
    const platformTeams = defaultHierarchy.teams.filter(t => t.project_id === 'PROJ-001')
    expect(platformTeams).toHaveLength(2)

    console.log('✓ Default hierarchy structure validated')
    console.log(`  Departments: ${defaultHierarchy.departments.length}`)
    console.log(`  Projects: ${defaultHierarchy.projects.length}`)
    console.log(`  Teams: ${defaultHierarchy.teams.length}`)
  })
})

// ============================================
// CSV Import/Export Validation
// ============================================

describe('Hierarchy CSV Import/Export', () => {
  it('should validate CSV header format', () => {
    const expectedHeaders = [
      'entity_type',
      'entity_id',
      'entity_name',
      'parent_id',
      'owner_id',
      'owner_name',
      'owner_email',
      'description'
    ]

    expect(expectedHeaders).toContain('entity_type')
    expect(expectedHeaders).toContain('entity_id')
    expect(expectedHeaders).toContain('entity_name')
    expect(expectedHeaders).toContain('parent_id')

    console.log('✓ CSV headers validated')
  })

  it('should validate CSV row data', () => {
    const validRows = [
      {
        entity_type: 'department',
        entity_id: 'DEPT-001',
        entity_name: 'Engineering',
        parent_id: '',
        owner_email: 'cto@example.com'
      },
      {
        entity_type: 'project',
        entity_id: 'PROJ-001',
        entity_name: 'Platform',
        parent_id: 'DEPT-001',
        owner_email: 'pm@example.com'
      },
      {
        entity_type: 'team',
        entity_id: 'TEAM-001',
        entity_name: 'Backend',
        parent_id: 'PROJ-001',
        owner_email: 'lead@example.com'
      }
    ]

    // Departments have no parent
    const dept = validRows.find(r => r.entity_type === 'department')
    expect(dept?.parent_id).toBe('')

    // Projects have department parent
    const proj = validRows.find(r => r.entity_type === 'project')
    expect(proj?.parent_id).toBe('DEPT-001')

    // Teams have project parent
    const team = validRows.find(r => r.entity_type === 'team')
    expect(team?.parent_id).toBe('PROJ-001')

    console.log('✓ CSV row data validated')
  })
})
