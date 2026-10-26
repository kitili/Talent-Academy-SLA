# A field that renders plain beside one that renders Markdown teaches the model nothing

**Scope:** transferable
**Area:** Live Report text (`src/components/live-report/ReportBlocks.tsx`, the Word export in
`src/utils/live-report/wordExport/`), and any schema that takes model-written strings in more than
one field.
**Status:** designed out for Live Reports on 2026-09-30
(`plans/live-report/report-inline-formatting-plan.md`). The trap stays open for the next schema.

## The symptom

A client-facing risk report showed its Key Findings as a wall of text with the asterisks visible:

```
**Observed here:** … **Why it matters:** … **Recommendation:** …
```

The Recommendations list above it showed `**Confirm ownership** …` the same way. The Executive
Summary, three paragraphs further up in the same report, rendered its bold correctly.

## Why it was misleading

The model wrote the same Markdown everywhere, and it had every reason to: a skill taught findings as
bold-label lines. What differed was the field. `paragraph.text` and `callout.text` went through the
Markdown renderer. `recommendation.detail`, list items, key/value values, table cells and captions
were `{text}` in JSX and plain runs in Word. Nothing in the schema, the tool description or the
normalizer said so. The normalizer even treated `detail` as prose: it has the paragraph length limit
and keeps newlines.

The first two drafts of that report would have rendered correctly: the findings were in paragraphs.
A validation hint moved them. The drafts used `heading` blocks, which do not exist, and the hint said
"a heading is a new section". Inside Key Findings, a spine section, that would have moved the
findings out of the section. So the model chose the only block with a title, `recommendation`, and
put the prose in its `detail`. The validator accepted it with `"warnings": []`. Each step was
reasonable, and only the reader showed the result.

## The check

For every schema whose strings a model writes:

1. List each text field and what the renderer does with it, in every renderer (screen, file,
   email). If the answers differ between fields, the model's instructions must say which is which.
2. Grep the renderer for `{field}` in JSX next to a Markdown component in the same file.
3. Put a string with `**x**` into every field of a fixture and render it. Assert where `<strong>`
   appears and where `**` survives. `tests/unit/live-report/reportBlocks.test.ts` does this.
4. Read your validation hints as the model will: the fix a hint names must work *where the error
   happened*, not only in general.

## The remedy

Three field classes, stated once (`src/utils/live-report/reportInlineMarkdown.ts`) and applied in the
reader, the Word export, the harness validator and both `create_report` descriptions:

- **Prose:** full Markdown.
- **Inline:** marks and links, with block syntax switched off in the tokenizer.
- **Label:** plain text.

A finding became a `finding` block, whose labels the reader draws. The harness warns when Markdown
lands in a label field, or when the finding triad is written as bold text. The heading-tag hint now
says a titled item in a spine section is a `finding`.

## Evidence

- Staging trace `01a0f0ea-28d9-7232-bb52-4abacf10bddb` (2026-09-30, 06:05 to 06:08 UTC): five
  drafts and four `create_report` calls. The findings moved from `paragraph` to
  `recommendation.detail` between v2 and v3. The stored v4 had 3 bold labels in each of 4 details,
  and a bold lead in each of 4 list items.
- Before the fix: `ReportBlocks.tsx` rendered `<div>{detail}</div>` and `<li>{item}</li>`, and
  `buildReportWordBlob.ts` wrote `new TextRun({ text: block.detail })`.
