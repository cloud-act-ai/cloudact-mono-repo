/**
 * Load Demo Data via Pipeline Service API
 *
 * This script loads demo data and runs pipelines via the Pipeline Service API (port 8001).
 * It syncs stored procedures and triggers cost calculation pipelines.
 *
 * Usage:
 *   npx ts-node tests/demo-setup/load-demo-data-direct.ts --org-slug=acme_inc --api-key=YOUR_API_KEY
 *   npx ts-node tests/demo-setup/load-demo-data-direct.ts --org-slug=acme_inc --api-key=YOUR_API_KEY --skip-raw
 *   npx ts-node tests/demo-setup/load-demo-data-direct.ts --org-slug=acme_inc --api-key=YOUR_API_KEY --pipelines-only
 *
 * Prerequisites:
 *   - Pipeline Service running: http://localhost:8001
 *   - API Service running: http://localhost:8000 (for validation)
 *   - Demo org already created via Playwright
 *   - Valid org API key
 *
 * Flow:
 *   1. Sync stored procedures (once per session)
 *   2. Load raw data from JSON/CSV files → BigQuery tables (via bq CLI)
 *   3. Run pipelines via API:
 *      - Subscription costs: /pipelines/run/{org}/subscription/costs/subscription_cost
 *      - GenAI consolidation: /pipelines/run/{org}/genai/unified/consolidate
 *      - Cloud FOCUS convert: /pipelines/run/{org}/cloud/{provider}/cost/focus_convert
 */

import { execSync, spawnSync } from 'child_process'
import * as path from 'path'
import {
    ENV_CONFIG,
    getDefaultOrgSlug,
    getDatasetName
} from './config'

// Configuration
const GCP_PROJECT_ID = ENV_CONFIG.gcpProjectId
const PIPELINE_SERVICE_URL = process.env.PIPELINE_SERVICE_URL || 'http://localhost:8001'
const CA_ROOT_API_KEY = ENV_CONFIG.caRootApiKey
const DEMO_DATA_PATH = path.resolve(__dirname, '../../../04-inra-cicd-automation/load-demo-data')

// Default date range for demo data
const START_DATE = '2025-01-01'
const END_DATE = '2026-01-05'

interface LoadConfig {
    orgSlug: string
    apiKey: string
    skipRaw: boolean
    pipelinesOnly: boolean
    rawOnly: boolean
    startDate: string
    endDate: string
}

interface PipelineStatus {
    status: string
    pipelineLoggingId?: string
    diagnosis?: string
    suggestedFix?: string
    autoFixAttempted?: boolean
    autoFixSuccess?: boolean
    retried?: boolean
}

interface LoadResult {
    success: boolean
    message: string
    serviceHealth: {
        api: boolean
        pipeline: boolean
    }
    proceduresSynced: boolean
    rawDataLoaded: {
        genai: boolean
        cloud: boolean
        subscriptions: boolean
        pricing: boolean
        hierarchy: boolean
    }
    pipelinesExecuted: {
        subscription: PipelineStatus
        genai: PipelineStatus
        cloud: PipelineStatus
    }
    errors: string[]
    warnings: string[]
    fixes: string[]
}

function parseArgs(): LoadConfig {
    const args = process.argv.slice(2)
    const config: LoadConfig = {
        orgSlug: getDefaultOrgSlug(),  // "acme_inc"
        apiKey: '',
        skipRaw: false,
        pipelinesOnly: false,
        rawOnly: false,
        startDate: START_DATE,
        endDate: END_DATE
    }

    for (const arg of args) {
        const [key, value] = arg.replace('--', '').split('=')
        if (key && value) {
            switch (key) {
                case 'org-slug':
                case 'orgSlug':
                    config.orgSlug = value
                    break
                case 'api-key':
                case 'apiKey':
                    config.apiKey = value
                    break
                case 'start-date':
                    config.startDate = value
                    break
                case 'end-date':
                    config.endDate = value
                    break
            }
        } else if (key) {
            switch (key) {
                case 'skip-raw':
                    config.skipRaw = true
                    break
                case 'pipelines-only':
                    config.pipelinesOnly = true
                    config.skipRaw = true
                    break
                case 'raw-only':
                    config.rawOnly = true
                    break
            }
        }
    }

    return config
}

function runCommand(command: string, description: string, allowFail = false): boolean {
    console.log(`  ${description}...`)
    try {
        const result = spawnSync('bash', ['-c', command], {
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf-8'
        })

        if (result.status !== 0) {
            if (!allowFail) {
                console.error(`    ERROR: ${result.stderr || result.stdout}`)
            }
            return false
        }
        console.log(`    OK`)
        return true
    } catch (error) {
        if (!allowFail) {
            console.error(`    ERROR: ${error}`)
        }
        return false
    }
}

async function syncProcedures(): Promise<boolean> {
    console.log('\n[Step 1] Syncing stored procedures...')

    try {
        const response = await fetch(`${PIPELINE_SERVICE_URL}/api/v1/procedures/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CA-Root-Key': CA_ROOT_API_KEY
            },
            body: JSON.stringify({ force: true })
        })

        if (!response.ok) {
            const error = await response.text()
            console.error(`    ERROR: Failed to sync procedures: ${error}`)
            return false
        }

        const result = await response.json()
        console.log(`    Created: ${result.created?.length || 0}`)
        console.log(`    Updated: ${result.updated?.length || 0}`)
        console.log(`    Skipped: ${result.skipped?.length || 0}`)

        if (result.failed?.length > 0) {
            console.error(`    Failed: ${result.failed.length}`)
            result.failed.forEach((f: { procedure: string; error: string }) => {
                console.error(`      - ${f.procedure}: ${f.error}`)
            })
            return false
        }

        console.log(`    OK`)
        return true
    } catch (error) {
        console.error(`    ERROR: ${error}`)
        return false
    }
}

function loadPricingSeed(orgSlug: string, dataset: string): boolean {
    console.log('\n[Step 2] Loading GenAI pricing seed data...')

    // CRITICAL FIX: Use script to add x_org_slug column before loading
    // Bug: genai_payg_pricing.csv is missing x_org_slug (REQUIRED by schema)
    const fixScript = path.resolve(__dirname, '../../../04-inra-cicd-automation/load-demo-data/scripts/fix_genai_pricing_for_org.sh')
    const command = `bash ${fixScript} ${orgSlug} ${GCP_PROJECT_ID} ${dataset}`

    return runCommand(command, 'Loading genai_payg_pricing (with x_org_slug fix)')
}

function loadHierarchy(orgSlug: string, apiKey: string): boolean {
    console.log('\n[Step 2.5] Loading hierarchy levels and entities...')

    const API_SERVICE_URL = process.env.API_SERVICE_URL || 'http://localhost:8000'

    // Step 1: Seed hierarchy levels (DEPT, PROJ, TEAM)
    console.log('    Seeding hierarchy levels...')
    try {
        const seedResult = spawnSync('curl', [
            '-s', '-X', 'POST',
            `${API_SERVICE_URL}/api/v1/hierarchy/${orgSlug}/levels/seed`,
            '-H', `X-API-Key: ${apiKey}`,
            '-H', 'Content-Type: application/json'
        ], { encoding: 'utf-8' })

        if (seedResult.status !== 0) {
            console.log('    WARNING: Failed to seed levels (may already exist)')
        } else {
            const response = JSON.parse(seedResult.stdout || '{}')
            console.log(`    Seeded ${response.total || 0} hierarchy levels`)
        }
    } catch {
        console.log('    WARNING: Error seeding levels')
    }

    // Step 2: Load hierarchy entities from template CSV
    console.log('    Loading hierarchy entities from template...')
    const templatePath = path.resolve(__dirname, '../../lib/seed/hierarchy_template.csv')

    try {
        const fs = require('fs')
        if (!fs.existsSync(templatePath)) {
            console.log(`    WARNING: Template not found at ${templatePath}`)
            return true // Levels seeded, entities optional
        }

        const csvContent = fs.readFileSync(templatePath, 'utf-8')
        const lines = csvContent.trim().split('\n').slice(1) // Skip header

        let created = 0
        let skipped = 0

        for (const line of lines) {
            const [entityId, entityName, level, levelCode, parentId, ownerName, ownerEmail, description] = line.split(',')

            if (!entityId || !entityName || !levelCode) continue

            const payload = {
                entity_id: entityId.trim(),
                entity_name: entityName.trim(),
                level_code: levelCode.trim(),
                parent_id: parentId?.trim() || null,
                owner_name: ownerName?.trim() || null,
                owner_email: ownerEmail?.trim() || null,
                description: description?.trim() || null
            }

            const createResult = spawnSync('curl', [
                '-s', '-X', 'POST',
                `${API_SERVICE_URL}/api/v1/hierarchy/${orgSlug}/entities`,
                '-H', `X-API-Key: ${apiKey}`,
                '-H', 'Content-Type: application/json',
                '-d', JSON.stringify(payload)
            ], { encoding: 'utf-8' })

            if (createResult.status === 0 && !createResult.stdout?.includes('error')) {
                created++
            } else {
                skipped++ // Already exists or error
            }
        }

        console.log(`    Created ${created} entities, skipped ${skipped} (may already exist)`)
        return true
    } catch (error) {
        console.log(`    WARNING: Error loading entities: ${error}`)
        return true // Continue anyway
    }
}

function loadGenAIData(orgSlug: string, dataset: string): boolean {
    console.log('\n[Step 3] Loading GenAI usage raw data...')

    const providers = ['openai', 'anthropic', 'gemini']
    const allSuccess = true

    for (const provider of providers) {
        const jsonFile = `${DEMO_DATA_PATH}/data/genai/${provider}_usage_raw.json`
        const table = `${GCP_PROJECT_ID}:${dataset}.genai_payg_usage_raw`
        const tmpFile = `/tmp/${provider}_usage_raw_fixed.json`

        // Create temp file with org_slug replaced (simple pattern replacement)
        const fixCommand = `cat ${jsonFile} | sed 's/acme_inc_[0-9]*/${orgSlug}/g' > ${tmpFile}`
        const loadCommand = `bq load --source_format=NEWLINE_DELIMITED_JSON ${table} ${tmpFile}`

        if (!runCommand(fixCommand, `Preparing ${provider} data`, true)) {
            console.log(`    (Skipped - file may not exist)`)
            continue
        }

        if (!runCommand(loadCommand, `Loading ${provider} usage data`, true)) {
            console.log(`    (Skipped - load failed)`)
        }

        // Cleanup
        runCommand(`rm -f ${tmpFile}`, 'Cleanup', true)
    }

    return allSuccess
}

function loadCloudData(orgSlug: string, dataset: string): boolean {
    console.log('\n[Step 4] Loading Cloud billing raw data...')

    const providers = [
        { name: 'gcp', table: 'cloud_gcp_billing_raw_daily' },
        { name: 'aws', table: 'cloud_aws_billing_raw_daily' },
        { name: 'azure', table: 'cloud_azure_billing_raw_daily' },
        { name: 'oci', table: 'cloud_oci_billing_raw_daily' }
    ]
    const allSuccess = true

    for (const provider of providers) {
        const jsonFile = `${DEMO_DATA_PATH}/data/cloud/${provider.name}_billing_raw.json`
        const table = `${GCP_PROJECT_ID}:${dataset}.${provider.table}`
        const tmpFile = `/tmp/${provider.name}_billing_raw_fixed.json`

        // Create temp file with org_slug replaced (simple pattern replacement)
        const fixCommand = `cat ${jsonFile} | sed 's/acme_inc_[0-9]*/${orgSlug}/g' > ${tmpFile}`
        const loadCommand = `bq load --source_format=NEWLINE_DELIMITED_JSON ${table} ${tmpFile}`

        if (!runCommand(fixCommand, `Preparing ${provider.name} data`, true)) {
            console.log(`    (Skipped - file may not exist)`)
            continue
        }

        if (!runCommand(loadCommand, `Loading ${provider.name} billing data`, true)) {
            console.log(`    (Skipped - load failed)`)
        }

        // Cleanup
        runCommand(`rm -f ${tmpFile}`, 'Cleanup', true)
    }

    return allSuccess
}

function loadSubscriptionPlans(orgSlug: string, dataset: string): boolean {
    console.log('\n[Step 5] Loading Subscription plans...')

    const csvFile = `${DEMO_DATA_PATH}/data/subscriptions/subscription_plans.csv`
    const table = `${GCP_PROJECT_ID}:${dataset}.subscription_plans`

    // Create temp file with org_slug replaced, then load
    // The sed command replaces the first field (org_slug) in each CSV row
    const tmpFile = '/tmp/subscription_plans_fixed.csv'
    const fixCommand = `tail -n +2 ${csvFile} | sed 's/^[^,]*,/${orgSlug},/' > ${tmpFile}`
    const loadCommand = `bq load --source_format=CSV --replace ${table} ${tmpFile}`

    // Create fixed file first
    if (!runCommand(fixCommand, 'Creating fixed subscription data')) {
        return false
    }

    // Then load it
    const result = runCommand(loadCommand, 'Loading subscription_plans')

    // Cleanup
    runCommand(`rm -f ${tmpFile}`, 'Cleanup temp file', true)

    return result
}

interface PipelineResponse {
    status: string
    pipeline_logging_id?: string
    message?: string
    error_details?: string
}

interface PipelineRunDetails {
    status: string
    error_message?: string
    error_details?: string
    started_at?: string
    completed_at?: string
}

/**
 * Check service health before running pipelines
 */
async function checkServiceHealth(): Promise<{ api: boolean; pipeline: boolean; errors: string[] }> {
    const errors: string[] = []
    let apiOk = false
    let pipelineOk = false

    // Check API Service
    try {
        const apiResponse = await fetch(`${process.env.API_SERVICE_URL || 'http://localhost:8000'}/health`)
        apiOk = apiResponse.ok
        if (!apiOk) errors.push(`API Service unhealthy: ${apiResponse.status}`)
    } catch (error) {
        errors.push(`API Service unreachable: ${error}`)
    }

    // Check Pipeline Service
    try {
        const pipelineResponse = await fetch(`${PIPELINE_SERVICE_URL}/health`)
        pipelineOk = pipelineResponse.ok
        if (!pipelineOk) errors.push(`Pipeline Service unhealthy: ${pipelineResponse.status}`)
    } catch (error) {
        errors.push(`Pipeline Service unreachable: ${error}`)
    }

    return { api: apiOk, pipeline: pipelineOk, errors }
}

/**
 * Get detailed pipeline run status including error information
 */
async function getPipelineRunDetails(pipelineId: string, apiKey: string): Promise<PipelineRunDetails | null> {
    try {
        const response = await fetch(
            `${PIPELINE_SERVICE_URL}/api/v1/pipelines/runs/${pipelineId}`,
            { headers: { 'X-API-Key': apiKey } }
        )
        if (response.ok) {
            return await response.json()
        }
    } catch (error) {
        // Ignore
    }
    return null
}

/**
 * Diagnose pipeline failure and suggest fixes
 */
async function diagnosePipelineFailure(
    pipelineId: string,
    pipelineName: string,
    apiKey: string,
    orgSlug: string,
    dataset: string
): Promise<{ diagnosis: string; suggestedFix: string; canAutoFix: boolean }> {
    const details = await getPipelineRunDetails(pipelineId, apiKey)
    const errorMsg = details?.error_message || details?.error_details || ''

    // Check for common error patterns
    if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        return {
            diagnosis: `Pipeline config not found: ${pipelineName}`,
            suggestedFix: 'Sync procedures: POST /api/v1/procedures/sync',
            canAutoFix: true
        }
    }

    if (errorMsg.includes('schema') || errorMsg.includes('column')) {
        return {
            diagnosis: `Schema mismatch in ${pipelineName}`,
            suggestedFix: 'Check table schema in BigQuery matches procedure expectations',
            canAutoFix: false
        }
    }

    if (errorMsg.includes('No data') || errorMsg.includes('empty')) {
        return {
            diagnosis: `No source data for ${pipelineName}`,
            suggestedFix: 'Load raw data first with --raw-only flag',
            canAutoFix: false
        }
    }

    if (errorMsg.includes('permission') || errorMsg.includes('403')) {
        return {
            diagnosis: `Permission denied for ${pipelineName}`,
            suggestedFix: 'Check API key has access to org and BigQuery permissions',
            canAutoFix: false
        }
    }

    if (errorMsg.includes('procedure') || errorMsg.includes('CALL')) {
        return {
            diagnosis: `Stored procedure error in ${pipelineName}`,
            suggestedFix: 'Re-sync procedures and check SQL syntax',
            canAutoFix: true
        }
    }

    // Check if source tables exist
    const sourceTableCheck = await checkSourceTables(orgSlug, dataset, pipelineName)
    if (!sourceTableCheck.exists) {
        return {
            diagnosis: `Missing source table: ${sourceTableCheck.missingTable}`,
            suggestedFix: `Load raw data for ${sourceTableCheck.missingTable}`,
            canAutoFix: false
        }
    }

    return {
        diagnosis: `Unknown error: ${errorMsg.substring(0, 200)}`,
        suggestedFix: 'Check Pipeline Service logs for details',
        canAutoFix: false
    }
}

/**
 * Check if source tables exist for a pipeline
 */
async function checkSourceTables(
    orgSlug: string,
    dataset: string,
    pipelineName: string
): Promise<{ exists: boolean; missingTable?: string }> {
    const tableMap: Record<string, string[]> = {
        'subscription': ['subscription_plans'],
        'genai': ['genai_payg_usage_raw', 'genai_payg_pricing'],
        'cloud': ['cloud_gcp_billing_raw_daily', 'cloud_aws_billing_raw_daily']
    }

    const pipelineType = Object.keys(tableMap).find(key => pipelineName.includes(key))
    if (!pipelineType) return { exists: true }

    const tables = tableMap[pipelineType]
    for (const table of tables) {
        // Use colon format for bq commands: project:dataset.table
        const fullTable = `${GCP_PROJECT_ID}:${dataset}.${table}`

        try {
            const result = spawnSync('bq', ['show', '--format=json', fullTable], { encoding: 'utf-8' })
            if (result.status !== 0) {
                return { exists: false, missingTable: table }
            }
        } catch {
            // Ignore check errors
        }
    }

    return { exists: true }
}

/**
 * Attempt auto-fix based on diagnosis
 */
async function attemptAutoFix(
    diagnosis: { diagnosis: string; suggestedFix: string; canAutoFix: boolean },
    fixes: string[]
): Promise<boolean> {
    if (!diagnosis.canAutoFix) {
        return false
    }

    console.log(`    Attempting auto-fix: ${diagnosis.suggestedFix}`)

    // Re-sync procedures
    if (diagnosis.suggestedFix.includes('procedures') || diagnosis.suggestedFix.includes('Sync')) {
        console.log('    Re-syncing stored procedures...')
        const synced = await syncProcedures()
        if (synced) {
            fixes.push('Re-synced stored procedures')
            console.log('    Auto-fix successful: Procedures re-synced')
            return true
        } else {
            console.log('    Auto-fix failed: Could not re-sync procedures')
            return false
        }
    }

    return false
}

/**
 * Run a pipeline with error investigation and auto-fix
 */
async function runPipelineWithDiagnosis(
    orgSlug: string,
    apiKey: string,
    dataset: string,
    pipelinePath: string,
    pipelineName: string,
    params: Record<string, string>,
    fixes: string[],
    maxRetries: number = 1
): Promise<PipelineStatus> {
    let attempt = 0
    let lastResult: PipelineResponse | null = null
    let lastDiagnosis: { diagnosis: string; suggestedFix: string; canAutoFix: boolean } | null = null

    while (attempt <= maxRetries) {
        if (attempt > 0) {
            console.log(`    Retry attempt ${attempt}/${maxRetries}...`)
        }

        const result = await runPipeline(orgSlug, apiKey, pipelinePath, params)
        lastResult = result

        // Success case
        if (result.status === 'PENDING' || result.status === 'RUNNING' || result.status === 'SUCCESS' || result.status === 'COMPLETED') {
            console.log(`    Pipeline triggered: ${result.pipeline_logging_id || 'N/A'}`)
            console.log(`    Status: ${result.status}`)
            return {
                status: result.status,
                pipelineLoggingId: result.pipeline_logging_id,
                retried: attempt > 0
            }
        }

        // Failure case - investigate
        console.log(`    Pipeline failed: ${result.message}`)
        console.log(`    Investigating failure...`)

        const diagnosis = await diagnosePipelineFailure(
            result.pipeline_logging_id || '',
            pipelineName,
            apiKey,
            orgSlug,
            dataset
        )
        lastDiagnosis = diagnosis

        console.log(`    Diagnosis: ${diagnosis.diagnosis}`)
        console.log(`    Suggested fix: ${diagnosis.suggestedFix}`)

        // Attempt auto-fix if possible
        if (diagnosis.canAutoFix && attempt < maxRetries) {
            const fixed = await attemptAutoFix(diagnosis, fixes)
            if (fixed) {
                attempt++
                continue // Retry the pipeline
            }
        }

        // No auto-fix available or fix failed
        break
    }

    // Return failure with diagnosis
    return {
        status: lastResult?.status || 'FAILED',
        pipelineLoggingId: lastResult?.pipeline_logging_id,
        diagnosis: lastDiagnosis?.diagnosis,
        suggestedFix: lastDiagnosis?.suggestedFix,
        autoFixAttempted: lastDiagnosis?.canAutoFix,
        autoFixSuccess: false,
        retried: attempt > 0
    }
}

async function runPipeline(
    orgSlug: string,
    apiKey: string,
    path: string,
    params: Record<string, string> = {}
): Promise<PipelineResponse> {
    const url = `${PIPELINE_SERVICE_URL}/api/v1/pipelines/run/${orgSlug}/${path}`

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(params)
        })

        if (!response.ok) {
            const errorText = await response.text()
            let errorDetails = ''

            // Try to parse error details
            try {
                const errorJson = JSON.parse(errorText)
                errorDetails = errorJson.detail || errorJson.message || errorText
            } catch {
                errorDetails = errorText
            }

            return {
                status: 'FAILED',
                message: `HTTP ${response.status}: ${response.statusText}`,
                error_details: errorDetails
            }
        }

        const result = await response.json()
        return {
            status: result.status || 'PENDING',
            pipeline_logging_id: result.pipeline_logging_id,
            message: result.message
        }
    } catch (error) {
        return {
            status: 'ERROR',
            message: String(error),
            error_details: error instanceof Error ? error.stack : undefined
        }
    }
}

async function runSubscriptionPipeline(
    orgSlug: string,
    apiKey: string,
    startDate: string,
    endDate: string
): Promise<PipelineResponse> {
    console.log('\n[Step 6] Running subscription costs pipeline...')

    const result = await runPipeline(
        orgSlug,
        apiKey,
        'subscription/costs/subscription_cost',
        { start_date: startDate, end_date: endDate }
    )

    if (result.status === 'PENDING' || result.status === 'RUNNING') {
        console.log(`    Pipeline triggered: ${result.pipeline_logging_id}`)
        console.log(`    Status: ${result.status}`)
    } else {
        console.error(`    ERROR: ${result.message}`)
    }

    return result
}

async function runGenAIPipeline(
    orgSlug: string,
    apiKey: string
): Promise<PipelineResponse> {
    console.log('\n[Step 7] Running GenAI consolidation pipeline...')

    const result = await runPipeline(
        orgSlug,
        apiKey,
        'genai/unified/consolidate',
        {}
    )

    if (result.status === 'PENDING' || result.status === 'RUNNING') {
        console.log(`    Pipeline triggered: ${result.pipeline_logging_id}`)
        console.log(`    Status: ${result.status}`)
    } else {
        console.error(`    ERROR: ${result.message}`)
    }

    return result
}

async function runCloudFocusPipeline(
    orgSlug: string,
    apiKey: string
): Promise<PipelineResponse> {
    console.log('\n[Step 8] Running cloud FOCUS convert pipeline...')

    // Run unified cloud focus conversion (covers all providers)
    const result = await runPipeline(
        orgSlug,
        apiKey,
        'cloud/unified/cost/focus_convert',
        {}
    )

    if (result.status === 'PENDING' || result.status === 'RUNNING') {
        console.log(`    Pipeline triggered: ${result.pipeline_logging_id}`)
        console.log(`    Status: ${result.status}`)
    } else if (result.message?.includes('not found') || result.message?.includes('404')) {
        // Try individual provider pipelines if unified doesn't exist
        console.log('    Unified pipeline not found, trying individual providers...')
        for (const provider of ['gcp', 'aws', 'azure', 'oci']) {
            const providerResult = await runPipeline(
                orgSlug,
                apiKey,
                `cloud/${provider}/cost/focus_convert`,
                {}
            )
            if (providerResult.status === 'PENDING' || providerResult.status === 'RUNNING') {
                console.log(`    ${provider}: ${providerResult.pipeline_logging_id}`)
            }
        }
        return { status: 'PENDING', message: 'Individual provider pipelines triggered' }
    } else {
        console.error(`    ERROR: ${result.message}`)
    }

    return result
}

async function waitForPipelines(
    orgSlug: string,
    apiKey: string,
    pipelineIds: string[],
    maxWaitMs: number = 120000
): Promise<boolean> {
    console.log('\n[Step 9] Waiting for pipelines to complete...')

    const startTime = Date.now()
    const pendingIds = new Set(pipelineIds.filter(id => id))

    if (pendingIds.size === 0) {
        console.log('    No pipelines to wait for')
        return true
    }

    while (pendingIds.size > 0 && (Date.now() - startTime) < maxWaitMs) {
        for (const pipelineId of pendingIds) {
            try {
                const response = await fetch(
                    `${PIPELINE_SERVICE_URL}/api/v1/pipelines/runs/${pipelineId}`,
                    {
                        headers: { 'X-API-Key': apiKey }
                    }
                )

                if (response.ok) {
                    const result = await response.json()
                    if (result.status === 'COMPLETED' || result.status === 'SUCCESS') {
                        console.log(`    ${pipelineId}: COMPLETED`)
                        pendingIds.delete(pipelineId)
                    } else if (result.status === 'FAILED') {
                        console.error(`    ${pipelineId}: FAILED`)
                        pendingIds.delete(pipelineId)
                    } else {
                        console.log(`    ${pipelineId}: ${result.status}`)
                    }
                }
            } catch (error) {
                // Ignore errors during polling
            }
        }

        if (pendingIds.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 5000))
        }
    }

    if (pendingIds.size > 0) {
        console.log(`    Timeout waiting for: ${Array.from(pendingIds).join(', ')}`)
        return false
    }

    return true
}

function verifyCosts(dataset: string): void {
    console.log('\n[Verification] Checking cost_data_standard_1_3...')

    const query = `
        SELECT
            x_source_system,
            COUNT(*) as records,
            ROUND(SUM(BilledCost), 2) as total_billed_cost,
            MIN(ChargePeriodStart) as first_date,
            MAX(ChargePeriodEnd) as last_date
        FROM \`${GCP_PROJECT_ID}.${dataset}.cost_data_standard_1_3\`
        GROUP BY x_source_system
        ORDER BY x_source_system
    `

    try {
        const result = execSync(`bq query --use_legacy_sql=false --format=prettyjson '${query}'`, {
            encoding: 'utf-8'
        })
        console.log(result)
    } catch (error) {
        console.log('  (No data yet or table does not exist)')
    }
}

async function loadDemoData(config: LoadConfig): Promise<LoadResult> {
    const result: LoadResult = {
        success: false,
        message: '',
        serviceHealth: {
            api: false,
            pipeline: false
        },
        proceduresSynced: false,
        rawDataLoaded: {
            genai: false,
            cloud: false,
            subscriptions: false,
            pricing: false,
            hierarchy: false
        },
        pipelinesExecuted: {
            subscription: { status: 'NOT_RUN' },
            genai: { status: 'NOT_RUN' },
            cloud: { status: 'NOT_RUN' }
        },
        errors: [],
        warnings: [],
        fixes: []
    }

    if (!config.orgSlug) {
        result.message = 'Missing --org-slug parameter'
        result.errors.push(result.message)
        return result
    }

    if (!config.apiKey) {
        result.message = 'Missing --api-key parameter'
        result.errors.push(result.message)
        return result
    }

    const dataset = getDatasetName(config.orgSlug)

    console.log('='.repeat(60))
    console.log('Load Demo Data (Pipeline Service API)')
    console.log('='.repeat(60))
    console.log(`Org Slug: ${config.orgSlug}`)
    console.log(`Dataset: ${dataset}`)
    console.log(`Date Range: ${config.startDate} to ${config.endDate}`)
    console.log(`Mode: ${config.rawOnly ? 'Raw Only' : config.pipelinesOnly ? 'Pipelines Only' : 'Full (Raw + Pipelines)'}`)
    console.log(`Pipeline Service: ${PIPELINE_SERVICE_URL}`)

    try {
        // Step 0: Pre-flight health check
        console.log('\n[Step 0] Pre-flight service health check...')
        const healthCheck = await checkServiceHealth()
        result.serviceHealth = { api: healthCheck.api, pipeline: healthCheck.pipeline }

        if (!healthCheck.api) {
            result.errors.push('API Service is not healthy - some operations may fail')
            console.log('    WARNING: API Service is not healthy')
        } else {
            console.log('    API Service: OK')
        }

        if (!healthCheck.pipeline) {
            result.errors.push('Pipeline Service is not healthy - pipeline operations will fail')
            console.log('    WARNING: Pipeline Service is not healthy')
            if (!config.rawOnly) {
                console.log('    ERROR: Cannot run pipelines without healthy Pipeline Service')
                console.log('    Suggestion: Start Pipeline Service (port 8001) or use --raw-only flag')
                result.message = 'Pipeline Service not available'
                return result
            }
        } else {
            console.log('    Pipeline Service: OK')
        }

        // Step 1: Sync stored procedures (always do this unless raw-only)
        if (!config.rawOnly) {
            result.proceduresSynced = await syncProcedures()
            if (!result.proceduresSynced) {
                result.warnings.push('Failed to sync procedures on first attempt')
            }
        }

        // Steps 2-5: Load raw data (unless skipped)
        if (!config.skipRaw) {
            result.rawDataLoaded.pricing = loadPricingSeed(config.orgSlug, dataset)
            if (!result.rawDataLoaded.pricing) {
                result.warnings.push('Failed to load pricing seed')
            }

            result.rawDataLoaded.hierarchy = loadHierarchy(config.orgSlug, config.apiKey)
            if (!result.rawDataLoaded.hierarchy) {
                result.warnings.push('Failed to load hierarchy (may already exist)')
            }

            result.rawDataLoaded.genai = loadGenAIData(config.orgSlug, dataset)
            if (!result.rawDataLoaded.genai) {
                result.warnings.push('Failed to load GenAI data (files may not exist)')
            }

            result.rawDataLoaded.cloud = loadCloudData(config.orgSlug, dataset)
            if (!result.rawDataLoaded.cloud) {
                result.warnings.push('Failed to load Cloud data (files may not exist)')
            }

            result.rawDataLoaded.subscriptions = loadSubscriptionPlans(config.orgSlug, dataset)
            if (!result.rawDataLoaded.subscriptions) {
                result.errors.push('Failed to load Subscription plans - this is required')
            }
        } else {
            console.log('\n[Skipping raw data loading]')
        }

        // Steps 6-8: Run pipelines via API with diagnosis (unless raw-only)
        if (!config.rawOnly) {
            // Run subscription pipeline with diagnosis
            console.log('\n[Step 6] Running subscription costs pipeline...')
            result.pipelinesExecuted.subscription = await runPipelineWithDiagnosis(
                config.orgSlug,
                config.apiKey,
                dataset,
                'subscription/costs/subscription_cost',
                'subscription',
                { start_date: config.startDate, end_date: config.endDate },
                result.fixes
            )

            if (result.pipelinesExecuted.subscription.status === 'FAILED' || result.pipelinesExecuted.subscription.status === 'ERROR') {
                const diagnosis = result.pipelinesExecuted.subscription.diagnosis || 'Unknown error'
                const suggestedFix = result.pipelinesExecuted.subscription.suggestedFix || 'Check Pipeline Service logs'
                result.errors.push(`Subscription pipeline failed: ${diagnosis}`)
                console.log(`    MANUAL FIX REQUIRED: ${suggestedFix}`)
            }

            // Run GenAI pipeline with diagnosis
            console.log('\n[Step 7] Running GenAI consolidation pipeline...')
            result.pipelinesExecuted.genai = await runPipelineWithDiagnosis(
                config.orgSlug,
                config.apiKey,
                dataset,
                'genai/unified/consolidate',
                'genai',
                {},
                result.fixes
            )

            if (result.pipelinesExecuted.genai.status === 'FAILED' || result.pipelinesExecuted.genai.status === 'ERROR') {
                const diagnosis = result.pipelinesExecuted.genai.diagnosis || 'Unknown error'
                const suggestedFix = result.pipelinesExecuted.genai.suggestedFix || 'Check Pipeline Service logs'
                result.errors.push(`GenAI pipeline failed: ${diagnosis}`)
                console.log(`    MANUAL FIX REQUIRED: ${suggestedFix}`)
            }

            // Run Cloud FOCUS pipeline with diagnosis
            console.log('\n[Step 8] Running cloud FOCUS convert pipeline...')
            result.pipelinesExecuted.cloud = await runPipelineWithDiagnosis(
                config.orgSlug,
                config.apiKey,
                dataset,
                'cloud/unified/cost/focus_convert',
                'cloud',
                {},
                result.fixes
            )

            // If unified pipeline fails, try individual providers
            if (result.pipelinesExecuted.cloud.status === 'FAILED' || result.pipelinesExecuted.cloud.status === 'ERROR') {
                if (result.pipelinesExecuted.cloud.diagnosis?.includes('not found')) {
                    console.log('    Unified pipeline not found, trying individual providers...')
                    for (const provider of ['gcp', 'aws', 'azure', 'oci']) {
                        const providerResult = await runPipeline(
                            config.orgSlug,
                            config.apiKey,
                            `cloud/${provider}/cost/focus_convert`,
                            {}
                        )
                        if (providerResult.status === 'PENDING' || providerResult.status === 'RUNNING') {
                            console.log(`    ${provider}: ${providerResult.pipeline_logging_id}`)
                        }
                    }
                    result.pipelinesExecuted.cloud = { status: 'PENDING', diagnosis: 'Individual provider pipelines triggered' }
                } else {
                    const diagnosis = result.pipelinesExecuted.cloud.diagnosis || 'Unknown error'
                    const suggestedFix = result.pipelinesExecuted.cloud.suggestedFix || 'Check Pipeline Service logs'
                    result.errors.push(`Cloud pipeline failed: ${diagnosis}`)
                    console.log(`    MANUAL FIX REQUIRED: ${suggestedFix}`)
                }
            }

            // Step 9: Wait for pipelines to complete
            const pipelineIds = [
                result.pipelinesExecuted.subscription.pipelineLoggingId,
                result.pipelinesExecuted.genai.pipelineLoggingId,
                result.pipelinesExecuted.cloud.pipelineLoggingId
            ].filter(Boolean) as string[]

            if (pipelineIds.length > 0) {
                await waitForPipelines(config.orgSlug, config.apiKey, pipelineIds)
            }
        } else {
            console.log('\n[Skipping pipeline execution - raw-only mode]')
        }

        // Verify results
        verifyCosts(dataset)

        // Determine success based on critical failures
        const hasCriticalErrors = result.errors.some(e =>
            e.includes('Subscription plans') ||
            e.includes('Pipeline Service not available')
        )

        if (hasCriticalErrors) {
            result.success = false
            result.message = `Demo data loading failed with ${result.errors.length} error(s)`
        } else if (result.errors.length > 0) {
            result.success = true
            result.message = `Demo data loaded with ${result.errors.length} non-critical error(s), ${result.warnings.length} warning(s), ${result.fixes.length} auto-fix(es)`
        } else {
            result.success = true
            result.message = `Demo data loaded successfully for ${config.orgSlug}`
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        result.errors.push(errorMessage)
        result.message = `Failed: ${errorMessage}`
    }

    return result
}

/**
 * Print comprehensive final status report
 */
function printFinalStatus(result: LoadResult, config: LoadConfig): void {
    const dataset = getDatasetName(config.orgSlug)

    console.log('\n' + '='.repeat(70))
    console.log('                    FINAL STATUS REPORT')
    console.log('='.repeat(70))

    // Overall Status
    const statusIcon = result.success ? '✅' : '❌'
    console.log(`\n${statusIcon} Overall Status: ${result.success ? 'SUCCESS' : 'FAILED'}`)
    console.log(`   ${result.message}`)

    // Service Health
    console.log('\n📡 Service Health:')
    console.log(`   API Service (8000):      ${result.serviceHealth.api ? '✅ Healthy' : '❌ Unhealthy'}`)
    console.log(`   Pipeline Service (8001): ${result.serviceHealth.pipeline ? '✅ Healthy' : '❌ Unhealthy'}`)

    // Raw Data Loading
    console.log('\n📦 Raw Data Loading (Stage 1):')
    console.log(`   Pricing Seed:      ${result.rawDataLoaded.pricing ? '✅ Loaded' : '⚠️  Skipped/Failed'}`)
    console.log(`   Hierarchy:         ${result.rawDataLoaded.hierarchy ? '✅ Loaded' : '⚠️  Skipped/Failed'}`)
    console.log(`   GenAI Usage:       ${result.rawDataLoaded.genai ? '✅ Loaded' : '⚠️  Skipped/Failed'}`)
    console.log(`   Cloud Billing:     ${result.rawDataLoaded.cloud ? '✅ Loaded' : '⚠️  Skipped/Failed'}`)
    console.log(`   Subscriptions:     ${result.rawDataLoaded.subscriptions ? '✅ Loaded' : '❌ Failed (Required)'}`)

    // Pipelines
    console.log('\n🔄 Pipeline Execution (Stage 2):')
    console.log(`   Procedures Synced: ${result.proceduresSynced ? '✅ Yes' : '⚠️  No'}`)

    const formatPipelineStatus = (status: PipelineStatus, name: string) => {
        const isSuccess = ['PENDING', 'RUNNING', 'SUCCESS', 'COMPLETED'].includes(status.status)
        const icon = isSuccess ? '✅' : status.status === 'NOT_RUN' ? '⏭️ ' : '❌'
        let line = `   ${name}: ${icon} ${status.status}`
        if (status.pipelineLoggingId) line += ` (${status.pipelineLoggingId})`
        if (status.retried) line += ' [RETRIED]'
        console.log(line)
        if (status.diagnosis && !isSuccess) {
            console.log(`      └─ Diagnosis: ${status.diagnosis}`)
            console.log(`      └─ Fix: ${status.suggestedFix}`)
        }
    }

    formatPipelineStatus(result.pipelinesExecuted.subscription, 'Subscription')
    formatPipelineStatus(result.pipelinesExecuted.genai, 'GenAI      ')
    formatPipelineStatus(result.pipelinesExecuted.cloud, 'Cloud      ')

    // Auto-fixes Applied
    if (result.fixes.length > 0) {
        console.log('\n🔧 Auto-Fixes Applied:')
        result.fixes.forEach(fix => console.log(`   ✅ ${fix}`))
    }

    // Warnings
    if (result.warnings.length > 0) {
        console.log('\n⚠️  Warnings:')
        result.warnings.forEach(w => console.log(`   • ${w}`))
    }

    // Errors
    if (result.errors.length > 0) {
        console.log('\n❌ Errors:')
        result.errors.forEach(e => console.log(`   • ${e}`))
    }

    // Next Steps
    console.log('\n📋 Next Steps:')
    if (result.success) {
        console.log(`   1. Verify costs: curl -s "http://localhost:8000/api/v1/costs/${config.orgSlug}/total" -H "X-API-Key: $ORG_API_KEY" | jq`)
        console.log(`   2. View dashboard: http://localhost:3000/${config.orgSlug}/dashboard`)
        console.log(`   3. Login: john@example.com / acme1234`)
    } else {
        if (!result.serviceHealth.pipeline) {
            console.log('   1. Start Pipeline Service: cd 03-data-pipeline-service && uvicorn src.app.main:app --port 8001 --reload')
        }
        if (!result.rawDataLoaded.subscriptions) {
            console.log('   2. Check subscription plans CSV exists: ls -la 04-inra-cicd-automation/load-demo-data/data/subscriptions/')
        }
        result.errors.forEach((e, i) => {
            if (e.includes('pipeline failed')) {
                console.log(`   ${i + 1}. Fix pipeline issue: Check 03-data-pipeline-service/logs/ for details`)
            }
        })
    }

    // Data Summary
    console.log('\n📊 Data Summary:')
    console.log(`   Dataset: ${GCP_PROJECT_ID}.${dataset}`)
    console.log(`   Date Range: ${config.startDate} to ${config.endDate}`)

    console.log('\n' + '='.repeat(70))
}

// Main execution
async function main() {
    const config = parseArgs()

    if (!config.orgSlug || !config.apiKey) {
        console.log('Usage:')
        console.log('  npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=acme_inc --api-key=YOUR_API_KEY')
        console.log('')
        console.log('Options:')
        console.log('  --org-slug=SLUG     Organization slug (required)')
        console.log('  --api-key=KEY       Organization API key (required)')
        console.log('  --raw-only          Only load raw data, skip pipelines (Stage 1 only)')
        console.log('  --pipelines-only    Only run pipelines, skip raw data (Stage 2 only)')
        console.log('  --skip-raw          Same as --pipelines-only')
        console.log('  --start-date=DATE   Start date (default: 2025-01-01)')
        console.log('  --end-date=DATE     End date (default: 2026-01-02)')
        console.log('')
        console.log('Modes:')
        console.log('  Full (default)      Load raw data + run pipelines')
        console.log('  --raw-only          Stage 1 only: Load pricing, GenAI, Cloud, Subscriptions via bq CLI')
        console.log('  --pipelines-only    Stage 2 only: Sync procedures + run cost calculation pipelines')
        console.log('')
        console.log('Error Handling:')
        console.log('  - Pre-flight health check on API Service (8000) and Pipeline Service (8001)')
        console.log('  - Pipeline failures are diagnosed with suggested fixes')
        console.log('  - Auto-fix attempted for procedure-related errors (re-sync)')
        console.log('  - Pipelines retried after successful auto-fix')
        console.log('  - Comprehensive final status report with next steps')
        console.log('')
        console.log('Environment Variables (from .env.local):')
        console.log('  GCP_PROJECT_ID           GCP project (default: cloudact-testing-1)')
        console.log('  ENVIRONMENT              Environment suffix (default: local)')
        console.log('  PIPELINE_SERVICE_URL     Pipeline service URL (default: http://localhost:8001)')
        console.log('  CA_ROOT_API_KEY          Root API key for syncing procedures')
        console.log('')
        console.log('Get API key:')
        console.log(`  export CA_ROOT_API_KEY=$(grep CA_ROOT_API_KEY .env.local | cut -d'=' -f2)`)
        console.log(`  curl -s "http://localhost:8000/api/v1/admin/dev/api-key/\${ORG_SLUG}" \\`)
        console.log('    -H "X-CA-Root-Key: $CA_ROOT_API_KEY" | jq -r \'.api_key\'')
        process.exit(1)
    }

    const result = await loadDemoData(config)

    // Print comprehensive final status report
    printFinalStatus(result, config)

    // Also output raw JSON for programmatic use
    if (process.env.DEBUG) {
        console.log('\n[DEBUG] Raw Result:')
        console.log(JSON.stringify(result, null, 2))
    }

    process.exit(result.success ? 0 : 1)
}

main().catch(console.error)

export { loadDemoData }
export type { LoadConfig, LoadResult }
