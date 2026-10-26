/**
 * `yarn test:needed` — does the full Node suite need to run again?
 *
 * Compares the working tree against the last green full-suite record `yarn test` wrote on this
 * machine (`.test-runs/last-green.json`, gitignored). Exit 0 when the record still covers the tree,
 * 1 when something should run (no record, a partial record, or covered files changed). When only docs
 * changed, what should run is `yarn test:docs`: the test files that read them, not the whole suite.
 * When the last full run failed and only its failing test files changed since, what should run is
 * `yarn test:failed`: those files, not the whole suite.
 * `--json` prints the comparison instead of prose.
 */

import {
    COVERED_PATHS,
    RECORD_DIR,
    RECORD_FILE,
    affectedRunNote,
    compareRecord,
    docPathsReadByTests,
    fingerprintTree,
    isDocsOnlyChange,
    planFailedRerun,
    readAffectedRecord,
    readFailedRecord,
    readRecord,
    readTestFiles,
    testFilesReadingDocs,
} from './test-run-record.mjs'

const json = process.argv.includes('--json')

const record = readRecord()
const tree = fingerprintTree()
const testFiles = readTestFiles()
const docPathsRead = docPathsReadByTests(testFiles.map((file) => file.source))
const result = compareRecord(record, tree, docPathsRead)
const docsOnly = isDocsOnlyChange(result)
const docReaders = docsOnly ? testFilesReadingDocs(testFiles, result.changed) : []
const failedRerun = result.status === 'covered' ? null : planFailedRerun(readFailedRecord(), tree)
const failedOnly = failedRerun?.status === 'run'
// A green `yarn test:affected` run on this exact tree is mentioned, never counted: it is not the push gate.
const affectedNote = result.status === 'covered' ? null : affectedRunNote(readAffectedRecord(), tree)

const describeRecord = () => {
    const refreshes = record.docRefreshes ?? []
    return (
        `${record.at} at ${record.head.slice(0, 9)}` +
        (record.counts ? `, ${record.counts.tests} tests, ${record.counts.pass} pass, ${record.counts.fail} fail` : '') +
        (refreshes.length > 0 ? `; refreshed for docs ${refreshes.length} time(s), last ${refreshes[refreshes.length - 1].at}` : '') +
        ((record.failedReruns ?? []).length > 0
            ? `; its ${record.failedReruns[0].files.length} failing test file(s) re-ran green ${record.failedReruns[0].at}`
            : '')
    )
}

if (json) {
    console.log(
        JSON.stringify(
            {
                ...result,
                docsOnly,
                docReaders,
                failedOnly,
                failedRerun,
                affectedNote,
                record: record && { at: record.at, head: record.head, suites: record.suites, counts: record.counts, docRefreshes: record.docRefreshes ?? [] },
                head: tree.head,
            },
            null,
            2
        )
    )
} else if (failedOnly) {
    console.log(
        `The last full run failed in ${failedRerun.files.length} test file(s), and only those changed since. Run \`yarn test:failed\` (those files only), not \`yarn test\`.`
    )
    for (const path of failedRerun.files.slice(0, 10)) console.log(`  ${path}`)
} else if (result.status === 'none') {
    console.log(`No green full-suite run is recorded on this machine (${RECORD_DIR}/${RECORD_FILE}). Run \`yarn test\`.`)
} else if (result.status === 'partial') {
    console.log(`The last green record ran only [${record.suites.join(', ')}] (${describeRecord()}); the full suite has not been recorded. Run \`yarn test\`.`)
} else if (result.status === 'covered') {
    console.log(`The last green full run (${describeRecord()}) still covers the tree: no change under ${COVERED_PATHS.join(', ')} that a test can see. Skip \`yarn test\`.`)
    if (result.unpinnedDocs.length > 0) {
        console.log(`Docs changed that no test reads (${result.unpinnedDocs.length}): ${result.unpinnedDocs.slice(0, 10).join(', ')}${result.unpinnedDocs.length > 10 ? ', …' : ''}`)
    }
} else if (docsOnly) {
    console.log(
        `Only docs changed since the last green full run (${describeRecord()}): ${result.changed.length} doc(s) that ${docReaders.length} test file(s) read. Run \`yarn test:docs\` (those files only), not \`yarn test\`.`
    )
    for (const path of result.changed.slice(0, 25)) console.log(`  ${path}`)
    if (result.changed.length > 25) console.log(`  … and ${result.changed.length - 25} more`)
} else {
    const shown = result.changed.slice(0, 25)
    console.log(`${result.changed.length} covered file(s) changed since the last green full run (${describeRecord()}). Run \`yarn test\`.`)
    for (const path of shown) console.log(`  ${path}`)
    if (result.changed.length > shown.length) console.log(`  … and ${result.changed.length - shown.length} more`)
}

if (!json && affectedNote) console.log(affectedNote)

process.exit(result.status === 'covered' ? 0 : 1)
