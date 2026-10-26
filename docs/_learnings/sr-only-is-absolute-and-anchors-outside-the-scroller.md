# `sr-only` is absolute positioning, and it anchors outside the scroller

**Scope:** transferable
**Area:** MCP consent screen layout, 2026-09-18

## The symptom

The consent card was rebuilt as a fixed-height column: pinned header, a body
that scrolls inside the card, pinned footer. It looked right at 1536×823 and at
375×812. Nothing was visibly wrong.

Measuring it anyway showed the page wrapper on the phone size had gained
**139px of scrollable overflow**. The wrapper was `overflow-y-auto` as a
backstop, so no scrollbar drew and no test could see it; a thumb swipe outside
the body would have shifted the whole card upward and back, on the one screen
that is supposed to hold still.

## Why it was misleading

The organization picker uses `<input type="radio" className="sr-only">` so the
label is the visible control. Tailwind's `sr-only` is

```css
position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden;
clip: rect(0,0,0,0); white-space: nowrap; border-width: 0;
```

It is **absolutely positioned**, with no `top`/`left`, so it sits at its static
position — where it would have been in flow, deep in the organization list —
but it is laid out relative to its *containing block*: the nearest positioned
ancestor. That ancestor was the `relative` wrapper that holds the scroll
region and the fade gradient, not the scroll region itself. So the inputs for
organizations far down the list were placed 1,400px below the top of a
wrapper 264px tall, did not scroll with the list, and extended the wrapper's
scrollable overflow. The wrapper is `overflow: visible`, so that overflow
propagated up through the card to the page wrapper, which is where it became
scrollable.

On desktop the two-column grid kept every static position inside the
scroller's visible range, so the same markup measured clean there. It was
the phone's single column that pushed one far enough down to show.

## The rule

**An absolutely positioned descendant of a scroll region belongs to whatever
positioned ancestor it finds, not to the scroller.** If that ancestor is
outside the scroll region, the element neither scrolls with the content nor
stays within the scroller's box, and its static position becomes overflow on
something else. `sr-only` is the common way to plant one of these without
noticing, because nothing is visible to be wrong.

Make the scroll container itself `relative` (or the label that owns the
input). The input then anchors inside the scroller, scrolls with its label,
and any overflow it contributes is the scroller's own.

## The check

For any fixed-height layout with an inner scroll region, measure rather than
look:

```js
const body = document.querySelector('<scroller>')
const main = document.querySelector('main')
;({ bodyScroll: body.scrollHeight, bodyClient: body.clientHeight,
    mainScroll: main.scrollHeight, mainClient: main.clientHeight })
```

`mainScroll` must equal `mainClient`. If it does not, look for
`position: absolute` — `sr-only`, tooltips, badges — anchored above the
scroller. Check the narrowest breakpoint, not the widest: single columns put
static positions furthest down.
