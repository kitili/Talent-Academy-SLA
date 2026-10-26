#!/usr/bin/env node
/**
 * Flag SQL that qualifies syntax constructs as pg_catalog functions.
 *
 * `coalesce` and `current_user` are SQL syntax, not functions in pg_catalog, so
 * `pg_catalog.coalesce(...)` / `pg_catalog.current_user` fail at run time with
 * error 42883 — after the migration has already started. This is the one-off
 * check to run over a new migration bucket before it is applied; it is not a
 * suite test on purpose (applied migrations are never edited, so a history that
 * holds the mistake and its forward repair would need a permanent exception
 * list). See docs/_learnings/pg-catalog-coalesce-is-syntax-not-a-function.md.
 *
 *   node scripts/database/check-sql-catalog-qualification.mjs migrations/<bucket>
 *   node scripts/database/check-sql-catalog-qualification.mjs path/to/one.sql another.sql
 *
 * Exit code 1 when any file hits, with file:line for each hit.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const RULE = /pg_catalog\.(?:coalesce|current_user)\b/i

function collect(target, out = []) {
    const stat = statSync(target)
    if (stat.isDirectory()) {
        for (const entry of readdirSync(target, { withFileTypes: true })) {
            collect(path.join(target, entry.name), out)
        }
    } else if (target.toLowerCase().endsWith('.sql')) {
        out.push(target)
    }
    return out
}

const targets = process.argv.slice(2)
if (targets.length === 0) {
    console.error('Pass one or more .sql files or folders to check.')
    process.exit(2)
}

let files = 0
let hits = 0
for (const target of targets) {
    for (const file of collect(target)) {
        files++
        const lines = readFileSync(file, 'utf8').split(/\r?\n/)
        lines.forEach((line, index) => {
            if (RULE.test(line)) {
                hits++
                console.log(`${file}:${index + 1}: ${line.trim()}`)
            }
        })
    }
}

console.log(`${files} file(s) checked, ${hits} hit(s).`)
process.exit(hits > 0 ? 1 : 0)
