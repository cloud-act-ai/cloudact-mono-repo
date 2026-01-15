#!/usr/bin/env node
/**
 * Supabase Migration Auto-Runner
 * Automatically runs pending migrations on startup
 *
 * Environment variables required:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_DB_PASSWORD
 * - SUPABASE_REGION (optional, defaults to us-west-2)
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local');

  // BUG-030 FIX: Handle race condition with try-catch
  try {
    if (!fs.existsSync(envPath)) {
      log(colors.yellow, '⚠ No .env.local found, skipping migrations');
      return false;
    }

    // Load environment variables from .env.local
    const dotenv = require('dotenv');
    const envConfig = dotenv.config({ path: envPath });

    if (envConfig.error) {
      // File was deleted after existence check or parse error
      log(colors.yellow, `⚠ Error loading .env.local: ${envConfig.error.message}`);
      return false;
    }

    // Check required variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_DB_PASSWORD) {
      log(colors.yellow, '⚠ Missing SUPABASE environment variables, skipping migrations');
      return false;
    }

    return true;
  } catch (error) {
    log(colors.yellow, `⚠ Error reading .env.local: ${error.message}`);
    return false;
  }
}

async function checkPsql() {
  try {
    await execAsync('which psql');
    return true;
  } catch (error) {
    log(colors.yellow, '⚠ psql not installed, skipping migrations');
    log(colors.yellow, '  Install with: brew install libpq && brew link --force libpq');
    return false;
  }
}

async function runMigrations() {
  const migrateScript = path.join(__dirname, 'supabase_db/migrate.sh');

  if (!fs.existsSync(migrateScript)) {
    log(colors.red, '✗ Migration script not found');
    return false;
  }

  try {
    log(colors.blue, '🔄 Checking for pending Supabase migrations...');

    // BUG-011 FIX: Add 60 second timeout to prevent hanging
    const { stdout, stderr } = await execAsync(`bash "${migrateScript}"`, {
      cwd: path.join(__dirname, 'supabase_db'),
      env: process.env,
      timeout: 60000, // 60 seconds
    });

    if (stdout) {
      console.log(stdout);
    }

    if (stderr && !stderr.includes('WatchFiles')) {
      console.error(stderr);
    }

    log(colors.green, '✓ Migrations check complete');
    return true;
  } catch (error) {
    log(colors.red, `✗ Migration failed: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    return false;
  }
}

async function main() {
  console.log('');
  log(colors.blue, '=== Supabase Migration Auto-Runner ===');
  console.log('');

  // Load environment
  const envLoaded = await loadEnv();
  if (!envLoaded) {
    log(colors.yellow, 'Skipping migrations (environment not configured)');
    process.exit(0);
  }

  // Check psql
  const psqlAvailable = await checkPsql();
  if (!psqlAvailable) {
    log(colors.yellow, 'Skipping migrations (psql not available)');
    process.exit(0);
  }

  // Run migrations
  const success = await runMigrations();

  console.log('');
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  log(colors.red, `Fatal error: ${error.message}`);
  process.exit(1);
});
