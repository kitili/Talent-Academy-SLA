import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * Findings 4, 19 and 24 on the trainer desk. Text contracts over the page and the route file: they prove what
 * the page offers and which guard the route names, not what a browser draws.
 */

const page = readFileSync('client/src/pages/trainer-batches.tsx', 'utf8')
const routes = readFileSync('server/routes.ts', 'utf8')

test('the trainer desk offers no cohort Delete, and the server keeps cohort delete admin-only', () => {
    assert.doesNotMatch(page, /button-delete-batch-/)
    assert.doesNotMatch(page, /apiRequest\("DELETE", `\/api\/batches\/\$\{batchId\}`\)/)
    assert.match(routes, /app\.delete\("\/api\/batches\/:batchId", isAuthenticated, isAdmin, async/)
})

test('the Progress tab links a Fellow\'s lesson file history for a module they attempted', () => {
    assert.match(page, /href=\{`\/trainer\/teachers\/\$\{selectedTeacher\.id\}\/weeks\/\$\{attempt\.quiz\.weekId\}\/content-history`\}/)
    assert.match(page, /data-testid=\{`link-content-history-\$\{attempt\.id\}`\}/)
    const app = readFileSync('client/src/App.tsx', 'utf8')
    assert.match(app, /path="\/trainer\/teachers\/:teacherId\/weeks\/:weekId\/content-history"/)
})

test('the trainer desk says cohort for a cohort and Fellow for the learner', () => {
    assert.doesNotMatch(page, /(to|from|in) (this )?batch\b|Batch Schedule|Batch deleted|Select Week|Teacher progress/)
    assert.match(page, /Sessions and deadlines on your/)
    assert.match(page, /"Fellow added to the cohort"/)
    assert.match(page, /Where each Fellow is in each course of a cohort/)
})
