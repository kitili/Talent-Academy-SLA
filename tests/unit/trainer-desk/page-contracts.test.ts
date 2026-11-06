import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * TEXT CONTRACTS over the Trainer's pages and the Reopen dialog. They prove what the source wires and which routes it
 * names, not what a browser draws; the browser run in T3 covers that.
 */

const read = (path: string) => readFileSync(path, 'utf8')
const trainer = read('client/src/pages/trainer-batches.tsx')
const cohort = read('client/src/pages/cohort-workspace.tsx')
const reopen = read('client/src/components/ReopenDialog.tsx')
const session = read('client/src/components/SessionDialog.tsx')
const adminHome = read('client/src/pages/admin-home.tsx')

test('the Trainer page has no Schedule section and sends ?tab=schedule to the Calendar', () => {
    assert.doesNotMatch(trainer, /renderSchedule|schedule: render|data-testid="trainer-week"/)
    assert.match(trainer, /trainerTabRedirect\(search\)/)
    assert.match(trainer, /setLocation\(moved\)/)
    assert.doesNotMatch(trainer, /from the timetable/)
    assert.match(trainer, /Desk mail with your Fellows and the Admin/)
})

test('Attendance carries the export buttons and keeps the marking form off the printout', () => {
    assert.match(trainer, /action=\{selectedBatch && <AttendanceExportButtons csvHref=\{`\/api\/batches\/\$\{selectedBatch\.id\}\/attendance\.csv`\} \/>\}/)
    assert.match(trainer, /<div className="print:hidden">\r?\n\s*<Panel title=\{`Mark attendance for/)
})

test('Progress keeps Download CSV, adds Download PDF, and draws the chart from the chart tokens, not green', () => {
    assert.match(trainer, /data-testid="link-download-csv"/)
    assert.match(trainer, /data-testid="button-download-marks-pdf"/)
    assert.match(trainer, /fill="hsl\(var\(--chart-1\)\)"/)
    assert.doesNotMatch(trainer, /<Bar [^>]*(green|#[0-9a-fA-F]{6})/)
    assert.match(trainer, /<ProgressChart rows=\{batchProgress\} \/>/)
})

test('the cohort room has one Assessments tab and a Materials tab', () => {
    assert.doesNotMatch(cohort, /<TabsTrigger value="(quizzes|work)"/)
    assert.doesNotMatch(cohort, /<TabsContent value="(quizzes|work)"/)
    assert.equal((cohort.match(/<TabsTrigger value="assessments"/g) || []).length, 1)
    assert.match(cohort, /useState\(cohortTabFromSearch\(linked\.get\("tab"\)\)\)/)
    assert.match(cohort, /<TabsTrigger value="materials"/)
})

test('materials upload through ObjectUploader and use the materials routes', () => {
    assert.match(cohort, /<ObjectUploader/)
    assert.doesNotMatch(cohort, /method: "PUT"[^}]*body:/)
    assert.match(cohort, /`\/api\/batches\/\$\{batchId\}\/materials`/)
    assert.match(cohort, /"DELETE", `\/api\/batches\/\$\{batchId\}\/materials\/\$\{id\}`/)
    assert.match(cohort, /Given to \{audienceLabel\(item\.audience\)\}/)
})

test('Reopen is on quizzes, exams and written work in both pages, through one dialog', () => {
    assert.match(trainer, /<ReopenDialog target=\{reopenTarget\}/)
    assert.match(cohort, /<ReopenDialog target=\{reopenTarget\}/)
    for (const page of [trainer, cohort]) assert.match(page, /kind: "assignment"/)
    for (const page of [trainer, cohort]) assert.match(page, /kind: "quiz"/)
    assert.match(reopen, /"POST", "\/api\/deadlines\/reopen"/)
    assert.match(reopen, /\/api\/deadlines\/reopenings\?kind=/)
    assert.match(reopen, /reopenBody\(/)
    assert.doesNotMatch(reopen, /dueDate: due\b/)
})

test('scheduling from the Calendar refreshes the Trainer\'s Home sessions', () => {
    assert.match(session, /query\.queryKey\[0\] === "\/api\/batches" && query\.queryKey\[2\] === "events"/)
})

test('Admin Home carries the photo and the daily line', () => {
    assert.match(adminHome, /<DeskPhoto desk="admin" \/>/)
    assert.match(adminHome, /<DailyLine \/>/)
    assert.match(trainer, /<DeskPhoto desk="trainer" \/>/)
    assert.match(trainer, /<KindBadge \/>/)
    assert.doesNotMatch(trainer, /<DailyLine/)
})
