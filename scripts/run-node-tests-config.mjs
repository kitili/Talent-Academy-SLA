/**
 * This project's test settings: the suites, the preloads, the paths a green run covers and the paths tests read as
 * text. The runner scripts (`run-node-tests.mjs`, `test-run-record.mjs`, `test-needed.mjs`, `run-doc-tests.mjs`,
 * `run-failed-tests.mjs`) hold none of their own; adapt this file, not them.
 *
 * Written by the bootstrap kit as a starting point (`skills/bootstrapping-a-project`, *Run The Kit*): add every path
 * a test imports or reads to `COVERED_PATHS`, or `test:needed` will miss changes to it.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const TEST_ROOTS = Object.freeze({
    unit: 'tests/unit',
    integration: 'tests/integration',
})

/**
 * @param {string[]} requestedSuites
 * @returns {(keyof typeof TEST_ROOTS)[]}
 */
export function resolveSuites(requestedSuites) {
    const suites = requestedSuites.length > 0 ? requestedSuites : ['unit', 'integration']
    const unknownSuites = suites.filter((suite) => !Object.hasOwn(TEST_ROOTS, suite))

    if (unknownSuites.length > 0) {
        throw new Error(
            `Unknown test suite(s): ${unknownSuites.join(', ')}\n` +
                `Expected one or more of: ${Object.keys(TEST_ROOTS).join(', ')}`
        )
    }

    return /** @type {(keyof typeof TEST_ROOTS)[]} */ (suites)
}

/**
 * Node expands these globs internally. Keeping them as patterns avoids passing hundreds
 * of file paths through Windows' limited process command line.
 *
 * @param {(keyof typeof TEST_ROOTS)[]} suites
 * @returns {string[]}
 */
export function buildTestPatterns(suites) {
    return suites.map((suite) => `${TEST_ROOTS[suite]}/**/*.test.ts`)
}

/**
 * @param {(keyof typeof TEST_ROOTS)[]} suites
 * @returns {string[]}
 */
export function buildNodeTestArgs(suites) {
    return [...TEST_RUNTIME_IMPORTS, '--test', ...buildTestPatterns(suites)]
}

/** The preloads every test script starts Node with: tsx, so `.test.ts` files run without a build. */
export const TEST_RUNTIME_IMPORTS = Object.freeze(['--import', 'tsx'])

/**
 * Paths whose content the Node suites execute, import or read as text. A change anywhere else never needs the
 * suite. Add each path a test imports or reads from outside these.
 *
 * The default fits a Next.js project (the `src/` or the root layout, `middleware.ts`, the config, the lockfiles). A
 * path the project does not have is harmless: the runner asks git for the paths that exist and ignores the rest.
 * Trim the list to the project's own layout when you adapt it.
 */
export const COVERED_PATHS = Object.freeze([
    'src',
    'app',
    'pages',
    'components',
    'lib',
    'tests',
    'scripts',
    'docs',
    'skills',
    'rules',
    '.claude/CLAUDE.md',
    '.codex/AGENTS.md',
    '.cursor/.cursorrules',
    'middleware.ts',
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'package.json',
    'yarn.lock',
    'package-lock.json',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'next-env.d.ts',
    'public',
    // This project: a Vite + React client, an Express server, shared types and rules, the Vercel function, SQL.
    'client',
    'server',
    'shared',
    'api',
    'supabase',
    'vite.config.ts',
    'drizzle.config.ts',
    'tailwind.config.ts',
    'postcss.config.js',
    'components.json',
    'vercel.json',
])

/**
 * Covered paths that tests read as text rather than run: the docs, the skills and the rules files. A change
 * confined to them has a known blast radius, the test files that name the changed paths (`test:docs`); one of
 * them that no test names does not make the last green run stale.
 */
export const DOC_PATHS = Object.freeze(['docs', 'skills', 'rules', '.claude/CLAUDE.md', '.codex/AGENTS.md', '.cursor/.cursorrules'])
