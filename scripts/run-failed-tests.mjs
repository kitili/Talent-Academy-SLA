/**
 * `yarn test:failed` — re-run only the test files the last full run failed, and let that count.
 *
 * `yarn test` records a failed full run in `.test-runs/last-failed.json`: the tree it saw and the test
 * files that failed. When the only covered files changed since are those same test files, every other
 * test already passed on this exact tree, and a test file is imported by nothing else, so re-running the
 * failed files is the whole remaining blast radius (`planFailedRerun`). On green, this writes the
 * last-green record (`recordFromFailedRerun`) so `yarn test:needed` says the tree is covered. Any other
 * change since the failed run (app code, scripts, fixtures, docs) refuses and asks for `yarn test`.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { relative } from 'node:path'

import { repoRoot, TEST_RUNTIME_IMPORTS } from './run-node-tests-config.mjs'
import {
    buildReporterArgs,
    clearFailedRecord,
    displayPath,
    ensureRecordDir,
    fingerprintTree,
    parseTapSummary,
    planFailedRerun,
    readFailedRecord,
    recordFromFailedRerun,
    tapPath,
    writeRecord,
} from './test-run-record.mjs'

// The tree is fingerprinted BEFORE the run, as `yarn test` does: the record describes the tree the
// tests saw, not whatever was edited while they ran.
const failedRecord = readFailedRecord()
const tree = fingerprintTree()
const plan = planFailedRerun(failedRecord, tree)

if (plan.status === 'none') {
    console.log('No failed full run is recorded on this machine. Run `yarn test` (or `yarn test:needed` to check).')
    process.exit(1)
}
if (plan.status === 'refuse') {
    console.log(`Can't stand in for a full run: ${plan.reason}. Run \`yarn test\`.`)
    for (const path of plan.changed.slice(0, 10)) console.log(`  ${path}`)
    if (plan.changed.length > 10) console.log(`  … and ${plan.changed.length - 10} more`)
    process.exit(1)
}

console.log(
    `Re-running the ${plan.files.length} test file(s) the last full run failed (${plan.changed.length} changed since; nothing else did):`
)
for (const path of plan.files) console.log(`  ${path}`)

const startedAt = Date.now()
ensureRecordDir()
const tap = tapPath()
if (existsSync(tap)) rmSync(tap)

// Reporter flags go BEFORE the files: Node stops reading options at the first positional.
const child = spawn(process.execPath, [...buildReporterArgs(tap), ...TEST_RUNTIME_IMPORTS, '--test', ...plan.files], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
})

child.on('exit', (code, signal) => {
    if (signal) {
        console.error(`Test process terminated with signal ${signal}`)
        process.exit(1)
    }
    if (code === 0) {
        const counts = existsSync(tap) ? parseTapSummary(readFileSync(tap, 'utf8')) : null
        const record = recordFromFailedRerun(failedRecord, { tree, files: plan.files, counts, durationMs: Date.now() - startedAt })
        const path = writeRecord(record)
        clearFailedRecord()
        console.log(
            `Green: the failed files pass and nothing else changed since the full run. ${displayPath(path)} now covers the tree (HEAD ${tree.head.slice(0, 9)}).`
        )
    } else {
        console.log('Still failing; the failed-run record is unchanged. Fix and run `yarn test:failed` again.')
    }
    process.exit(code ?? 1)
})

child.on('error', (error) => {
    console.error(`Failed to start test process from ${relative(repoRoot, process.execPath)}:`, error)
    process.exit(1)
})
