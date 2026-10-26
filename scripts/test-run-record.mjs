/**
 * The record of the last green full-suite run on this machine, and the check that says whether it
 * still covers the working tree.
 *
 * `yarn test` writes `.test-runs/last-green.json` (gitignored: runs happen on a machine) after a green
 * run: when, at which HEAD, which suites, the counts, and a per-file fingerprint of every path the Node
 * suites can exercise — including the working tree's uncommitted state. `yarn test:needed` fingerprints
 * the tree again and reports either "the last green run still covers the tree" or the files that changed.
 *
 * Coverage is content, not commits: a file counts as changed when its blob differs from the recorded
 * one, whether the change is committed, staged or unsaved-to-git. Docs are covered too, because this
 * repo's contract tests read documentation as text (`docs/_global/database`, feature READMEs, learnings); a doc
 * no test names is reported separately and does not by itself make the run stale.
 *
 * A change to docs alone has a known blast radius: only a test that names a doc can see it. Skills and the
 * rules files count as docs here (`DOC_PATHS`): tests read them as text too. `yarn test:docs` runs exactly those test files (`testFilesReadingDocs`) and, on green, refreshes the record
 * (`refreshRecordForDocs`) instead of re-running the whole suite.
 *
 * A full run that fails is recorded too, in `.test-runs/last-failed.json`: its tree and the test files
 * that failed (`failedTestFilesFromTap`). When the only covered files changed since are those same test
 * files, the rest of the suite already passed on this exact tree and a test file is imported by nothing,
 * so `yarn test:failed` re-runs just them (`planFailedRerun`) and, on green, writes the green record
 * (`recordFromFailedRerun`) without another full run. Any other change asks for `yarn test`.
 *
 * Pure where it matters: `fingerprintTree`, `compareRecord`, `parseTapSummary` and `docPathsReadByTests`
 * take their inputs (a `git` runner, file contents) as arguments so they are unit-tested without a repo.
 */

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { COVERED_PATHS, DOC_PATHS, TEST_ROOTS, repoRoot } from './run-node-tests-config.mjs'

// The settings are this repository's (`run-node-tests-config.mjs`); re-exported for the importers that read them here.
export { COVERED_PATHS, DOC_PATHS }

export const RECORD_DIR = '.test-runs'
export const RECORD_FILE = 'last-green.json'
export const FAILED_RECORD_FILE = 'last-failed.json'
export const TAP_FILE = 'last-run.tap'
export const RECORD_VERSION = 1

/** The suites that make a run "full". */
export const FULL_SUITES = Object.freeze(['unit', 'integration'])

/** A `git` runner: arguments in, stdout out. Injected so the pure parts run without a repository. */
export function defaultGit(args) {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
}

/** Node's porcelain paths are quoted when they contain unusual characters. */
function unquotePath(path) {
    if (path.startsWith('"') && path.endsWith('"')) {
        return JSON.parse(path)
    }
    return path
}

/**
 * Every covered file with the blob id of its content as it is NOW: the index blob when the working
 * tree matches the index, a fresh `hash-object` when it does not, nothing when the file is deleted.
 *
 * @param {(args: string[]) => string} git
 * @param {readonly string[]} paths
 * @returns {{ head: string, files: Record<string, string>, dirty: string[], fingerprint: string }}
 */
export function fingerprintTree(git = defaultGit, paths = COVERED_PATHS) {
    const head = git(['rev-parse', 'HEAD']).trim()
    const files = {}
    for (const line of git(['ls-files', '-s', '--', ...paths]).split('\n')) {
        if (!line) continue
        const tab = line.indexOf('\t')
        const meta = line.slice(0, tab).split(' ')
        const path = unquotePath(line.slice(tab + 1))
        // A merge conflict lists several stages; the last one wins, and the file is dirty anyway.
        files[path] = meta[1]
    }
    const dirty = []
    for (const line of git(['status', '--porcelain', '--untracked-files=all', '--', ...paths]).split('\n')) {
        if (!line) continue
        const worktree = line[1]
        let path = line.slice(3)
        if (path.includes(' -> ')) path = path.slice(path.indexOf(' -> ') + 4)
        path = unquotePath(path)
        dirty.push(path)
        if (worktree === ' ') continue // staged only: the index blob is the content
        if (worktree === 'D') {
            delete files[path]
            continue
        }
        files[path] = git(['hash-object', '--', path]).trim()
    }
    dirty.sort()
    const hash = createHash('sha256')
    for (const path of Object.keys(files).sort()) hash.update(`${path}\0${files[path]}\n`)
    return { head, files, dirty, fingerprint: hash.digest('hex') }
}

/** Whether a path is one tests read as text (`DOC_PATHS`): a doc, a skill or a rules file. */
export function isDocPath(path, docPaths = DOC_PATHS) {
    return docPaths.some((root) => path === root || path.startsWith(`${root}/`))
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isFileName = (path) => /\.[^/]+$/.test(path.slice(path.lastIndexOf('/') + 1)) && !path.slice(path.lastIndexOf('/') + 1).startsWith('.')

/**
 * The doc paths (`DOC_PATHS`) one test file names: string literals (`'docs/_global/database/prod-schema.sql'`,
 * `'skills/test-skill/SKILL.md'`, `'.claude/CLAUDE.md'`), and the same path in pieces
 * (`join(root, 'docs', 'database', 'prod-schema.sql')`). A path without an extension is a directory prefix
 * (`docs/_global/database`). A bare folder name names the whole folder (`join(root, 'skills')`,
 * `join(root, 'skills', name)`), except a bare `docs`, which names nothing. Reading pieces can over-include (a `'docs'` folder a test builds in a temp dir),
 * which costs a test that did not need to run; it never under-includes a literal.
 *
 * @param {string} source one test file's contents
 * @param {readonly string[]} [docPaths]
 * @returns {string[]} unique, in order found
 */
export function docPathsNamedIn(source, docPaths = DOC_PATHS) {
    const folderNames = docPaths.filter((path) => !path.includes('/') && !isFileName(path))
    const fileNames = docPaths.filter((path) => !folderNames.includes(path))
    const folders = folderNames.map(escapeRegExp).join('|')
    const found = new Set()
    for (const match of source.matchAll(new RegExp(`['"\`]((?:${folders})\\/[A-Za-z0-9_./-]+?)['"\`]`, 'g'))) {
        const path = match[1].replace(/\/$/, '')
        if (!folderNames.includes(path)) found.add(path)
    }
    for (const match of source.matchAll(new RegExp(`['"](${folders})['"]((?:\\s*,\\s*['"][A-Za-z0-9_. -]+['"])+)`, 'g'))) {
        const segments = [...match[2].matchAll(/['"]([A-Za-z0-9_. -]+)['"]/g)].map((segment) => segment[1])
        found.add([match[1], ...segments].join('/'))
    }
    if (fileNames.length > 0) {
        for (const match of source.matchAll(new RegExp(`['"\`](${fileNames.map(escapeRegExp).join('|')})['"\`]`, 'g'))) found.add(match[1])
    }
    for (const match of source.matchAll(new RegExp(`['"\`](${folders})['"\`]`, 'g'))) {
        if (match[1] !== 'docs') found.add(match[1])
    }
    return [...found]
}

/**
 * The `docs/...` paths the test files name — the docs that are contracts.
 *
 * @param {Iterable<string>} testSources file contents
 * @returns {string[]} sorted, unique
 */
export function docPathsReadByTests(testSources) {
    const found = new Set()
    for (const source of testSources) {
        for (const path of docPathsNamedIn(source)) found.add(path)
    }
    return [...found].sort()
}

/**
 * Every test file under the Node suites' roots, with its repo-relative forward-slash path.
 * @returns {Array<{ path: string, source: string }>}
 */
export function readTestFiles(root = repoRoot) {
    const files = []
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (entry.name.endsWith('.test.ts')) {
                files.push({ path: relative(root, full).split(sep).join('/'), source: readFileSync(full, 'utf8') })
            }
        }
    }
    for (const suiteRoot of Object.values(TEST_ROOTS)) {
        const dir = join(root, suiteRoot)
        if (existsSync(dir)) walk(dir)
    }
    return files.sort((left, right) => left.path.localeCompare(right.path))
}

/** Reads every test file under the Node suites' roots. */
export function readTestSources(root = repoRoot) {
    return readTestFiles(root).map((file) => file.source)
}

/**
 * The test files that name at least one of the changed docs: the whole blast radius of a docs-only
 * change, because a doc is read as text and only a test that names it can see its content.
 *
 * @param {Array<{ path: string, source: string }>} testFiles
 * @param {string[]} changedDocs
 * @returns {string[]} sorted test file paths
 */
export function testFilesReadingDocs(testFiles, changedDocs) {
    return testFiles
        .filter((file) => {
            const named = docPathsNamedIn(file.source)
            return changedDocs.some((doc) => isDocReadByTests(doc, named))
        })
        .map((file) => file.path)
        .sort()
}

/**
 * Whether a stale comparison changed docs and nothing else. Only then is the blast radius known
 * statically; any change to code, tests, scripts, migrations, workers or dependencies needs the full suite.
 *
 * @param {ReturnType<typeof compareRecord>} result
 */
export function isDocsOnlyChange(result) {
    return result.status === 'stale' && result.changed.length > 0 && result.changed.every((path) => isDocPath(path))
}

/**
 * The record after a green run of the test files that read the changed docs: still the full run's
 * record (its time, suites and counts), now covering the tree those tests saw, with the refresh noted.
 *
 * @param {NonNullable<ReturnType<typeof readRecord>>} record
 * @param {object} input
 * @param {ReturnType<typeof fingerprintTree>} input.tree fingerprinted before the tests ran
 * @param {string[]} input.changedDocs
 * @param {string[]} input.testFiles
 * @param {{ tests: number, pass: number, fail: number, skipped: number } | null} input.counts
 * @param {number} input.durationMs
 * @param {string} [input.at]
 */
export function refreshRecordForDocs(record, { tree, changedDocs, testFiles, counts, durationMs, at = new Date().toISOString() }) {
    return {
        ...record,
        head: tree.head,
        fingerprint: tree.fingerprint,
        dirty: tree.dirty,
        files: tree.files,
        docRefreshes: [...(record.docRefreshes ?? []), { at, changedDocs: [...changedDocs], testFiles: [...testFiles], counts, durationMs }],
    }
}

/** Whether a doc path is one a test reads (the file itself, or a file under a named directory). */
export function isDocReadByTests(path, docPathsRead) {
    return docPathsRead.some((read) => path === read || path.startsWith(`${read}/`))
}

/**
 * The `# tests / # pass / # fail / # skipped` trailer of a TAP report.
 * @param {string} tap
 * @returns {{ tests: number, pass: number, fail: number, skipped: number } | null}
 */
export function parseTapSummary(tap) {
    const read = (key) => {
        const match = tap.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))
        return match ? Number(match[1]) : null
    }
    const tests = read('tests')
    const pass = read('pass')
    const fail = read('fail')
    if (tests === null || pass === null || fail === null) return null
    return { tests, pass, fail, skipped: read('skipped') ?? 0 }
}

/**
 * Node's reporter flags for the runner: the spec reporter on stdout as before, plus a TAP copy in a
 * file so the counts can be recorded without capturing the child's output. They must precede the test
 * patterns on the command line — Node stops parsing options at the first positional.
 */
export function buildReporterArgs(tapFile) {
    return [
        '--test-reporter=spec',
        '--test-reporter-destination=stdout',
        '--test-reporter=tap',
        `--test-reporter-destination=${tapFile}`,
    ]
}

export function recordPath(root = repoRoot) {
    return join(root, RECORD_DIR, RECORD_FILE)
}

export function tapPath(root = repoRoot) {
    return join(root, RECORD_DIR, TAP_FILE)
}

export function ensureRecordDir(root = repoRoot) {
    mkdirSync(join(root, RECORD_DIR), { recursive: true })
}

/**
 * @param {object} input
 * @param {string[]} input.suites
 * @param {{ tests: number, pass: number, fail: number, skipped: number } | null} input.counts
 * @param {number} input.durationMs
 * @param {ReturnType<typeof fingerprintTree>} input.tree
 * @param {string} [input.at]
 */
export function buildRecord({ suites, counts, durationMs, tree, at = new Date().toISOString() }) {
    return {
        version: RECORD_VERSION,
        at,
        head: tree.head,
        suites: [...suites],
        counts,
        durationMs,
        coveredPaths: [...COVERED_PATHS],
        fingerprint: tree.fingerprint,
        dirty: tree.dirty,
        files: tree.files,
    }
}

export function writeRecord(record, root = repoRoot) {
    ensureRecordDir(root)
    writeFileSync(recordPath(root), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    return recordPath(root)
}

/** The record, or null when there is none or it is unreadable / from another version. */
export function readRecord(root = repoRoot) {
    const path = recordPath(root)
    if (!existsSync(path)) return null
    try {
        const record = JSON.parse(readFileSync(path, 'utf8'))
        if (record?.version !== RECORD_VERSION || typeof record.files !== 'object') return null
        return record
    } catch {
        return null
    }
}

export function isFullRun(suites) {
    return FULL_SUITES.every((suite) => suites.includes(suite))
}

/**
 * Whether the record still covers the tree.
 *
 * - `none`: no green record on this machine.
 * - `partial`: the record is green but not for the full suite set.
 * - `covered`: nothing a test can see has changed (docs no test names may have).
 * - `stale`: covered files changed; `changed` lists them, `unpinnedDocs` the docs no test reads.
 *
 * @param {ReturnType<typeof readRecord>} record
 * @param {ReturnType<typeof fingerprintTree>} tree
 * @param {string[]} docPathsRead
 */
export function compareRecord(record, tree, docPathsRead) {
    if (!record) return { status: 'none', changed: [], unpinnedDocs: [] }
    if (!isFullRun(record.suites)) return { status: 'partial', changed: [], unpinnedDocs: [] }
    const paths = new Set([...Object.keys(record.files), ...Object.keys(tree.files)])
    const changed = []
    const unpinnedDocs = []
    for (const path of [...paths].sort()) {
        if (record.files[path] === tree.files[path]) continue
        if (isDocPath(path) && !isDocReadByTests(path, docPathsRead)) unpinnedDocs.push(path)
        else changed.push(path)
    }
    return { status: changed.length === 0 ? 'covered' : 'stale', changed, unpinnedDocs }
}

/**
 * The files the failures of a TAP report were defined in, from each failure's `location:` line (Node
 * writes one for a failing test, a failing suite and a file that fails to load). Paths come back
 * repo-relative with forward slashes. A location outside the Node suites' `*.test.ts` files (a test
 * defined in a shared helper, say) is returned in `unresolved`: re-running one test file could not
 * stand in for it.
 *
 * @param {string} tap
 * @param {string} [root]
 * @returns {{ files: string[], unresolved: string[] }} both sorted, unique
 */
export function failedTestFilesFromTap(tap, root = repoRoot) {
    const files = new Set()
    const unresolved = new Set()
    let failing = false
    for (const line of tap.split(/\r?\n/)) {
        if (/^\s*not ok \d+/.test(line)) {
            failing = true
            continue
        }
        if (/^\s*ok \d+/.test(line)) {
            failing = false
            continue
        }
        if (!failing) continue
        const match = line.match(/^\s*location: '(.+)'\s*$/)
        if (!match) continue
        failing = false
        let path = match[1].replace(/\\\\/g, '\\').replace(/:\d+:\d+$/, '')
        if (path.startsWith('file://')) {
            try {
                path = fileURLToPath(path)
            } catch {
                path = decodeURIComponent(new URL(path).pathname)
            }
        }
        const relativePath = (isAbsolute(path) ? relative(root, path) : path).split(sep).join('/').replace(/\\/g, '/')
        const isSuiteTestFile =
            relativePath.endsWith('.test.ts') && Object.values(TEST_ROOTS).some((suiteRoot) => relativePath.startsWith(`${suiteRoot}/`))
        if (isSuiteTestFile) files.add(relativePath)
        else unresolved.add(relativePath)
    }
    return { files: [...files].sort(), unresolved: [...unresolved].sort() }
}

/**
 * The record of a full run that failed: the tree it saw, its counts, and the test files that failed.
 *
 * @param {object} input
 * @param {string[]} input.suites
 * @param {{ tests: number, pass: number, fail: number, skipped: number } | null} input.counts
 * @param {number} input.durationMs
 * @param {ReturnType<typeof fingerprintTree>} input.tree
 * @param {{ files: string[], unresolved: string[] }} input.failed
 * @param {string} [input.at]
 */
export function buildFailedRecord({ suites, counts, durationMs, tree, failed, at = new Date().toISOString() }) {
    return { ...buildRecord({ suites, counts, durationMs, tree, at }), failedFiles: [...failed.files], unresolvedFailures: [...failed.unresolved] }
}

export function failedRecordPath(root = repoRoot) {
    return join(root, RECORD_DIR, FAILED_RECORD_FILE)
}

export function writeFailedRecord(record, root = repoRoot) {
    ensureRecordDir(root)
    writeFileSync(failedRecordPath(root), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    return failedRecordPath(root)
}

/** The failed-run record, or null when there is none or it is unreadable / from another version. */
export function readFailedRecord(root = repoRoot) {
    const path = failedRecordPath(root)
    if (!existsSync(path)) return null
    try {
        const record = JSON.parse(readFileSync(path, 'utf8'))
        if (record?.version !== RECORD_VERSION || typeof record.files !== 'object' || !Array.isArray(record.failedFiles)) return null
        return record
    } catch {
        return null
    }
}

/** A green full run (or a green re-run of the failed files) leaves no failed record behind. */
export function clearFailedRecord(root = repoRoot) {
    rmSync(failedRecordPath(root), { force: true })
}

/**
 * Whether re-running only the failed test files can stand in for a full run.
 *
 * - `none`: no failed full run is recorded.
 * - `refuse`: something other than the failed test files changed since that run, a failure could not be
 *   tied to a test file, or the run failed with no failing file found; `reason` says which, `changed`
 *   lists the files.
 * - `run`: re-run `files`; `changed` lists which of them changed since the failed run.
 *
 * Sound because the failed run passed every other test on the recorded tree, and a test file is
 * imported by no other file: changing it cannot change another test's result.
 *
 * @param {ReturnType<typeof readFailedRecord>} failedRecord
 * @param {ReturnType<typeof fingerprintTree>} tree
 */
export function planFailedRerun(failedRecord, tree) {
    if (!failedRecord) return { status: 'none', reason: 'no failed full run is recorded', files: [], changed: [] }
    if (!isFullRun(failedRecord.suites)) return { status: 'refuse', reason: 'the failed run was not a full run', files: [], changed: [] }
    const files = [...failedRecord.failedFiles]
    if ((failedRecord.unresolvedFailures ?? []).length > 0) {
        return { status: 'refuse', reason: `failures outside the suites' test files: ${failedRecord.unresolvedFailures.join(', ')}`, files, changed: [] }
    }
    if (files.length === 0) return { status: 'refuse', reason: 'the failed run named no failing test file', files, changed: [] }
    const failedSet = new Set(files)
    const paths = new Set([...Object.keys(failedRecord.files), ...Object.keys(tree.files)])
    const changed = [...paths].filter((path) => failedRecord.files[path] !== tree.files[path]).sort()
    const others = changed.filter((path) => !failedSet.has(path))
    if (others.length > 0) {
        return { status: 'refuse', reason: `${others.length} other covered file(s) changed since the failed run`, files, changed: others }
    }
    return { status: 'run', reason: '', files, changed }
}

/**
 * The green record after the failed files re-ran green: the failed full run's record (its time, suites
 * and counts, failures included, so nothing claims the full run was clean), now covering the tree the
 * re-run saw, with the re-run noted.
 *
 * @param {NonNullable<ReturnType<typeof readFailedRecord>>} failedRecord
 * @param {object} input
 * @param {ReturnType<typeof fingerprintTree>} input.tree fingerprinted before the re-run
 * @param {string[]} input.files
 * @param {{ tests: number, pass: number, fail: number, skipped: number } | null} input.counts
 * @param {number} input.durationMs
 * @param {string} [input.at]
 */
export function recordFromFailedRerun(failedRecord, { tree, files, counts, durationMs, at = new Date().toISOString() }) {
    const { failedFiles: _failedFiles, unresolvedFailures: _unresolved, ...record } = failedRecord
    return {
        ...record,
        head: tree.head,
        fingerprint: tree.fingerprint,
        dirty: tree.dirty,
        files: tree.files,
        failedReruns: [{ at, files: [...files], counts, durationMs }],
    }
}

// ── `yarn test:affected`: its own record, and the calibration of its selection against full runs ────

/**
 * `yarn test:affected` writes its own record and never `last-green.json` or `last-failed.json`: a run of
 * the affected subset is an inner-loop check, not the push gate.
 */
export const AFFECTED_RECORD_FILE = 'last-affected.json'
/** One JSON line per full run: what `test:affected` would have selected for that run's changes, and what failed. */
export const CALIBRATION_FILE = 'affected-calibration.jsonl'
export const CALIBRATION_CHANGED_CAP = 200

export function affectedRecordPath(root = repoRoot) {
    return join(root, RECORD_DIR, AFFECTED_RECORD_FILE)
}

export function writeAffectedRecord(record, root = repoRoot) {
    ensureRecordDir(root)
    writeFileSync(affectedRecordPath(root), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    return affectedRecordPath(root)
}

/** The last affected run, or null when there is none or it is unreadable. */
export function readAffectedRecord(root = repoRoot) {
    try {
        const record = JSON.parse(readFileSync(affectedRecordPath(root), 'utf8'))
        return record && typeof record === 'object' && typeof record.fingerprint === 'string' ? record : null
    } catch {
        return null
    }
}

/**
 * The line `yarn test:needed` adds when the last affected run was green on exactly this tree. It is
 * information only: the full suite has still not run on the tree, so the exit code does not change.
 *
 * @param {ReturnType<typeof readAffectedRecord>} affected
 * @param {ReturnType<typeof fingerprintTree>} tree
 */
export function affectedRunNote(affected, tree) {
    if (!affected || affected.exit !== 0 || affected.fingerprint !== tree.fingerprint) return null
    return (
        `A green \`yarn test:affected\` run at ${affected.at} covered ${affected.changed?.length ?? 0} changed file(s) with ` +
        `${affected.selected?.length ?? 0} test file(s); the full suite has not run on this tree. Run \`yarn test\` before pushing.`
    )
}

export function calibrationPath(root = repoRoot) {
    return join(root, RECORD_DIR, CALIBRATION_FILE)
}

/**
 * One calibration line: the selection computed at the start of a full run, against that run's result.
 * A miss is a test file that failed although the selection skipped it. When a global input changed, the
 * selection would have been the full suite, so nothing can be missed.
 *
 * @param {object} input
 * @param {{ at?: string, baseHead?: string, baseAt?: string, changed: string[], globalInputs: string[], selected: string[], totalTestFiles: number, graphMs?: number } | null} input.selection
 * @param {{ files: string[], unresolved: string[] }} input.failed
 * @param {number} input.exit
 * @param {string} input.head
 * @param {string} [input.at]
 * @param {string | null} [input.unavailable] why no selection was computed
 */
export function buildCalibrationLine({ selection, failed, exit, head, at = new Date().toISOString(), unavailable = null }) {
    if (!selection) return { at, head, exit, unavailable: unavailable ?? 'no selection', failedFiles: [...failed.files] }
    const selected = new Set(selection.selected)
    const missed = selection.globalInputs.length > 0 ? [] : failed.files.filter((file) => !selected.has(file))
    return {
        at,
        head,
        exit,
        baseHead: selection.baseHead ?? null,
        baseAt: selection.baseAt ?? null,
        changedCount: selection.changed.length,
        changed: selection.changed.slice(0, CALIBRATION_CHANGED_CAP),
        globalInputs: [...selection.globalInputs],
        selectedCount: selection.selected.length,
        totalTestFiles: selection.totalTestFiles,
        graphMs: selection.graphMs ?? null,
        failedFiles: [...failed.files],
        unresolvedFailures: [...failed.unresolved],
        missed,
    }
}

export function appendCalibrationLine(line, root = repoRoot) {
    ensureRecordDir(root)
    appendFileSync(calibrationPath(root), `${JSON.stringify(line)}\n`, 'utf8')
}

/** Every readable calibration line; unreadable lines are skipped. */
export function readCalibrationLines(root = repoRoot) {
    let text = ''
    try {
        text = readFileSync(calibrationPath(root), 'utf8')
    } catch {
        return []
    }
    const lines = []
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
            lines.push(JSON.parse(line))
        } catch {
            // a torn write from an interrupted run
        }
    }
    return lines
}

/** Relative, forward-slash form of a path for messages. */
export function displayPath(path, root = repoRoot) {
    return relative(root, path).split(sep).join('/')
}

// ---------------------------------------------------------------------------------------------------------------
// Run hygiene (plans/tooling/test-suite-speed-plan.md, D2 and D5). Both are best-effort and fail open: a problem
// here is never a reason for the suite not to run or for its exit code to change.
// ---------------------------------------------------------------------------------------------------------------

/** More entries than this and the `tsx` cache costs more than it saves (D2): `tsx` lists the directory at every process start and looks each module up with a linear scan. */
export const TSX_CACHE_PURGE_THRESHOLD = 20000

/**
 * `tsx`'s on-disk transform cache: `<os.tmpdir()>/tsx-<effective uid, or the user name on Windows>`, the same
 * expression `tsx` itself uses (`node_modules/tsx/dist`, the `tsx-${…}` constant).
 */
export function tsxCacheDirectory({ tmp = tmpdir(), geteuid = process.geteuid, username = () => userInfo().username } = {}) {
    return join(tmp, `tsx-${geteuid ? geteuid.call(process) : username()}`)
}

/** Deletes a directory in a detached process, so the run never waits for tens of thousands of small files. */
export function deleteInBackground(path) {
    const child = spawn(process.execPath, ['-e', "require('node:fs').rmSync(process.argv[1], { recursive: true, force: true })", path], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
    })
    child.on('error', () => {})
    child.unref()
}

/**
 * Replaces a `tsx` cache directory of more than `threshold` entries: renames it (instant, atomic) and deletes the
 * renamed copy in the background. It only ever touches `dir` and the sibling name it renames it to, and only when
 * `dir` is named `tsx-<something>`. A missing directory, a failed count, rename or delete all return without
 * throwing; the run starts either way (a cold cache costs about 50 seconds once).
 *
 * @returns {{ action: 'none' | 'purged' | 'failed', entries: number | null, renamedTo?: string, error?: string }}
 */
export function purgeTsxCache({
    dir = tsxCacheDirectory(),
    threshold = TSX_CACHE_PURGE_THRESHOLD,
    exists = existsSync,
    readEntries = (path) => readdirSync(path),
    rename = renameSync,
    deleteDetached = deleteInBackground,
    now = Date.now,
} = {}) {
    try {
        if (!/^tsx-[^\\/]+$/.test(basename(dir)) || !exists(dir)) return { action: 'none', entries: null }
        const entries = readEntries(dir).length
        if (entries <= threshold) return { action: 'none', entries }
        const renamedTo = join(dirname(dir), `${basename(dir)}.purge-${now()}`)
        rename(dir, renamedTo)
        deleteDetached(renamedTo)
        return { action: 'purged', entries, renamedTo }
    } catch (error) {
        return { action: 'failed', entries: null, error: error instanceof Error ? error.message : String(error) }
    }
}

/** The file the per-file timer (`scripts/test-runtime/file-timer.mjs`) appends to, one JSON line per test file process. */
export const FILE_TIMES_FILE = 'file-times.jsonl'

/** The timer is a no-op unless this variable names the file to append to; only `run-node-tests.mjs` sets it. */
export const FILE_TIMES_ENV = 'TEST_FILE_TIMES_FILE'

export function fileTimesPath(root = repoRoot) {
    return join(root, RECORD_DIR, FILE_TIMES_FILE)
}

/** Parsed timer lines; a torn line from an interrupted run is skipped. */
export function readFileTimes(path = fileTimesPath()) {
    if (!existsSync(path)) return []
    const rows = []
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
            const row = JSON.parse(line)
            if (typeof row.file === 'string' && Number.isFinite(row.wallMs)) rows.push(row)
        } catch {
            // a torn write
        }
    }
    return rows
}

/** A test file's process stayed open this long after its last test: a timer or handle nobody cleared. */
export const LINGER_WARN_MS = 30000
/** A test file took this long, start to exit. */
export const SLOW_FILE_WARN_MS = 90000

/**
 * The slowest files of a run and the ones worth a warning. A file warns when its process stayed open `lingerWarnMs`
 * or more after its last test (the 2026-10-26 case: two files each held a slot for 300 s after passing in 5 s), or
 * took `slowWarnMs` or more in all.
 */
export function summariseFileTimes(rows, { top = 10, lingerWarnMs = LINGER_WARN_MS, slowWarnMs = SLOW_FILE_WARN_MS } = {}) {
    const slowest = [...rows].sort((a, b) => b.wallMs - a.wallMs).slice(0, top)
    const warnings = []
    for (const row of [...rows].sort((a, b) => b.wallMs - a.wallMs)) {
        if (Number.isFinite(row.lingerMs) && row.lingerMs >= lingerWarnMs) {
            warnings.push(`${row.file} stayed open ${seconds(row.lingerMs)} after its last test (a timer or handle nobody cleared)`)
        } else if (row.wallMs >= slowWarnMs) {
            warnings.push(`${row.file} took ${seconds(row.wallMs)}`)
        }
    }
    return { count: rows.length, slowest, warnings }
}

function seconds(ms) {
    return `${(ms / 1000).toFixed(1)} s`
}

/** The lines `run-node-tests.mjs` prints after a run; empty when no timer data exists (another project, or the preload is absent). */
export function formatFileTimes(summary) {
    if (summary.count === 0) return []
    const lines = [`Slowest test files (of ${summary.count}, process time):`]
    for (const row of summary.slowest) {
        const linger = Number.isFinite(row.lingerMs) && row.lingerMs >= 1000 ? `, open ${seconds(row.lingerMs)} after its last test` : ''
        lines.push(`  ${seconds(row.wallMs).padStart(8)}  ${row.file}${linger}`)
    }
    for (const warning of summary.warnings) lines.push(`Warning: ${warning}`)
    return lines
}
