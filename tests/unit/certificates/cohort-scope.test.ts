import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { certificateCohortAccess } from '../../../server/certificateEligibility.ts'

/** N6 (C4): a trainer reads and changes a cohort's certificate rows only for cohorts they run. */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const cohorts: Record<string, { trainerId?: string | null; trainerIds?: string[] }> = {
    mine: { trainerId: 'trainer1', trainerIds: ['trainer1'] },
    coRun: { trainerId: 'someone', trainerIds: ['someone', 'trainer1'] },
    theirs: { trainerId: 'someone', trainerIds: ['someone'] },
}
const getBatch = async (id: string) => cohorts[id]
const trainer = { id: 'trainer1', role: 'trainer' }

test('a trainer reaches the certificates of a cohort they run, and no other', async () => {
    assert.equal(await certificateCohortAccess(trainer, 'mine', getBatch), 'allowed')
    assert.equal(await certificateCohortAccess(trainer, 'coRun', getBatch), 'allowed')
    assert.equal(await certificateCohortAccess(trainer, 'theirs', getBatch), 'denied')
})

test('an admin reaches every cohort; a missing cohort is missing, not open to any staff', async () => {
    assert.equal(await certificateCohortAccess({ id: 'a', role: 'admin' }, 'theirs', getBatch), 'allowed')
    assert.equal(await certificateCohortAccess(trainer, 'nowhere', getBatch), 'missing')
    assert.equal(await certificateCohortAccess({ id: 'a', role: 'admin' }, 'nowhere', getBatch), 'missing')
})

/** Text contract (route wiring cannot be driven without the database): every cohort certificate route asks first. */
test('the cohort certificate routes call the scope check before they read or write', () => {
    const routes = read('server/routes.ts')
    for (const route of [
        'app.get("/api/batches/:batchId/certificates"',
        'app.get("/api/batches/:batchId/certificate-template"',
        'app.post("/api/batches/:batchId/certificate-template"',
        'app.post("/api/batches/:batchId/certificate-template/approve"',
    ]) {
        const start = routes.indexOf(route)
        assert.ok(start > 0, `${route} exists`)
        const handler = routes.slice(start, routes.indexOf('\n  });', start))
        const check = handler.indexOf('if (!(await certificateCohortAllowed(req, res, req.params.batchId))) return;')
        const storageCall = handler.indexOf('storage.')
        assert.ok(check > 0 && check < storageCall, `${route} checks cohort scope before storage`)
    }
    const helper = routes.slice(routes.indexOf('async function certificateCohortAllowed'))
    assert.match(helper, /const access = await certificateCohortAccess\(req\.user, batchId\);\r?\n/)
})

test('a certificate read by id checks the Fellow is in the trainer\'s cohorts', () => {
    const routes = read('server/routes.ts')
    const start = routes.indexOf('app.get("/api/certificates/:certId"')
    const handler = routes.slice(start, routes.indexOf('\n  });', start))
    assert.match(handler, /if \(!\(await teacherRecordAllowed\(req, cert\.teacherId\)\)\) \{\r?\n\s+return res\.status\(403\)/)
})
