/**
 * `yarn test:docs` — the suite's blast radius for a docs-only change. "Docs" are `DOC_PATHS`: the docs, the skills
 * and the rules files, which tests read as text.
 *
 * This repository's contract tests read docs as text, so a changed doc can fail the suite, but only the
 * test files that name it can see the change (`docPathsNamedIn`). When nothing but docs has changed since
 * the last green full run, this runs exactly those test files and, on green, refreshes the last-green
 * record so `yarn test:needed` says the tree is covered. Any other change — code, tests, scripts,
 * migrations, workers, dependencies — refuses and asks for `yarn test`.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { relative } from 'node:path'

import { repoRoot, TEST_RUNTIME_IMPORTS } from './run-node-tests-config.mjs'
import {
    buildReporterArgs,
    compareRecord,
    displayPath,
    docPathsReadByTests,
    ensureRecordDir,
    fingerprintTree,
    isDocPath,
    isDocsOnlyChange,
    parseTapSummary,
    readRecord,
    readTestFiles,
    refreshRecordForDocs,
    tapPath,
    testFilesReadingDocs,
    writeRecord,
} from './test-run-record.mjs'

// The tree is fingerprinted BEFORE the run, as `yarn test` does: the refreshed record describes the
// tree the tests saw, not whatever was edited while they ran.
const record = readRecord()
const tree = fingerprintTree()
const testFiles = readTestFiles()
const result = compareRecord(record, tree, docPathsReadByTests(testFiles.map((file) => file.source)))

if (result.status === 'none' || result.status === 'partial') {
    console.log('No green full-suite run is recorded on this machine to refresh. Run `yarn test`.')
    process.exit(1)
}
if (result.status === 'covered') {
    console.log('The last green full run still covers the tree; nothing to run.')
    process.exit(0)
}
if (!isDocsOnlyChange(result)) {
    const other = result.changed.filter((path) => !isDocPath(path))
    console.log(`Not a docs-only change: ${other.length} other covered file(s) changed. Run \`yarn test\`.`)
    for (const path of other.slice(0, 10)) console.log(`  ${path}`)
    if (other.length > 10) console.log(`  … and ${other.length - 10} more`)
    process.exit(1)
}

const affected = testFilesReadingDocs(testFiles, result.changed)
console.log(`Docs-only change: ${result.changed.length} doc(s) that tests read. Running the ${affected.length} test file(s) that read them:`)
for (const path of affected) console.log(`  ${path}`)

const startedAt = Date.now()
ensureRecordDir()
const tap = tapPath()
if (existsSync(tap)) rmSync(tap)

// Reporter flags go BEFORE the files: Node stops reading options at the first positional.
const child = spawn(process.execPath, [...buildReporterArgs(tap), ...TEST_RUNTIME_IMPORTS, '--test', ...affected], {
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
        const refreshed = refreshRecordForDocs(record, {
            tree,
            changedDocs: result.changed,
            testFiles: affected,
            counts,
            durationMs: Date.now() - startedAt,
        })
        const path = writeRecord(refreshed)
        console.log(
            `Green: every test that reads the changed docs passes. ${displayPath(path)} now covers the tree (HEAD ${tree.head.slice(0, 9)}).`
        )
    }
    process.exit(code ?? 1)
})

child.on('error', (error) => {
    console.error(`Failed to start test process from ${relative(repoRoot, process.execPath)}:`, error)
    process.exit(1)
})
