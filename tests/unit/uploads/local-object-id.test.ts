import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'
import { ObjectNotFoundError, ObjectStorageService, isLocalObjectId } from '../../../server/objectStorage.ts'

/** `GET` and `PUT /api/local-objects/:id` pass `:id` to these methods, so an id that is not a UUID must never reach a path. */
describe('local upload ids', () => {
    it('accepts the ids uploads are given', () => {
        assert.equal(isLocalObjectId(randomUUID()), true)
    })

    it('refuses anything else', () => {
        for (const bad of ['../../.env', '..\\..\\.env', '.env', 'a', '', `${randomUUID()}/../x`, `x${randomUUID()}`, null, undefined, 7]) {
            assert.equal(isLocalObjectId(bad), false, String(bad))
        }
    })

    it('never reads or writes outside the upload folder', async () => {
        const service = new ObjectStorageService()
        await assert.rejects(service.readLocalObject('../../package.json'), ObjectNotFoundError)
        await assert.rejects(service.saveLocalObject('../../tmp/should-not-exist', Buffer.from('x')), ObjectNotFoundError)
    })
})
