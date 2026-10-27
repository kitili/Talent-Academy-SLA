import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
    buildNodeTestArgs,
    TEST_RUNTIME_IMPORTS,
    buildTestPatterns,
    repoRoot,
    resolveSuites,
} from '../../../scripts/run-node-tests-config.mjs'

describe('run-node-tests command construction', () => {
    it('defaults to both Node test suites', () => {
        assert.deepEqual(resolveSuites([]), ['unit', 'integration'])
    })

    it('preserves an explicitly selected suite', () => {
        assert.deepEqual(resolveSuites(['integration']), ['integration'])
    })

    it('rejects unknown suite names before spawning Node', () => {
        assert.throws(
            () => resolveSuites(['unit', 'browser']),
            /Unknown test suite\(s\): browser[\s\S]*Expected one or more of: unit, integration/
        )
    })

    it('passes compact recursive globs instead of expanded test-file paths', () => {
        const suites = resolveSuites(['unit', 'integration'])

        assert.deepEqual(buildTestPatterns(suites), [
            'tests/unit/**/*.test.ts',
            'tests/integration/**/*.test.ts',
        ])
        assert.deepEqual(buildNodeTestArgs(suites), [
            ...TEST_RUNTIME_IMPORTS,
            '--test',
            'tests/unit/**/*.test.ts',
            'tests/integration/**/*.test.ts',
        ])
    })

    it('anchors test discovery at the repository root', () => {
        const expectedRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
        assert.equal(repoRoot, expectedRepoRoot)
    })
})
