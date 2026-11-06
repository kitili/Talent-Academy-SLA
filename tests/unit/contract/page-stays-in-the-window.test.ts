import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * Text contracts: a layout cannot be measured under node:test. They pin the two rules that stop a page growing past
 * the window, and were checked in a browser at 1536x730 on every desk on 2026-11-06.
 */
const read = (path: string) => readFileSync(path, 'utf8')

test('the shell\'s scroll area is a positioned parent, so hidden absolute elements cannot stretch the page', () => {
    const shell = read('client/src/components/AcademyShell.tsx')
    const main = shell.match(/<main ref=\{mainRef\} className="([^"]+)"/)?.[1] ?? ''
    assert.match(main, /(^|\s)relative(\s|$)/)
    assert.match(main, /overflow-y-auto/)
    assert.match(main, /print:static/, 'on paper the page flows, so it must not stay a positioned scroll area')
})

test('from 1024 px the sign-in page is the window\'s height, and its form column scrolls by itself', () => {
    const auth = read('client/src/pages/unified-auth.tsx')
    assert.match(auth, /lg:flex lg:h-dvh lg:min-h-0 lg:overflow-hidden/)
    const column = auth.match(/className="(flex min-h-screen flex-1 flex-col[^"]+)"/)?.[1] ?? ''
    assert.match(column, /lg:h-dvh/)
    assert.match(column, /lg:overflow-y-auto/)
    assert.match(column, /lg:\[justify-content:safe_center\]/, 'plain centring would put the top of a tall form out of reach')
})
