# Event screens: agenda and speaker slides, editable decks

The screens shown in the room during an event: an opening slide with the slogan, an agenda, one
slide per speaker. They are the print family moved to pixels, so they follow the same lock, the
same composition and the same measurement habits; what changes is colour space, resolution and
the client's wish to edit a name at 17:55. Extends `slides-and-decks.md`; brand-neutral.

## 1. Format

- Ask for the output resolution; event screens are 16:9 at Full HD or 4K (3 840 × 2 160). Build
  in pixels of that frame and render vector type at that size; a 4K deck is not an upscaled HD
  deck.
- RGB, not CMYK: the ground under a photographic key visual is the image's own colour (sampled),
  brand colours in RGB from the lock, no Ghostscript colour pass. Render PNGs at the exact pixel
  size and a PDF deck whose page is the frame in points (1 px = 0.25 pt at 4K).
- Deliver three things: the PNG per slide (named by position and subject), the PDF deck, and,
  when the client must edit, an editable PowerPoint (§4). The PNGs drop onto any system's blank
  slides as a fallback.

## 2. Speaker slides

- One composition for every speaker: portrait in a 3:4 frame on the ground side, type beside it,
  the key visual on the far side with its feature fully inside the frame. Place the feature by
  its measured relative position in the image (fraction of width and height), never by a pixel
  value remembered from another crop.
- The portrait: cut out (§3), on one light neutral grey sampled from the best-lit photo
  (around rgb 206/210/212), with a soft shadow generated from the silhouette, in a frame with a
  hairline offset behind it. The hairline's weight is matched to a line already on the screen
  (measured core width of the key visual's outlines, 9 px at 4K); when the client asks for the
  frame "like the map lines", that is the number they mean.
- Crop per person with two fractions (`fx`, `fy`: which part of the photo the frame keeps) and
  an optional zoom. A subject whose shoulder is cut by the photograph's own edge looks cut out;
  enlarge and push the frame edge past the shoulder so the frame does the cropping, with the back
  whole inside.
- Type stack: a tracked eyebrow ("SPEAKING") whose cap top sits on the portrait's top edge, the
  name in the display serif on two lines (given names, then family name), the role on its own
  lines as the client breaks them, the institution a tone softer beneath. No rules between them;
  tighten until the client stops asking.
- Soft photographs: say the upscale factor per portrait in the delivery note (2.7 × from a 387 px
  source is soft on a 4K wall) and ask for larger originals early.
- Diacritics: a face whose comma-below glyph sits off the stem can be corrected in the rendered
  deck by drawing the base letter and a comma placed under the stem by hand (comma at about
  0.78 em, 0.17 em below the baseline, centred on 0.46 of the letter's advance); the editable
  deck keeps the font's own glyph and says so.

## 3. Portrait cut-outs, locally

- macOS 14 and later ships a foreground segmenter (Vision `VNGenerateForegroundInstanceMaskRequest`);
  a 25-line Swift tool compiled with `swiftc` cuts a person out with no upload and no account.
  Scaffold tool: `tools/cutout.swift`.
- The matte needs a second pass (`tools/prep-cutouts.mjs`): erode the alpha by 2 px, cap blue at
  the edge pixels where a blue backdrop bled into hair (a distance-gated despill for the hair
  region of the one photo that needs it), and build the shadow at quarter size from the blurred
  silhouette, drawn offset right and down under the figure.
- Reject a photo with a burned-in credit or watermark in the crop; use the other photo of the
  same person before asking for a new one.

## 4. Editable deck from plates

An editable PowerPoint keeps every line of type as a text box and everything else as images:

1. Export plates from the same build: one background per composition (ground, imagery, veil,
   rings, stripe; no type, no logo) and one portrait composite per speaker (grey, shadow,
   cut-out), both at the output pixel size.
2. Generate the deck (pptxgenjs, widescreen layout) placing plates as slide backgrounds, the
   logo as an image, the hairline frame as a shape, and each text run as a text box at the
   geometry of the rendered deck: with exact line spacing the first baseline sits about 0.8 × the
   line spacing below the box top. Record the geometry source once and derive, never retype
   numbers per slide.
3. **Embed the fonts** when the faces are not Office-bundled: convert each TTF to Embedded
   OpenType (`ttf2eot`), store as `ppt/fonts/fontN.fntdata`, add the `fntdata` content type,
   relationships of type `…/relationships/font` on the presentation part, and a
   `<p:embeddedFontLst>` right after `<p:notesSz>` with `embedTrueTypeFonts="1"`. Scaffold tool:
   `tools/embed-fonts.mjs`. PowerPoint (Windows, and Mac 16.17 or later) then shows the faces
   without installation; ship the licence-permitting TTFs beside the deck for programs that
   ignore embedded fonts.
4. Gate: the package validator (schema, relationships, content types), a text dump in slide
   order, and a render through LibreOffice (headless) compared with the PDF deck. Driving
   PowerPoint through AppleScript blocks on its sandbox file-access dialogs; do not rely on it.
5. Keep the plate PDFs light: downsample portrait sources to about 2 000 px before embedding or
   the deck grows to tens of megabytes for nothing.

## 5. Agenda slide

Two columns of four entries, name in the sans bold, role on one line, institution a tone softer
beneath, session headings as tracked small capitals with a hairline, the moderator line in the
accent, no footer when the event line already sits under the title. Heights computed from the
font's own widths so the cocktail line never collides with the foot.
