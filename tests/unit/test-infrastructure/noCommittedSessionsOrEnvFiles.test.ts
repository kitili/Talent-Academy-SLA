import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * A committed Playwright storage state is a working sign-in for whoever reads the repository, and a committed
 * `.env` hands out its keys. Both are easy to commit by accident: a storage state an E2E setup step saves holds a
 * live production session, and a service's `.env` holds its third-party API keys. Make E2E sessions at run time
 * and commit only `.env.*.example` templates.
 */
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)

test('no Playwright storage state is tracked', () => {
    assert.deepEqual(
        tracked.filter((file) => file.startsWith('playwright/.auth/')),
        []
    )
    assert.doesNotMatch(readFileSync('.gitignore', 'utf8'), /^!playwright\/\.auth\//m)
})

test('no .env file is tracked (only .env.*.example templates)', () => {
    assert.deepEqual(
        tracked.filter((file) => /(^|\/)\.env$/.test(file)),
        []
    )
})
