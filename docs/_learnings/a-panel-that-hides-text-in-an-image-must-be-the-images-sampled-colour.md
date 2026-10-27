# A panel that hides text in an image must be the image's sampled colour, and sized to the image's own layout

**Scope:** transferable
**Area:** `client/src/components/SilverleafCertificate.tsx`, over `client/public/cert-fellowship.jpg` and `cert-advanced.jpg`.
**Status:** fixed on 2026-10-27 (feat/improvements)

## The symptom

Every certificate showed a rectangle a shade off the background around the Fellow's name. The rectangle also cut
through the bottom of the printed "CERTIFICATE OF COMPLETION" heading and reached the top of both signatures.

## Why it was misleading

The panel's navy (`#0d2454`) looked right in the code and close enough on a small preview, and its percentages
(`top-[37%] bottom-[24%]`) looked like "the middle of the certificate". Nobody compared either number to the image.

## Why it happens

Both template images carry a real person's name and wording, so the component paints a panel over them and draws its
own text. The image's navy is `#002367` (sampled with Pillow at several background points of both JPEGs); `#0d2454`
differs enough to show as a patch on a large certificate. The image's heading ends at about 39% of its height and its
signatures start at about 74%, so a panel from 37% to 76% overlaps both. The text sizes were in `vw`, so at some widths
the wording could also run past the panel.

## What to do

- Sample the colour from the image itself (`Image.open(f).convert("RGB").getpixel((x, y))` at a few background
  points); never pick it by eye. Keep it in one constant used by the frame and the panel.
- Measure where the image's own elements start and end (heading, signatures) and keep the panel between them.
- Size the drawn text in `cqw` on a `container-type: inline-size` frame, so it scales with the certificate, not
  the window, and stays inside the panel at every size.
- Check by measuring in the running page: the panel's top and bottom as a percentage of the frame, and the body
  text's bottom against the panel's bottom.
- If the page is printed to PDF, set `print-color-adjust: exact` on the frame. Browsers can leave out background
  colours when printing, which would drop the panel and show the hidden text. Headless Chrome's `--print-to-pdf` kept
  the panel even without it, so a headless print does not prove the setting is unneeded.
