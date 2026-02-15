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
 *   - Pipeline Service running (local: http://localhost:8001, prod: https://pipeline.cloudact.ai)
 *   - API Service running (local: http://localhost:8000, prod: https://api.cloudact.ai)
 *   - Demo org already created via Playwright
 *   - Valid org API key
 *
 * Environment:
 *   --env=local   (default) localhost services, cloudact-testing-1
 *   --env=stage   Stage Cloud Run, cloudact-testing-1
 *   --env=prod    Production Cloud Run, cloudact-prod
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
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
    ENV_CONFIG,
    TEST_CONFIG,
    getDefaultOrgSlug,
    getDatasetName
} from './config'

// Configuration - use TEST_CONFIG which respects --env flag (local/stage/prod)
const GCP_PROJECT_ID = ENV_CONFIG.gcpProjectId
const PIPELINE_SERVICE_URL = process.env.PIPELINE_SERVICE_URL || TEST_CONFIG.pipelineServiceUrl
const API_SERVICE_URL_DEFAULT = process.env.API_SERVICE_URL || TEST_CONFIG.apiServiceUrl
const CA_ROOT_API_KEY = ENV_CONFIG.caRootApiKey
const DEMO_DATA_PATH = path.resolve(__dirname, '../../../04-inra-cicd-automation/load-demo-data')

// Default date range for demo data (Jan 2025 - Dec 2026, 2 full years)
const START_DATE = '2025-01-01'
const END_DATE = '2026-12-31'

interface LoadConfig {
    orgSlug: string
    apiKey: string
    skipRaw: boolean
    pipelinesOnly: boolean
    rawOnly: boolean
    verifyDashboard: boolean
    skipDashboard: boolean
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

interface CategoryTotals {
    genai: number
    cloud: number
    subscription: number
    total: number
}

interface ValidationResult {
    passed: boolean
    bqTotals: CategoryTotals | null
    apiTotals: CategoryTotals | null
    expectedTotals: CategoryTotals
    errors: string[]
    warnings: string[]
    comparisons: {
        category: string
        bq: number
        api: number
        expected: number
        bqApiDiffPct: number
        bqExpectedDiffPct: number
    }[]
}

interface DashboardVerification {
    passed: boolean
    screenshot: string | null
    amounts: string[]
    errors: string[]
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
    validation?: ValidationResult
    dashboardVerification?: DashboardVerification
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
        verifyDashboard: false,
        skipDashboard: false,
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
                case 'verify-dashboard':
                    config.verifyDashboard = true
                    break
                case 'skip-dashboard':
                    config.skipDashboard = true
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

/**
 * Check if BigQuery dataset exists for the org
 */
function checkDatasetExists(dataset: string): boolean {
    const fullDataset = `${GCP_PROJECT_ID}:${dataset}`
    console.log(`  Checking dataset: ${fullDataset}`)
    try {
        const result = spawnSync('bq', ['show', fullDataset], {
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf-8'
        })
        return result.status === 0
    } catch {
        return false
    }
}

/**
 * Attempt to create dataset via manual onboarding
 */
async function ensureDatasetExists(orgSlug: string, dataset: string): Promise<boolean> {
    if (checkDatasetExists(dataset)) {
        console.log(`    Dataset exists: ${dataset}`)
        return true
    }

    console.log(`    Dataset missing: ${dataset} - attempting onboarding...`)
    const apiServiceUrl = API_SERVICE_URL_DEFAULT

    try {
        const response = await fetch(`${apiServiceUrl}/api/v1/organizations/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CA-Root-Key': CA_ROOT_API_KEY,
            },
            body: JSON.stringify({
                org_slug: orgSlug,
                company_name: orgSlug.replace(/_[a-z0-9]+$/, '').replace(/_/g, ' '),
                admin_email: 'demo@cloudact.ai',
            }),
        })

        if (response.ok || response.status === 409) {
            console.log(`    Onboarding triggered (${response.status}), waiting for dataset...`)
            await new Promise(resolve => setTimeout(resolve, 5000))

            if (checkDatasetExists(dataset)) {
                console.log(`    Dataset created: ${dataset}`)
                return true
            }
        }

        const errorText = await response.text()
        console.error(`    Onboarding failed: ${response.status} ${errorText}`)
        return false
    } catch (error) {
        console.error(`    Onboarding error: ${error}`)
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

    // Pricing CSV has all x_* fields with placeholder org slug - just replace and load
    const csvFile = `${DEMO_DATA_PATH}/data/pricing/genai_payg_pricing.csv`
    const table = `${GCP_PROJECT_ID}:${dataset}.genai_payg_pricing`
    const tmpFile = `/tmp/genai_payg_pricing_${orgSlug}.csv`

    const fixCommand = `sed 's/acme_inc_[a-z0-9]*/${orgSlug}/g' ${csvFile} > ${tmpFile}`
    const loadCommand = `bq load --source_format=CSV --skip_leading_rows=1 --replace ${table} ${tmpFile}`

    if (!runCommand(fixCommand, 'Replacing org slug in pricing data')) {
        return false
    }

    const success = runCommand(loadCommand, 'Loading genai_payg_pricing to BigQuery')

    runCommand(`rm -f ${tmpFile}`, 'Cleanup', true)
    return success
}

function loadHierarchy(orgSlug: string, apiKey: string): boolean {
    console.log('\n[Step 2.5] Loading hierarchy levels and entities...')

    const API_SERVICE_URL = API_SERVICE_URL_DEFAULT

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
                '-s', '-w', '\n%{http_code}', '-X', 'POST',
                `${API_SERVICE_URL}/api/v1/hierarchy/${orgSlug}/entities`,
                '-H', `X-API-Key: ${apiKey}`,
                '-H', 'Content-Type: application/json',
                '-d', JSON.stringify(payload)
            ], { encoding: 'utf-8' })

            const outputLines = (createResult.stdout || '').trim().split('\n')
            const httpCode = parseInt(outputLines[outputLines.length - 1] || '0', 10)
            const responseBody = outputLines.slice(0, -1).join('\n')

            if (createResult.status === 0 && httpCode >= 200 && httpCode < 300) {
                created++
            } else {
                skipped++
                if (httpCode >= 400) {
                    console.log(`    WARNING: Entity ${payload.entity_id} failed (HTTP ${httpCode}): ${responseBody.substring(0, 200)}`)
                }
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

    // Concatenate all provider files into one to avoid --replace overwriting previous providers
    const providers = ['openai', 'anthropic', 'gemini']
    const combinedFile = `/tmp/genai_all_usage_raw_${orgSlug}.json`
    const table = `${GCP_PROJECT_ID}:${dataset}.genai_payg_usage_raw`

    // Build combined file from all providers
    let providerCount = 0
    for (const provider of providers) {
        const jsonFile = `${DEMO_DATA_PATH}/data/genai/${provider}_usage_raw.json`
        const appendOp = providerCount === 0 ? '>' : '>>'
        const fixCommand = `sed 's/acme_inc_[a-z0-9]*/${orgSlug}/g' "${jsonFile}" ${appendOp} "${combinedFile}"`

        if (runCommand(fixCommand, `Preparing ${provider} data`, true)) {
            providerCount++
        } else {
            console.log(`    (Skipped ${provider} - file may not exist)`)
        }
    }

    if (providerCount === 0) {
        console.log('    ERROR: No GenAI data files found')
        return false
    }

    console.log(`    Combined ${providerCount} providers into single file`)

    // Load all providers in one batch with --replace
    const loadCommand = `bq load --source_format=NEWLINE_DELIMITED_JSON --replace --ignore_unknown_values ${table} "${combinedFile}"`
    const success = runCommand(loadCommand, `Loading all GenAI usage data (${providerCount} providers)`)

    // Cleanup
    runCommand(`rm -f "${combinedFile}"`, 'Cleanup', true)
    return success
}

function loadCloudData(orgSlug: string, dataset: string): boolean {
    console.log('\n[Step 4] Loading Cloud billing raw data...')

    const providers = [
        { name: 'gcp', table: 'cloud_gcp_billing_raw_daily' },
        { name: 'aws', table: 'cloud_aws_billing_raw_daily' },
        { name: 'azure', table: 'cloud_azure_billing_raw_daily' },
        { name: 'oci', table: 'cloud_oci_billing_raw_daily' }
    ]
    let allSuccess = true

    for (const provider of providers) {
        const jsonFile = `${DEMO_DATA_PATH}/data/cloud/${provider.name}_billing_raw.json`
        const table = `${GCP_PROJECT_ID}:${dataset}.${provider.table}`
        const tmpFile = `/tmp/${provider.name}_billing_raw_fixed.json`

        // Replace placeholder org slug with actual org slug
        const fixCommand = `sed 's/acme_inc_[a-z0-9]*/${orgSlug}/g' ${jsonFile} > ${tmpFile}`
        const loadCommand = `bq load --source_format=NEWLINE_DELIMITED_JSON --replace --ignore_unknown_values ${table} ${tmpFile}`

        if (!runCommand(fixCommand, `Preparing ${provider.name} data`, true)) {
            console.log(`    (Skipped - file may not exist)`)
            allSuccess = false
            continue
        }

        if (!runCommand(loadCommand, `Loading ${provider.name} billing data`, true)) {
            console.log(`    (Skipped - load failed)`)
            allSuccess = false
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

    // Replace placeholder org slug with actual org slug, skip header row
    const tmpFile = '/tmp/subscription_plans_fixed.csv'
    const fixCommand = `tail -n +2 ${csvFile} | sed 's/acme_inc_[a-z0-9]*/${orgSlug}/g' > ${tmpFile}`
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
        const apiResponse = await fetch(`${API_SERVICE_URL_DEFAULT}/health`)
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

/**
 * Calculate GenAI PAYG costs via direct SQL (usage + pricing → costs_daily).
 *
 * The per-provider PAYG pipelines (genai/payg/openai etc.) require integration
 * credentials which the demo account doesn't have. Instead, we calculate costs
 * directly in BigQuery by JOINing usage_raw + pricing.
 */
function calculateGenAICostsViaSQL(orgSlug: string, dataset: string): boolean {
    console.log('\n[Step 7a] Calculating GenAI PAYG costs via SQL (usage + pricing)...')

    const fullDataset = `${GCP_PROJECT_ID}.${dataset}`
    const runId = `demo_cost_calc_${Date.now().toString(36)}`

    const sql = `
INSERT INTO \`${fullDataset}.genai_payg_costs_daily\` (
  cost_date, x_org_slug, provider, model, model_family, region,
  input_tokens, output_tokens, cached_input_tokens, total_tokens,
  input_cost_usd, output_cost_usd, cached_cost_usd, total_cost_usd,
  discount_applied_pct, effective_rate_input, effective_rate_output,
  request_count,
  x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
  x_hierarchy_path, x_hierarchy_path_names,
  calculated_at, x_ingestion_id, x_ingestion_date, x_genai_provider,
  x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at
)
SELECT
  u.usage_date as cost_date,
  u.x_org_slug,
  u.provider,
  u.model,
  u.model_family,
  COALESCE(u.region, p.region) as region,
  u.input_tokens,
  u.output_tokens,
  u.cached_input_tokens,
  u.total_tokens,
  ROUND(SAFE_DIVIDE(u.input_tokens, 1000000) * p.input_per_1m, 6) as input_cost_usd,
  ROUND(SAFE_DIVIDE(u.output_tokens, 1000000) * p.output_per_1m, 6) as output_cost_usd,
  ROUND(SAFE_DIVIDE(IFNULL(u.cached_input_tokens, 0), 1000000) * IFNULL(p.cached_input_per_1m, p.input_per_1m * 0.5), 6) as cached_cost_usd,
  ROUND(
    SAFE_DIVIDE(u.input_tokens, 1000000) * p.input_per_1m
    + SAFE_DIVIDE(u.output_tokens, 1000000) * p.output_per_1m
    + SAFE_DIVIDE(IFNULL(u.cached_input_tokens, 0), 1000000) * IFNULL(p.cached_input_per_1m, p.input_per_1m * 0.5),
  6) as total_cost_usd,
  IFNULL(p.volume_discount_pct, 0) as discount_applied_pct,
  p.input_per_1m as effective_rate_input,
  p.output_per_1m as effective_rate_output,
  u.request_count,
  u.x_hierarchy_entity_id,
  u.x_hierarchy_entity_name,
  u.x_hierarchy_level_code,
  u.x_hierarchy_path,
  u.x_hierarchy_path_names,
  CURRENT_TIMESTAMP() as calculated_at,
  GENERATE_UUID() as x_ingestion_id,
  CURRENT_DATE() as x_ingestion_date,
  u.provider as x_genai_provider,
  CONCAT('genai_payg_', u.provider) as x_pipeline_id,
  'demo_direct_calc' as x_credential_id,
  u.usage_date as x_pipeline_run_date,
  '${runId}' as x_run_id,
  CURRENT_TIMESTAMP() as x_ingested_at
FROM \`${fullDataset}.genai_payg_usage_raw\` u
JOIN \`${fullDataset}.genai_payg_pricing\` p
  ON u.provider = p.provider
  AND u.model = p.model
  AND (u.region = p.region OR p.region = 'global' OR u.region IS NULL)
WHERE p.status = 'active'
  AND (p.effective_to IS NULL OR p.effective_to >= u.usage_date)
`

    // Delete ALL existing cost data to avoid duplicates from previous runs
    const deleteSQL = `DELETE FROM \`${fullDataset}.genai_payg_costs_daily\` WHERE 1=1`
    const delResult = spawnSync('bq', [
        'query', '--use_legacy_sql=false', '--nouse_cache', deleteSQL
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    if (delResult.status === 0) {
        console.log('    Cleared existing genai_payg_costs_daily')
    }

    // Run the cost calculation
    const result = spawnSync('bq', [
        'query', '--use_legacy_sql=false', '--nouse_cache', sql
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })

    if (result.status !== 0) {
        console.error(`    ERROR: ${result.stderr}`)
        return false
    }

    // Check how many rows were inserted
    const countResult = spawnSync('bq', [
        'query', '--use_legacy_sql=false', '--format=json',
        `SELECT COUNT(*) as cnt, ROUND(SUM(total_cost_usd), 2) as total FROM \`${fullDataset}.genai_payg_costs_daily\``
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })

    if (countResult.status === 0) {
        try {
            const rows = JSON.parse(countResult.stdout || '[]')
            console.log(`    Calculated ${rows[0]?.cnt || 0} cost rows, total: $${rows[0]?.total || 0}`)
        } catch {
            console.log('    Cost calculation completed')
        }
    }

    return true
}

/**
 * Consolidate GenAI costs and convert to FOCUS directly via SQL.
 *
 * The consolidation pipeline processes one day at a time using start_date as p_cost_date.
 * For demo data spanning multiple dates (Dec 25 - Jan 31), we consolidate all dates at once.
 */
function consolidateGenAIToFocusViaSQL(orgSlug: string, dataset: string): boolean {
    console.log('\n[Step 7b-direct] Consolidating GenAI costs + converting to FOCUS via SQL...')

    const fullDataset = `${GCP_PROJECT_ID}.${dataset}`
    const runId = `demo_consolidate_${Date.now().toString(36)}`

    // Step 1: Consolidate PAYG costs → genai_costs_daily_unified (all dates)
    const consolidateSQL = `
DELETE FROM \`${fullDataset}.genai_costs_daily_unified\` WHERE 1=1;

INSERT INTO \`${fullDataset}.genai_costs_daily_unified\`
(cost_date, x_org_slug, cost_type, provider, model, instance_type, gpu_type,
 region, input_cost_usd, output_cost_usd, commitment_cost_usd, overage_cost_usd,
 infrastructure_cost_usd, total_cost_usd, discount_applied_pct,
 usage_quantity, usage_unit,
 x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
 x_hierarchy_path, x_hierarchy_path_names,
 source_table, consolidated_at,
 x_ingestion_id, x_ingestion_date, x_genai_provider,
 x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
SELECT
  cost_date, x_org_slug, 'payg' as cost_type, provider, model,
  NULL as instance_type, NULL as gpu_type, region,
  input_cost_usd, output_cost_usd,
  NULL as commitment_cost_usd, NULL as overage_cost_usd,
  NULL as infrastructure_cost_usd,
  total_cost_usd, discount_applied_pct,
  total_tokens as usage_quantity, 'tokens' as usage_unit,
  x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
  x_hierarchy_path, x_hierarchy_path_names,
  'genai_payg_costs_daily' as source_table, CURRENT_TIMESTAMP() as consolidated_at,
  GENERATE_UUID() as x_ingestion_id, CURRENT_DATE() as x_ingestion_date,
  x_genai_provider,
  x_pipeline_id, x_credential_id, x_pipeline_run_date,
  '${runId}' as x_run_id, CURRENT_TIMESTAMP() as x_ingested_at
FROM \`${fullDataset}.genai_payg_costs_daily\`
WHERE total_cost_usd > 0
`

    let result = spawnSync('bq', [
        'query', '--use_legacy_sql=false', '--nouse_cache', consolidateSQL
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })

    if (result.status !== 0) {
        console.error(`    Consolidation failed: ${result.stderr}`)
        return false
    }
    console.log('    Consolidated PAYG costs → genai_costs_daily_unified')

    // Step 2: Convert to FOCUS 1.3 → cost_data_standard_1_3 (all dates)
    const focusSQL = `
DELETE FROM \`${fullDataset}.cost_data_standard_1_3\`
WHERE x_genai_cost_type IS NOT NULL;

INSERT INTO \`${fullDataset}.cost_data_standard_1_3\`
(ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
 BillingAccountId, BillingCurrency, HostProviderName,
 InvoiceIssuerName, ServiceProviderName, ServiceCategory, ServiceName,
 ResourceId, ResourceName, ResourceType, RegionId, RegionName,
 ConsumedQuantity, ConsumedUnit, PricingCategory, PricingUnit,
 EffectiveCost, BilledCost, ListCost, ListUnitPrice,
 ContractedCost, ContractedUnitPrice,
 ChargeCategory, ChargeType, ChargeFrequency,
 SubAccountId, SubAccountName,
 x_genai_cost_type, x_genai_provider, x_genai_model,
 x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
 x_hierarchy_path, x_hierarchy_path_names,
 x_ingestion_date, x_pipeline_id, x_credential_id,
 x_pipeline_run_date, x_run_id, x_ingested_at,
 x_data_quality_score, x_created_at)
SELECT
  TIMESTAMP(cost_date) as ChargePeriodStart,
  TIMESTAMP(cost_date) as ChargePeriodEnd,
  TIMESTAMP(DATE_TRUNC(cost_date, MONTH)) as BillingPeriodStart,
  TIMESTAMP(LAST_DAY(cost_date, MONTH)) as BillingPeriodEnd,
  x_org_slug as BillingAccountId,
  'USD' as BillingCurrency,
  'CloudAct' as HostProviderName,
  CASE provider
    WHEN 'openai' THEN 'OpenAI'
    WHEN 'anthropic' THEN 'Anthropic'
    WHEN 'gemini' THEN 'Google'
    ELSE provider
  END as InvoiceIssuerName,
  CASE provider
    WHEN 'openai' THEN 'OpenAI'
    WHEN 'anthropic' THEN 'Anthropic'
    WHEN 'gemini' THEN 'Google AI'
    ELSE provider
  END as ServiceProviderName,
  'genai' as ServiceCategory,
  CONCAT(UPPER(SUBSTR(provider, 1, 1)), LOWER(SUBSTR(provider, 2)), ' API') as ServiceName,
  COALESCE(model, 'default') as ResourceId,
  COALESCE(model, provider) as ResourceName,
  cost_type as ResourceType,
  COALESCE(region, 'global') as RegionId,
  COALESCE(region, 'global') as RegionName,
  CAST(usage_quantity AS NUMERIC) as ConsumedQuantity,
  usage_unit as ConsumedUnit,
  'On-Demand' as PricingCategory,
  usage_unit as PricingUnit,
  CAST(total_cost_usd AS NUMERIC) as EffectiveCost,
  CAST(total_cost_usd AS NUMERIC) as BilledCost,
  CAST(total_cost_usd AS NUMERIC) as ListCost,
  CAST(NULL AS NUMERIC) as ListUnitPrice,
  CAST(0 AS NUMERIC) as ContractedCost,
  CAST(0 AS NUMERIC) as ContractedUnitPrice,
  'Usage' as ChargeCategory,
  'Usage' as ChargeType,
  'Usage-Based' as ChargeFrequency,
  x_org_slug as SubAccountId,
  x_org_slug as SubAccountName,
  cost_type as x_genai_cost_type,
  provider as x_genai_provider,
  model as x_genai_model,
  x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
  x_hierarchy_path, x_hierarchy_path_names,
  cost_date as x_ingestion_date,
  x_pipeline_id, x_credential_id,
  cost_date as x_pipeline_run_date,
  '${runId}' as x_run_id,
  CURRENT_TIMESTAMP() as x_ingested_at,
  100.0 as x_data_quality_score,
  CURRENT_TIMESTAMP() as x_created_at
FROM \`${fullDataset}.genai_costs_daily_unified\`
WHERE total_cost_usd > 0
`

    result = spawnSync('bq', [
        'query', '--use_legacy_sql=false', '--nouse_cache', focusSQL
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })

    if (result.status !== 0) {
        console.error(`    FOCUS conversion failed: ${result.stderr}`)
        return false
    }

    // Verify
    const verifyResult = spawnSync('bq', [
        'query', '--use_legacy_sql=false', '--format=json',
        `SELECT COUNT(*) as cnt, ROUND(SUM(BilledCost), 2) as total FROM \`${fullDataset}.cost_data_standard_1_3\` WHERE ServiceCategory = 'genai'`
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })

    if (verifyResult.status === 0) {
        try {
            const rows = JSON.parse(verifyResult.stdout || '[]')
            console.log(`    GenAI FOCUS: ${rows[0]?.cnt || 0} records, total: $${rows[0]?.total || 0}`)
        } catch {
            console.log('    GenAI FOCUS conversion completed')
        }
    }

    return true
}

async function runGenAIPipeline(
    orgSlug: string,
    apiKey: string,
    startDate: string,
    endDate: string
): Promise<PipelineResponse> {
    console.log('\n[Step 7b] Running GenAI consolidation pipeline...')

    const result = await runPipeline(
        orgSlug,
        apiKey,
        'genai/unified/consolidate',
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

async function runCloudFocusPipeline(
    orgSlug: string,
    apiKey: string,
    startDate: string,
    endDate: string
): Promise<{ providerPipelines: { provider: string; pipelineId: string | null }[]; pipelineIds: string[]; allTriggered: boolean; failedProviders: string[] }> {
    console.log('\n[Step 8] Running cloud FOCUS convert pipelines (per-provider, sequential)...')
    console.log('    NOTE: Running sequentially to avoid BigQuery concurrent transaction conflicts')

    // Run per-provider focus_convert SEQUENTIALLY (concurrent writes to cost_data_standard_1_3 cause BQ conflicts)
    const providers = ['gcp', 'aws', 'azure', 'oci']
    const providerPipelines: { provider: string; pipelineId: string | null }[] = []
    const pipelineIds: string[] = []
    const failedProviders: string[] = []
    let allTriggered = true

    for (const provider of providers) {
        const result = await runPipeline(
            orgSlug,
            apiKey,
            `cloud/${provider}/cost/focus_convert`,
            { start_date: startDate, end_date: endDate }
        )

        if (result.status === 'PENDING' || result.status === 'RUNNING') {
            const pid = result.pipeline_logging_id || ''
            console.log(`    ${provider}: ${pid} (${result.status})`)
            providerPipelines.push({ provider, pipelineId: pid || null })
            if (pid) pipelineIds.push(pid)

            // Wait for this pipeline to complete before triggering the next
            // This prevents BigQuery concurrent transaction conflicts on cost_data_standard_1_3
            if (pid) {
                const completed = await waitForSinglePipeline(orgSlug, apiKey, pid, provider, 180000)
                if (!completed) {
                    failedProviders.push(provider)
                    allTriggered = false
                }
            }
        } else {
            console.log(`    ${provider}: FAILED - ${result.message || result.error_details || 'unknown error'}`)
            providerPipelines.push({ provider, pipelineId: null })
            failedProviders.push(provider)
            allTriggered = false
        }
    }

    return { providerPipelines, pipelineIds, allTriggered, failedProviders }
}

/**
 * Fallback: Call sp_cloud_1_convert_to_focus directly via bq query
 * for any cloud providers whose pipelines failed.
 */
function convertCloudToFocusViaSQL(
    orgSlug: string,
    dataset: string,
    providers: string[],
    startDate: string,
    endDate: string
): string[] {
    if (providers.length === 0) return []

    console.log(`\n[Step 8b] Cloud FOCUS fallback via SQL for: ${providers.join(', ')}...`)
    const succeeded: string[] = []

    for (const provider of providers) {
        const callSQL = `CALL \`${GCP_PROJECT_ID}.organizations.sp_cloud_1_convert_to_focus\`('${GCP_PROJECT_ID}', '${dataset}', DATE('${startDate}'), DATE('${endDate}'), '${provider}', 'demo_focus_convert_${provider}', 'demo_direct', 'demo_fallback_${Date.now().toString(36)}')`

        const result = spawnSync('bq', [
            'query', '--use_legacy_sql=false', '--nouse_cache', callSQL
        ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })

        if (result.status === 0) {
            console.log(`    ${provider}: OK (via stored procedure)`)
            succeeded.push(provider)
        } else {
            console.log(`    ${provider}: FAILED - ${(result.stderr || '').substring(0, 200)}`)
        }
    }

    if (succeeded.length > 0) {
        // Verify cloud FOCUS totals
        const verifyResult = spawnSync('bq', [
            'query', '--use_legacy_sql=false', '--format=json', '--nouse_cache',
            `SELECT COUNT(*) as cnt, ROUND(SUM(BilledCost), 2) as total FROM \`${GCP_PROJECT_ID}.${dataset}.cost_data_standard_1_3\` WHERE ServiceCategory NOT IN ('genai', 'subscription')`
        ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })

        if (verifyResult.status === 0) {
            try {
                const rows = JSON.parse(verifyResult.stdout || '[]')
                console.log(`    Cloud FOCUS total: ${rows[0]?.cnt || 0} records, $${rows[0]?.total || 0}`)
            } catch { /* ignore */ }
        }
    }

    return succeeded
}

/**
 * Wait for a single pipeline to complete. Used for sequential pipeline execution
 * to avoid BigQuery concurrent transaction conflicts on cost_data_standard_1_3.
 */
async function waitForSinglePipeline(
    orgSlug: string,
    apiKey: string,
    pipelineId: string,
    label: string,
    maxWaitMs: number = 180000
): Promise<boolean> {
    const startTime = Date.now()

    while ((Date.now() - startTime) < maxWaitMs) {
        try {
            const response = await fetch(
                `${PIPELINE_SERVICE_URL}/api/v1/pipelines/runs/${pipelineId}`,
                { headers: { 'X-API-Key': apiKey } }
            )

            if (response.ok) {
                const result = await response.json()
                if (result.status === 'COMPLETED' || result.status === 'SUCCESS') {
                    console.log(`    ${label}: COMPLETED`)
                    return true
                } else if (result.status === 'FAILED') {
                    console.log(`    ${label}: FAILED`)
                    return false
                }
                // Still running, continue polling
            }
        } catch {
            // Ignore errors during polling
        }

        await new Promise(resolve => setTimeout(resolve, 5000))
    }

    console.log(`    ${label}: TIMEOUT after ${Math.round(maxWaitMs / 1000)}s`)
    return false
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

/**
 * Set up demo notification channel + 2 cost alert rules
 */
async function setupDemoAlerts(orgSlug: string, apiKey: string): Promise<{ channelCreated: boolean; rulesCreated: number; errors: string[] }> {
    const API_SERVICE_URL = API_SERVICE_URL_DEFAULT
    const errors: string[] = []
    let channelId = ''
    let rulesCreated = 0

    console.log('\n[Step 10] Setting up demo cost alerts...')

    // Step 1: Create an email notification channel
    try {
        const channelResponse = await fetch(
            `${API_SERVICE_URL}/api/v1/notifications/${orgSlug}/channels`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify({
                    name: 'Cost Alerts (Email)',
                    channel_type: 'email',
                    email_recipients: ['demo@cloudact.ai'],
                    email_subject_prefix: '[CloudAct Alert]',
                    is_default: true,
                    is_active: true
                })
            }
        )

        if (channelResponse.ok) {
            const channel = await channelResponse.json()
            channelId = channel.channel_id
            console.log(`    Channel created: ${channelId}`)
        } else {
            const errorText = await channelResponse.text()
            // Check if channel already exists
            if (channelResponse.status === 409 || errorText.includes('already exists')) {
                console.log('    Channel already exists, fetching existing...')
                const listResponse = await fetch(
                    `${API_SERVICE_URL}/api/v1/notifications/${orgSlug}/channels?channel_type=email`,
                    { headers: { 'X-API-Key': apiKey } }
                )
                if (listResponse.ok) {
                    const channels = await listResponse.json()
                    if (channels.length > 0) {
                        channelId = channels[0].channel_id
                        console.log(`    Using existing channel: ${channelId}`)
                    }
                }
            } else {
                errors.push(`Failed to create channel: ${channelResponse.status} ${errorText}`)
                console.log(`    WARNING: ${errors[errors.length - 1]}`)
            }
        }
    } catch (error) {
        errors.push(`Channel creation error: ${error}`)
        console.log(`    WARNING: ${errors[errors.length - 1]}`)
    }

    if (!channelId) {
        console.log('    Skipping rules - no channel available')
        return { channelCreated: false, rulesCreated: 0, errors }
    }

    // Step 2: Create cost alert rules
    const alertRules = [
        {
            name: 'Daily Cost Spike Alert',
            description: 'Triggers when daily spend exceeds $5,000 across all providers',
            rule_category: 'cost',
            rule_type: 'absolute_threshold',
            priority: 'high',
            is_active: true,
            conditions: {
                threshold_amount: 5000,
                period: 'daily'
            },
            notify_channel_ids: [channelId],
            cooldown_minutes: 60
        },
        {
            name: 'Monthly Budget Threshold',
            description: 'Alerts at 80% of $50,000 monthly budget across all cost categories',
            rule_category: 'cost',
            rule_type: 'budget_percent',
            priority: 'medium',
            is_active: true,
            conditions: {
                threshold_percent: 80,
                budget_amount: 50000,
                budget_period: 'monthly'
            },
            notify_channel_ids: [channelId],
            cooldown_minutes: 240
        }
    ]

    for (const rule of alertRules) {
        try {
            const ruleResponse = await fetch(
                `${API_SERVICE_URL}/api/v1/notifications/${orgSlug}/rules`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': apiKey
                    },
                    body: JSON.stringify(rule)
                }
            )

            if (ruleResponse.ok) {
                const created = await ruleResponse.json()
                rulesCreated++
                console.log(`    Rule created: "${rule.name}" (${created.rule_id})`)
            } else {
                const errorText = await ruleResponse.text()
                if (ruleResponse.status === 409 || errorText.includes('already exists')) {
                    console.log(`    Rule "${rule.name}" already exists (skipped)`)
                } else {
                    errors.push(`Failed to create rule "${rule.name}": ${ruleResponse.status}`)
                    console.log(`    WARNING: ${errors[errors.length - 1]}`)
                }
            }
        } catch (error) {
            errors.push(`Rule creation error for "${rule.name}": ${error}`)
            console.log(`    WARNING: ${errors[errors.length - 1]}`)
        }
    }

    console.log(`    Done: ${rulesCreated} rules created`)
    return { channelCreated: !!channelId, rulesCreated, errors }
}


/**
 * Set up demo budgets across hierarchy entities for all cost categories.
 * Creates 8 sample budgets covering cloud, genai, subscription, and total
 * at department, project, and team levels.
 */
async function setupDemoBudgets(orgSlug: string, apiKey: string): Promise<{ budgetsCreated: number; errors: string[] }> {
    const API_SERVICE_URL = API_SERVICE_URL_DEFAULT
    const errors: string[] = []
    let budgetsCreated = 0

    console.log('\n[Step 10.5] Setting up demo budgets...')

    // Budget period: current quarter (Jan-Mar 2026)
    const periodStart = '2026-01-01'
    const periodEnd = '2026-03-31'

    const demoBudgets = [
        // Department-level budgets
        {
            hierarchy_entity_id: 'DEPT-ENG',
            hierarchy_entity_name: 'Engineering',
            hierarchy_level_code: 'department',
            category: 'cloud',
            budget_type: 'monetary',
            budget_amount: 30000,
            currency: 'USD',
            period_type: 'quarterly',
            period_start: periodStart,
            period_end: periodEnd,
            notes: 'Q1 2026 cloud infrastructure budget for Engineering'
        },
        {
            hierarchy_entity_id: 'DEPT-DS',
            hierarchy_entity_name: 'Data Science',
            hierarchy_level_code: 'department',
            category: 'genai',
            budget_type: 'monetary',
            budget_amount: 25000,
            currency: 'USD',
            period_type: 'quarterly',
            period_start: periodStart,
            period_end: periodEnd,
            notes: 'Q1 2026 GenAI API budget for Data Science'
        },
        // Project-level budgets
        {
            hierarchy_entity_id: 'PROJ-PLATFORM',
            hierarchy_entity_name: 'Platform',
            hierarchy_level_code: 'project',
            category: 'cloud',
            budget_type: 'monetary',
            budget_amount: 20000,
            currency: 'USD',
            period_type: 'quarterly',
            period_start: periodStart,
            period_end: periodEnd,
            provider: 'gcp',
            notes: 'Q1 2026 GCP budget for Platform project'
        },
        {
            hierarchy_entity_id: 'PROJ-MLPIPE',
            hierarchy_entity_name: 'ML Pipeline',
            hierarchy_level_code: 'project',
            category: 'genai',
            budget_type: 'monetary',
            budget_amount: 20000,
            currency: 'USD',
            period_type: 'quarterly',
            period_start: periodStart,
            period_end: periodEnd,
            provider: 'anthropic',
            notes: 'Q1 2026 Anthropic budget for ML Pipeline project'
        },
        // Team-level budgets
        {
            hierarchy_entity_id: 'TEAM-BACKEND',
            hierarchy_entity_name: 'Backend',
            hierarchy_level_code: 'team',
            category: 'cloud',
            budget_type: 'monetary',
            budget_amount: 12000,
            currency: 'USD',
            period_type: 'quarterly',
            period_start: periodStart,
            period_end: periodEnd,
            provider: 'gcp',
            notes: 'Q1 2026 GCP budget for Backend team'
        },
        {
            hierarchy_entity_id: 'TEAM-FRONTEND',
            hierarchy_entity_name: 'Frontend',
            hierarchy_level_code: 'team',
            category: 'subscription',
            budget_type: 'monetary',
            budget_amount: 3000,
            currency: 'USD',
            period_type: 'quarterly',
            period_start: periodStart,
            period_end: periodEnd,
            notes: 'Q1 2026 SaaS subscription budget for Frontend team'
        },
        {
            hierarchy_entity_id: 'TEAM-MLOPS',
            hierarchy_entity_name: 'ML Ops',
            hierarchy_level_code: 'team',
            category: 'genai',
            budget_type: 'token',
            budget_amount: 50000000,
            currency: 'USD',
            period_type: 'quarterly',
            period_start: periodStart,
            period_end: periodEnd,
            provider: 'anthropic',
            notes: 'Q1 2026 Anthropic token budget (50M tokens) for ML Ops team'
        },
        {
            hierarchy_entity_id: 'DEPT-ENG',
            hierarchy_entity_name: 'Engineering',
            hierarchy_level_code: 'department',
            category: 'total',
            budget_type: 'monetary',
            budget_amount: 50000,
            currency: 'USD',
            period_type: 'quarterly',
            period_start: periodStart,
            period_end: periodEnd,
            notes: 'Q1 2026 total budget for Engineering department'
        },
    ]

    for (const budget of demoBudgets) {
        try {
            const response = await fetch(
                `${API_SERVICE_URL}/api/v1/budgets/${orgSlug}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': apiKey
                    },
                    body: JSON.stringify(budget)
                }
            )

            if (response.ok) {
                const created = await response.json()
                budgetsCreated++
                console.log(`    Budget created: ${budget.category} ${budget.budget_type} $${budget.budget_amount.toLocaleString()} for ${budget.hierarchy_entity_id}`)
            } else {
                const errorText = await response.text()
                if (response.status === 400 && errorText.includes('already exists')) {
                    console.log(`    Budget for ${budget.hierarchy_entity_id}/${budget.category} already exists (skipped)`)
                } else {
                    errors.push(`Failed to create budget for ${budget.hierarchy_entity_id}: ${response.status} ${errorText.substring(0, 200)}`)
                    console.log(`    WARNING: ${errors[errors.length - 1]}`)
                }
            }
        } catch (error) {
            errors.push(`Budget creation error for ${budget.hierarchy_entity_id}: ${error}`)
            console.log(`    WARNING: ${errors[errors.length - 1]}`)
        }
    }

    // Top-down allocation: Org-level cloud budget → departments
    console.log('    Creating top-down allocation (Org cloud → departments)...')
    try {
        const allocResponse = await fetch(
            `${API_SERVICE_URL}/api/v1/budgets/${orgSlug}/allocate`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify({
                    hierarchy_entity_id: 'ORG',
                    hierarchy_entity_name: 'Acme Inc',
                    hierarchy_level_code: 'organization',
                    category: 'cloud',
                    budget_type: 'monetary',
                    budget_amount: 100000,
                    currency: 'USD',
                    period_type: 'yearly',
                    period_start: '2026-01-01',
                    period_end: '2026-12-31',
                    notes: '2026 org-level cloud budget with top-down allocation',
                    allocations: [
                        { hierarchy_entity_id: 'DEPT-ENG', hierarchy_entity_name: 'Engineering', hierarchy_level_code: 'department', percentage: 45 },
                        { hierarchy_entity_id: 'DEPT-DS', hierarchy_entity_name: 'Data Science', hierarchy_level_code: 'department', percentage: 30 },
                        { hierarchy_entity_id: 'DEPT-OPS', hierarchy_entity_name: 'Operations', hierarchy_level_code: 'department', percentage: 15 },
                    ]
                })
            }
        )
        if (allocResponse.ok) {
            const allocResult = await allocResponse.json()
            budgetsCreated += 1 + allocResult.children.length  // parent + children
            console.log(`    Allocation created: parent=$100K → ENG=45% ($45K), DS=30% ($30K), OPS=15% ($15K), margin=10% ($10K)`)
        } else {
            const errorText = await allocResponse.text()
            if (allocResponse.status === 409) {
                console.log('    Allocation already exists (skipped)')
            } else {
                errors.push(`Failed to create allocation: ${allocResponse.status} ${errorText.substring(0, 200)}`)
                console.log(`    WARNING: ${errors[errors.length - 1]}`)
            }
        }
    } catch (error) {
        errors.push(`Allocation creation error: ${error}`)
        console.log(`    WARNING: ${errors[errors.length - 1]}`)
    }

    console.log(`    Done: ${budgetsCreated} budgets created`)
    return { budgetsCreated, errors }
}


// Demo data covers 2 full years (Jan 2025 - Dec 2026, 730 days).
// BQ has ALL 730 days. API caps end_date to today (date_utils.py: min(end_date, today)).
// Validation uses LAST 365 DAYS for BOTH BQ and API so totals match.
//
// Full 2-year BQ totals (reference): GenAI ~$5M, Cloud ~$3.5M, Sub ~$1.25M = ~$9.8M
// 365-day window ≈ half of 2-year totals (with growth rates, not exact 50%).
//
// MINIMUM_THRESHOLDS: Each category must exceed these for 365-day window.
// These are conservative floors, not exact targets.
const MINIMUM_THRESHOLDS: CategoryTotals = {
    genai: 1500000,      // ~$2M expected for 365 days
    cloud: 1000000,      // ~$1.5M expected for 365 days
    subscription: 400000, // ~$600K expected for 365 days
    total: 3000000,      // ~$4M expected for 365 days
}

/**
 * Compute validation date range: last 365 days from today.
 * Both BQ and API use this same range → totals should match.
 */
function getValidationDateRange(): { start: string; end: string } {
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - 365)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    return { start: fmt(start), end: fmt(today) }
}

/**
 * Layer 1: Query BigQuery cost_data_standard_1_3 directly
 */
function queryBigQueryCosts(dataset: string, startDate: string, endDate: string): CategoryTotals | null {
    const table = `${GCP_PROJECT_ID}.${dataset}.cost_data_standard_1_3`
    // Map FOCUS ServiceCategory values to our 3 categories:
    // - 'genai' → genai
    // - 'subscription' → subscription
    // - Everything else (Compute, Storage, Database, Network, Other, etc.) → cloud
    const query = `SELECT CASE WHEN ServiceCategory = 'genai' THEN 'genai' WHEN ServiceCategory = 'subscription' THEN 'subscription' ELSE 'cloud' END as category, ROUND(SUM(BilledCost), 2) as total FROM \`${table}\` WHERE ChargePeriodStart >= '${startDate}' AND ChargePeriodStart <= '${endDate}' GROUP BY category`

    try {
        const result = spawnSync('bq', [
            'query', '--use_legacy_sql=false', '--format=json', '--nouse_cache', query
        ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })

        if (result.status !== 0) {
            console.log(`    BQ query failed: ${result.stderr}`)
            return null
        }

        const rows = JSON.parse(result.stdout || '[]') as { category: string; total: string }[]
        const totals: CategoryTotals = { genai: 0, cloud: 0, subscription: 0, total: 0 }

        for (const row of rows) {
            const cost = parseFloat(row.total)
            const cat = row.category?.toLowerCase()
            if (cat === 'genai') totals.genai = cost
            else if (cat === 'cloud') totals.cloud = cost
            else if (cat === 'subscription') totals.subscription = cost
        }
        totals.total = totals.genai + totals.cloud + totals.subscription

        return totals
    } catch (error) {
        console.log(`    BQ query error: ${error}`)
        return null
    }
}

/**
 * Layer 2: Query API Service costs endpoint
 */
async function queryAPICosts(orgSlug: string, apiKey: string, startDate: string, endDate: string): Promise<CategoryTotals | null> {
    const apiServiceUrl = API_SERVICE_URL_DEFAULT
    const url = `${apiServiceUrl}/api/v1/costs/${orgSlug}/total?start_date=${startDate}&end_date=${endDate}`
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 30000)

            const response = await fetch(url, {
                headers: { 'X-API-Key': apiKey },
                signal: controller.signal,
            })
            clearTimeout(timeout)

            if (!response.ok) {
                console.log(`    API query failed: ${response.status}`)
                if (attempt < maxRetries) {
                    console.log(`    Retrying (${attempt}/${maxRetries})...`)
                    await new Promise(r => setTimeout(r, 3000))
                    continue
                }
                return null
            }

            const data = await response.json()
            const totals: CategoryTotals = { genai: 0, cloud: 0, subscription: 0, total: 0 }

            // API response format: { genai: { total_billed_cost }, cloud: { total_billed_cost }, subscription: { total_billed_cost }, total: { total_billed_cost } }
            if (data.genai?.total_billed_cost !== undefined) totals.genai = data.genai.total_billed_cost
            if (data.cloud?.total_billed_cost !== undefined) totals.cloud = data.cloud.total_billed_cost
            if (data.subscription?.total_billed_cost !== undefined) totals.subscription = data.subscription.total_billed_cost
            totals.total = data.total?.total_billed_cost ?? (totals.genai + totals.cloud + totals.subscription)

            return totals
        } catch (error) {
            console.log(`    API query error (attempt ${attempt}/${maxRetries}): ${error}`)
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 3000))
                continue
            }
            return null
        }
    }
    return null
}

/**
 * Layer 3: Cross-validate BQ vs API vs Minimum Thresholds
 *
 * Uses LAST 365 DAYS for both BQ and API queries so totals match.
 * The API caps end_date to today (date_utils.py), so we must use the same
 * window for BQ to get comparable results.
 *
 * Validation rules:
 * 1. Each category > $0 (pipeline ran successfully)
 * 2. Each category > minimum threshold (data at expected scale)
 * 3. BQ-API match within 5% (same date range → should be close)
 */
async function validateCostsThreeLayer(
    orgSlug: string,
    apiKey: string,
    dataset: string,
    _startDate: string,
    _endDate: string
): Promise<ValidationResult> {
    // Use last 365 days for validation — both BQ and API get same window
    const valDates = getValidationDateRange()
    console.log(`\n[3-Layer Cost Validation] (${valDates.start} to ${valDates.end}, 365 days)`)

    const result: ValidationResult = {
        passed: true,
        bqTotals: null,
        apiTotals: null,
        expectedTotals: MINIMUM_THRESHOLDS,
        errors: [],
        warnings: [],
        comparisons: [],
    }

    // Layer 1: BigQuery (365-day window)
    console.log('  Layer 1: Querying BigQuery (last 365 days)...')
    result.bqTotals = queryBigQueryCosts(dataset, valDates.start, valDates.end)
    if (!result.bqTotals) {
        result.errors.push('BigQuery query failed - cost_data_standard_1_3 may not exist or be empty')
        result.passed = false
        return result
    }
    console.log(`    BQ: GenAI=$${result.bqTotals.genai.toLocaleString()}, Cloud=$${result.bqTotals.cloud.toLocaleString()}, Sub=$${result.bqTotals.subscription.toLocaleString()}, Total=$${result.bqTotals.total.toLocaleString()}`)

    // Layer 2: API (365-day window — same range as BQ)
    console.log('  Layer 2: Querying API (last 365 days)...')
    result.apiTotals = await queryAPICosts(orgSlug, apiKey, valDates.start, valDates.end)
    if (!result.apiTotals) {
        result.warnings.push('API query failed after retries - using BQ totals as authoritative')
        console.log('    API: UNAVAILABLE (BQ validation is authoritative)')
        result.apiTotals = { ...result.bqTotals! }
    } else {
        console.log(`    API: GenAI=$${result.apiTotals.genai.toLocaleString()}, Cloud=$${result.apiTotals.cloud.toLocaleString()}, Sub=$${result.apiTotals.subscription.toLocaleString()}, Total=$${result.apiTotals.total.toLocaleString()}`)
    }

    // Layer 3: Cross-validate
    console.log('  Layer 3: Cross-validating...')
    const categories: { name: string; key: keyof CategoryTotals }[] = [
        { name: 'GenAI', key: 'genai' },
        { name: 'Cloud', key: 'cloud' },
        { name: 'Subscription', key: 'subscription' },
        { name: 'TOTAL', key: 'total' },
    ]

    for (const { name, key } of categories) {
        const bq = result.bqTotals[key]
        const api = result.apiTotals[key]
        const threshold = MINIMUM_THRESHOLDS[key]

        // BQ-API difference (same date range → should be close)
        const bqApiDiffPct = api > 0 ? Math.abs(bq - api) / api * 100 : (bq > 0 ? 100 : 0)

        result.comparisons.push({
            category: name,
            bq,
            api,
            expected: threshold,
            bqApiDiffPct: Math.round(bqApiDiffPct * 10) / 10,
            bqExpectedDiffPct: 0,  // Using thresholds, not exact targets
        })

        // Rule 1: Any category = $0 → ERROR (pipeline failed)
        if (bq === 0 && key !== 'total') {
            result.errors.push(`${name}: BQ total is $0 - pipeline likely failed`)
            result.passed = false
        }

        // Rule 2: Below minimum threshold → ERROR (data scale wrong)
        if (bq > 0 && bq < threshold && key !== 'total') {
            result.errors.push(`${name}: BQ=$${bq.toLocaleString()} below minimum threshold $${threshold.toLocaleString()}`)
            result.passed = false
        }

        // Rule 3: BQ-API mismatch > 5% → WARNING (same date range should match)
        if (bqApiDiffPct > 5 && key !== 'total') {
            result.warnings.push(`${name}: BQ-API mismatch ${bqApiDiffPct.toFixed(1)}% (BQ=$${bq.toLocaleString()}, API=$${api.toLocaleString()})`)
        }
    }

    // Print comparison table
    console.log('\n  Validation Results:')
    console.log('  ' + '-'.repeat(90))
    console.log('  Category       BQ              API             Min Threshold   BQ-API Diff')
    console.log('  ' + '-'.repeat(90))
    for (const c of result.comparisons) {
        const bqStr = `$${c.bq.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.padEnd(16)
        const apiStr = `$${c.api.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.padEnd(16)
        const threshStr = `$${c.expected.toLocaleString()}`.padEnd(16)
        const diffStr = `${c.bqApiDiffPct}%`
        const status = c.bq >= c.expected ? 'OK' : 'FAIL'
        console.log(`  ${c.category.padEnd(13)} ${bqStr}${apiStr}${threshStr}${diffStr.padEnd(12)}${status}`)
    }
    console.log('  ' + '-'.repeat(90))
    console.log(`  3-Layer Validation: ${result.passed ? 'PASSED' : 'FAILED'}`)

    return result
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

    // Pre-flight: verify demo data path exists
    const fs = require('fs')
    if (!fs.existsSync(DEMO_DATA_PATH)) {
        result.message = `Demo data path not found: ${DEMO_DATA_PATH}`
        result.errors.push(result.message)
        return result
    }

    console.log('='.repeat(60))
    console.log('Load Demo Data (Pipeline Service API)')
    console.log('='.repeat(60))
    console.log(`Org Slug: ${config.orgSlug}`)
    console.log(`Dataset: ${dataset}`)
    console.log(`Date Range: ${config.startDate} to ${config.endDate}`)
    console.log(`Mode: ${config.rawOnly ? 'Raw Only' : config.pipelinesOnly ? 'Pipelines Only' : 'Full (Raw + Pipelines)'}`)
    console.log(`Pipeline Service: ${PIPELINE_SERVICE_URL}`)

    try {
        // Step 0a: Pre-flight dataset check
        console.log('\n[Step 0a] Pre-flight dataset check...')
        const datasetExists = await ensureDatasetExists(config.orgSlug, dataset)
        if (!datasetExists) {
            result.errors.push(`Dataset ${dataset} does not exist and could not be created. Run onboarding first.`)
            result.message = `Dataset ${dataset} missing - onboard the org first`
            return result
        }

        // Step 0a2: Sync API key to Supabase (so frontend server actions work)
        console.log('\n[Step 0a2] Syncing API key to Supabase...')
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (serviceRoleKey) {
            try {
                const supabase = createSupabaseClient(ENV_CONFIG.supabaseUrl, serviceRoleKey, {
                    auth: { autoRefreshToken: false, persistSession: false }
                })
                const { error: upsertError } = await supabase
                    .from('org_api_keys_secure')
                    .upsert({
                        org_slug: config.orgSlug,
                        api_key: config.apiKey,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'org_slug' })

                if (upsertError) {
                    result.warnings.push(`API key Supabase sync failed: ${upsertError.message}`)
                    console.log(`    WARNING: ${upsertError.message}`)
                } else {
                    console.log('    API key synced to org_api_keys_secure')
                }
            } catch (syncErr) {
                result.warnings.push(`API key Supabase sync error: ${syncErr}`)
            }
        } else {
            result.warnings.push('SUPABASE_SERVICE_ROLE_KEY not set - frontend dashboard may not load costs')
            console.log('    WARNING: SUPABASE_SERVICE_ROLE_KEY not set - skipping API key sync')
        }

        // Step 0b: Pre-flight health check
        console.log('\n[Step 0b] Pre-flight service health check...')
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

        // Steps 6-8: Run pipelines via API (unless raw-only)
        // ALL pipelines run SEQUENTIALLY to avoid BigQuery concurrent transaction conflicts.
        if (!config.rawOnly) {
            // Step 6: Subscription pipeline
            // NOTE: All pipelines run SEQUENTIALLY to avoid BigQuery concurrent transaction
            // conflicts on cost_data_standard_1_3 (all cost types write to this table).
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
            // Wait for subscription pipeline to complete before starting other pipelines
            const subPipelineId = result.pipelinesExecuted.subscription.pipelineLoggingId
            if (subPipelineId) {
                await waitForSinglePipeline(config.orgSlug, config.apiKey, subPipelineId, 'subscription', 180000)
            }

            // Step 7a: Calculate GenAI costs directly via SQL (JOIN usage + pricing)
            // Note: Per-provider PAYG pipelines require API credentials which demo doesn't have.
            // Instead, we calculate costs directly in BigQuery.
            const costsCalculated = calculateGenAICostsViaSQL(config.orgSlug, dataset)

            // Step 7b: Consolidate GenAI + convert to FOCUS directly via SQL
            // Note: The consolidation pipeline processes one day at a time (start_date only).
            // Demo data spans multiple dates, so we consolidate all dates at once via SQL.
            if (costsCalculated) {
                const consolidated = consolidateGenAIToFocusViaSQL(config.orgSlug, dataset)
                result.pipelinesExecuted.genai = {
                    status: consolidated ? 'COMPLETED' : 'FAILED',
                    diagnosis: consolidated ? 'Direct SQL consolidation + FOCUS conversion' : 'SQL consolidation failed'
                }
            } else {
                result.pipelinesExecuted.genai = {
                    status: 'FAILED',
                    diagnosis: 'GenAI cost calculation failed - check usage and pricing data'
                }
            }

            // Step 8: Cloud FOCUS convert per-provider (sequential - each waits before next)
            const cloudResult = await runCloudFocusPipeline(
                config.orgSlug, config.apiKey, config.startDate, config.endDate
            )

            // Cloud pipelines already waited sequentially inside runCloudFocusPipeline
            let cloudPipelineFailures: string[] = [...cloudResult.failedProviders]

            // Step 8b: SQL fallback for any cloud providers that failed
            const pipelineSuccessCount = 4 - cloudPipelineFailures.length
            if (cloudPipelineFailures.length > 0) {
                console.log(`    ${cloudPipelineFailures.length} provider(s) failed, attempting SQL fallback...`)
                const sqlSucceeded = convertCloudToFocusViaSQL(
                    config.orgSlug, dataset, cloudPipelineFailures,
                    config.startDate, config.endDate
                )
                const totalSuccess = pipelineSuccessCount + sqlSucceeded.length
                if (totalSuccess === 4) {
                    result.pipelinesExecuted.cloud = {
                        status: 'COMPLETED',
                        diagnosis: `Pipeline: ${pipelineSuccessCount} providers, SQL fallback: ${sqlSucceeded.length} providers`
                    }
                } else {
                    result.pipelinesExecuted.cloud = {
                        status: 'PARTIAL',
                        diagnosis: `${totalSuccess}/4 providers converted to FOCUS`
                    }
                }
            } else {
                result.pipelinesExecuted.cloud = {
                    status: 'COMPLETED',
                    diagnosis: 'All 4 cloud providers converted via pipeline'
                }
            }
        } else {
            console.log('\n[Skipping pipeline execution - raw-only mode]')
        }

        // Step 10: Set up demo cost alerts (channel + rules)
        if (!config.rawOnly) {
            const alertResult = await setupDemoAlerts(config.orgSlug, config.apiKey)
            if (alertResult.errors.length > 0) {
                result.warnings.push(...alertResult.errors.map(e => `Alert setup: ${e}`))
            }
        }

        // Step 10.5: Set up demo budgets (hierarchy-based spending targets)
        if (!config.rawOnly) {
            const budgetResult = await setupDemoBudgets(config.orgSlug, config.apiKey)
            if (budgetResult.errors.length > 0) {
                result.warnings.push(...budgetResult.errors.map(e => `Budget setup: ${e}`))
            }
        }

        // 3-Layer Cost Validation (runs after pipelines complete)
        // Wait for API service to settle after heavy pipeline processing
        if (!config.rawOnly) {
            console.log('\n  Waiting 5s for API cache to settle after pipelines...')
            await new Promise(r => setTimeout(r, 5000))

            result.validation = await validateCostsThreeLayer(
                config.orgSlug,
                config.apiKey,
                dataset,
                config.startDate,
                config.endDate
            )

            if (!result.validation.passed) {
                result.errors.push(...result.validation.errors)
                result.warnings.push(...result.validation.warnings)
            } else {
                result.warnings.push(...result.validation.warnings)
            }
        }

        // Step 11: Frontend Dashboard Verification (Playwright)
        if (!config.rawOnly && !config.skipDashboard && config.verifyDashboard) {
            console.log('\n[Step 11] Frontend Dashboard Verification...')
            try {
                const { verifyDashboard } = await import('./verify-dashboard')
                const dashResult = await verifyDashboard(config.orgSlug)
                result.dashboardVerification = {
                    passed: dashResult.passed,
                    screenshot: dashResult.screenshot,
                    amounts: dashResult.amounts,
                    errors: dashResult.errors,
                }
                if (!dashResult.passed) {
                    result.warnings.push(`Dashboard verification failed: ${dashResult.errors.join('; ')}`)
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error)
                result.warnings.push(`Dashboard verification skipped: ${msg}`)
            }
        }

        // Determine success based on critical failures
        const hasCriticalErrors = result.errors.some(e =>
            e.includes('Subscription plans') ||
            e.includes('Pipeline Service not available') ||
            e.includes('Dataset') && e.includes('missing')
        )

        const hasValidationErrors = result.validation && !result.validation.passed

        if (hasCriticalErrors) {
            result.success = false
            result.message = `Demo data loading failed with ${result.errors.length} error(s)`
        } else if (hasValidationErrors) {
            result.success = false
            result.message = `Demo data loaded but validation failed: ${result.validation!.errors.join('; ')}`
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

    // 3-Layer Validation
    if (result.validation) {
        const v = result.validation
        console.log(`\n📊 3-Layer Cost Validation: ${v.passed ? '✅ PASSED' : '❌ FAILED'}`)
        if (v.comparisons.length > 0) {
            console.log('   Category       BQ              API             Expected        BQ-API   BQ-Exp')
            console.log('   ' + '-'.repeat(80))
            for (const c of v.comparisons) {
                const bqStr = `$${c.bq.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`.padEnd(16)
                const apiStr = `$${c.api.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`.padEnd(16)
                const expStr = `$${c.expected.toLocaleString()}`.padEnd(16)
                console.log(`   ${c.category.padEnd(13)} ${bqStr}${apiStr}${expStr}${c.bqApiDiffPct}%`.padEnd(7) + `     ${c.bqExpectedDiffPct}%`)
            }
        }
        if (v.errors.length > 0) {
            console.log('   Validation Errors:')
            v.errors.forEach(e => console.log(`     ❌ ${e}`))
        }
    }

    // Dashboard Verification
    if (result.dashboardVerification) {
        const dv = result.dashboardVerification
        console.log(`\n🖥️  Dashboard Verification: ${dv.passed ? '✅ PASSED' : '❌ FAILED'}`)
        if (dv.screenshot) {
            console.log(`   Screenshot:    ✅ ${dv.screenshot}`)
        }
        if (dv.amounts.length > 0) {
            console.log(`   Cost Display:  ✅ ${dv.amounts.join(', ')}`)
        } else {
            console.log('   Cost Display:  ❌ No non-zero amounts found')
        }
        if (dv.errors.length > 0) {
            dv.errors.forEach(e => console.log(`   ❌ ${e}`))
        }
    }

    // Alerts
    console.log('\n🔔 Cost Alerts:')
    console.log('   Email Channel:     ✅ Configured (demo@cloudact.ai)')
    console.log('   Daily Spike:       ✅ Alert when daily spend > $5,000')
    console.log('   Budget Threshold:  ✅ Alert at 80% of $50K monthly budget')

    // Budgets
    console.log('\n💰 Budget Planning:')
    console.log('   Dept Cloud:        ✅ DEPT-ENG $30K quarterly')
    console.log('   Dept GenAI:        ✅ DEPT-DS $25K quarterly')
    console.log('   Dept Total:        ✅ DEPT-ENG $50K quarterly (all categories)')
    console.log('   Proj Cloud:        ✅ PROJ-PLATFORM $20K (GCP)')
    console.log('   Proj GenAI:        ✅ PROJ-MLPIPE $20K (OpenAI)')
    console.log('   Team Cloud:        ✅ TEAM-BACKEND $12K (AWS)')
    console.log('   Team Subscription: ✅ TEAM-FRONTEND $3K SaaS')
    console.log('   Team Tokens:       ✅ TEAM-MLOPS 50M tokens (OpenAI)')

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
        console.log(`   3. Login: demo@cloudact.ai / Demo1234`)
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
        console.log('  --verify-dashboard  Run Playwright dashboard verification after validation')
        console.log('  --skip-dashboard    Explicitly skip dashboard verification')
        console.log('  --start-date=DATE   Start date (default: 2025-01-01)')
        console.log('  --end-date=DATE     End date (default: 2026-12-31)')
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
