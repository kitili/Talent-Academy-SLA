# A hidden absolute element escapes a scroll area with no positioned parent

**Scope:** transferable
**Area:** `client/src/components/AcademyShell.tsx`, any scroll container holding a Radix `Select` or an `sr-only` element
**Status:** fixed on 2026-11-06 by making the shell's `main` `relative`

## The symptom

On Certificates, the page scrolled twice. Scrolling the window lifted the whole shell off the top and left a blank area below it, with a second scrollbar inside. The document was 1105 px tall in a 730 px window, although the shell was a fixed `h-dvh` with `overflow-hidden`.

## Why it was misleading

Nothing visible was too tall, and the page's content was correct. It looked like a sizing bug on that one page, and its long form suggested the form was at fault. Short pages showed nothing, so the fault seemed specific.

## Why it happens

`overflow` clips only descendants whose containing block is inside the clipping element. Radix `Select` renders a 1 px hidden native `<select>` with `position: absolute`, as `sr-only` does. With no positioned ancestor, its containing block is the root, so `overflow-y-auto` on `main` does not clip it, and it sits at its place in the long scrolled content. An invisible 1 px element then sets the document's height.

## How to avoid it

Give a scroll container `position: relative`. To find the cause, compare `documentElement.scrollHeight` with `innerHeight`, then list elements with `position: absolute` whose bottom is past the window.
