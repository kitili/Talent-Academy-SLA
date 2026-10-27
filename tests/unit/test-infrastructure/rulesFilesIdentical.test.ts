import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * Claude, Codex and Cursor each read their own rules file, and `rules/rules.md` is the copy people read. They must
 * say the same thing, so every change is made in `.claude/CLAUDE.md` and copied over the other three. Line endings
 * are read as LF so a Windows checkout does not count as a difference.
 */
const SOURCE = '.claude/CLAUDE.md'
const COPIES = ['.codex/AGENTS.md', '.cursor/.cursorrules', 'rules/rules.md']

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

for (const copy of COPIES) {
    test(`${copy} is identical to ${SOURCE}`, () => {
        assert.equal(read(copy), read(SOURCE), `${copy} differs from ${SOURCE}; copy ${SOURCE} over it`)
    })
}
