import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
    buildNodeTestArgs,
    buildTestPatterns,
    repoRoot,
    resolveSuites,
} from './run-node-tests-config.mjs'
import {
    FILE_TIMES_ENV,
    FULL_SUITES,
    RECORD_DIR,
    appendCalibrationLine,
    buildCalibrationLine,
    buildFailedRecord,
    buildRecord,
    buildReporterArgs,
    clearFailedRecord,
    displayPath,
    ensureRecordDir,
    failedTestFilesFromTap,
    fingerprintTree,
    fileTimesPath,
    formatFileTimes,
    isFullRun,
    parseTapSummary,
    purgeTsxCache,
    readFileTimes,
    summariseFileTimes,
    tapPath,
    writeFailedRecord,
    writeRecord,
} from './test-run-record.mjs'

const requestedSuites = process.argv.slice(2)
let suites

try {
    suites = resolveSuites(requestedSuites)
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
}

const patterns = buildTestPatterns(suites)

console.log(`Running Node test suite(s): ${suites.join(', ')} (${patterns.join(', ')})`)

// The tree is fingerprinted BEFORE the run: a green record describes the tree the tests saw, not
// whatever was edited while they ran.
const tree = fingerprintTree()
const startedAt = Date.now()
ensureRecordDir()
const tap = tapPath()
if (existsSync(tap)) rmSync(tap)

// Calibration of `yarn test:affected`: alongside a full run, compute what it would have selected for this
// run's changes, and keep that beside the run's result (`.test-runs/affected-calibration.jsonl`). It runs
// in its own process so the suite is not delayed, and it can never change this run's exit code.
const calibration = isFullRun(suites) ? startCalibration() : null

// The `tsx` cache slows every process start once it holds tens of thousands of entries (D2, `plans/tooling/test-suite-speed-plan.md`):
// replace it before the run. Fails open: whatever goes wrong here, the suite still runs.
const cachePurge = purgeTsxCache()
if (cachePurge.action === 'purged') {
    console.log(`tsx cache held ${cachePurge.entries} entries: renamed, and deleting it in the background. This run starts with a cold cache (about 50 s slower, once).`)
} else if (cachePurge.action === 'failed') {
    console.log(`tsx cache check skipped: ${cachePurge.error}`)
}

// The per-file timer preload (`scripts/test-runtime/file-timer.mjs`) writes here; the summary is printed after the run.
const fileTimes = fileTimesPath()
try {
    if (existsSync(fileTimes)) rmSync(fileTimes)
} catch {
    // A locked file (Windows) only means a stale report; the run itself must not stop.
}

// Reporter flags go BEFORE the patterns: Node stops reading options at the first positional, and a
// flag after a pattern is silently taken as another pattern (no TAP file, no counts).
const child = spawn(process.execPath, [...buildReporterArgs(tap), ...buildNodeTestArgs(suites)], {
    cwd: repoRoot,
    env: { ...process.env, [FILE_TIMES_ENV]: fileTimes },
    stdio: 'inherit',
    windowsHide: true,
})

child.on('exit', async (code, signal) => {
    if (signal) {
        console.error(`Test process terminated with signal ${signal}`)
        await finishCalibration(calibration, { exit: 1 })
        process.exit(1)
    }
    printFileTimes()
    // Only a full run (unit + integration) is recorded: a green unit-only run must not replace the
    // last full record, or `yarn test:needed` would lose what it compares against.
    if (code === 0 && isFullRun(suites)) {
        const counts = existsSync(tap) ? parseTapSummary(readFileSync(tap, 'utf8')) : null
        const record = buildRecord({ suites, counts, durationMs: Date.now() - startedAt, tree })
        const path = writeRecord(record)
        clearFailedRecord()
        console.log(`Green run recorded in ${displayPath(path)} (HEAD ${tree.head.slice(0, 9)}); \`yarn test:needed\` compares the tree against it.`)
    } else if (code !== 0 && isFullRun(suites) && existsSync(tap)) {
        // A failed full run is recorded too: when a fix touches only the failing test files, `yarn
        // test:failed` re-runs just them and restores the green record without another full run.
        const tapText = readFileSync(tap, 'utf8')
        const failed = failedTestFilesFromTap(tapText)
        const record = buildFailedRecord({ suites, counts: parseTapSummary(tapText), durationMs: Date.now() - startedAt, tree, failed })
        const path = writeFailedRecord(record)
        console.log(
            `Failed run recorded in ${displayPath(path)}: ${failed.files.length} failing test file(s)` +
                (failed.unresolved.length > 0 ? `, ${failed.unresolved.length} failure(s) outside a test file` : '') +
                '. If a fix changes only those test files, `yarn test:failed` re-runs just them.'
        )
        for (const file of failed.files.slice(0, 10)) console.log(`  ${file}`)
    } else if (code === 0) {
        console.log(`Green, but not recorded: only a full run (${FULL_SUITES.join(' + ')}) updates the last-green record.`)
    }
    await finishCalibration(calibration, { exit: code ?? 1 })
    process.exit(code ?? 1)
})

/** The slowest files and any that stayed open after their last test. Best-effort: absent timer data prints nothing. */
function printFileTimes() {
    try {
        for (const line of formatFileTimes(summariseFileTimes(readFileTimes(fileTimes)))) console.log(line)
    } catch {
        // a report must never change the run's exit code
    }
}

/** Starts `test-affected.mjs --calibrate-select` in the background; null if it cannot start. */
function startCalibration() {
    // A project without the selector (one the bootstrap kit set up) skips calibration quietly.
    if (!existsSync(join(repoRoot, 'scripts/test-affected.mjs'))) return null
    try {
        ensureRecordDir()
        const out = join(repoRoot, RECORD_DIR, `affected-selection.${process.pid}.json`)
        rmSync(out, { force: true })
        const selector = spawn(process.execPath, ['scripts/test-affected.mjs', '--calibrate-select', out], {
            cwd: repoRoot,
            env: process.env,
            stdio: 'ignore',
            windowsHide: true,
        })
        const done = new Promise((resolvePromise) => {
            selector.on('exit', () => resolvePromise(true))
            selector.on('error', () => resolvePromise(false))
        })
        return { selector, out, done }
    } catch {
        return null
    }
}

/**
 * Waits up to two minutes for the selection, stops the selector if it is still running (it must never
 * outlive the run), and appends the calibration line. Every failure is swallowed: calibration is a
 * record, never a reason for the suite's exit code to change.
 */
async function finishCalibration(started, { exit }) {
    if (!started) return
    try {
        const finished = await Promise.race([started.done, new Promise((resolvePromise) => setTimeout(() => resolvePromise(false), 120000).unref())])
        if (!finished) started.selector.kill()
        let selection = null
        let unavailable = finished ? null : 'the selection did not finish within two minutes of the run'
        if (finished && existsSync(started.out)) {
            const parsed = JSON.parse(readFileSync(started.out, 'utf8'))
            if (parsed.unavailable) unavailable = parsed.unavailable
            else selection = parsed
        }
        const tapText = existsSync(tap) ? readFileSync(tap, 'utf8') : ''
        const failed = exit === 0 ? { files: [], unresolved: [] } : failedTestFilesFromTap(tapText)
        appendCalibrationLine(buildCalibrationLine({ selection, failed, exit, head: tree.head, unavailable }))
        if (selection?.globalInputs?.length === 0) {
            const missed = failed.files.filter((file) => !selection.selected.includes(file))
            console.log(
                `test:affected would have run ${selection.selected.length} of ${selection.totalTestFiles} test files for this change` +
                    (missed.length > 0 ? `; it would have MISSED ${missed.length} failing file(s): ${missed.join(', ')}` : '') +
                    ' (`node scripts/test-affected.mjs --report`).'
            )
        }
    } catch {
        // calibration is best-effort
    } finally {
        rmSync(started.out, { force: true })
    }
}

child.on('error', (error) => {
    console.error(`Failed to start test process from ${relative(repoRoot, process.execPath)}:`, error)
    process.exit(1)
})
