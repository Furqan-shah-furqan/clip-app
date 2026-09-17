# Caption editor: card layout and editable text box

This change is limited to the caption editor, font assets, and caption burn styling. The YouTube/source downloaders, clip selection, generation worker, transcription routes, Whisper settings, and word-timing/grouping functions are unchanged.

## Controls

- Rounded black/white tool cards on a light gray canvas, inspired by the supplied reference. The preview stays beside the cards on desktop; small screens stack the cards.
- Drag the caption center to move it. Drag side handles to change width and reflow the phrase. Top/bottom handles change height and scale text; corners scale the frame and text together. Width and height sliders are available in Text Box & Position. Height zero uses automatic content height.
- Double-click a spoken caption or choose **Edit words**. Click a word to fix its spelling or replace it. Enter/Done saves; Escape restores the original phrase. Corrections preserve all word start/end times. Empty replacements and multiple words in one word slot are rejected; this is word correction, not transcription regeneration.
- Left, center, and right alignment controls; rotation from -360 through +360 degrees. The frame rotates with its text, and drag calculations follow the rotated axes.
- The selected preset has a white border. Presets preserve the chosen box geometry, alignment, position, and rotation.
- Stronger ordinary shadows, separate from neon glow. The new motion choices use stable word elements, so already displayed words are not recreated on every update.
- Fifteen fonts are bundled for browser and FFmpeg use. Impact, Arial Black, and Georgia are replaced by the redistributable Anton, Archivo Black, and Libre Caslon Text. Existing settings for those three families map to the corresponding bundled alternative.

## Export

The browser measures line wrapping with the selected font. Export uses those line breaks, alignment, line spacing, rotation origin, and independent shadow layers. Existing per-word event start/end timestamps are preserved. Browser CSS and libass use different animation engines; motion easing and background rounding are not pixel-identical.

## Validation

`npm run test:captions`: **31 passing tests**, including:

- Word corrections, cancel/revert, invalid replacements, and protection against refresh during editing.
- Width/height/corner resizing, resizing after rotation, and alignment/geometry persistence through presets and saving.
- Measured wrapping, long words in narrow boxes, and ASS alignment/rotation/shadows.
- All 15 selectable font families resolved by real FFmpeg/libass, plus an actual captioned MP4 export.
- The existing caption queue, polling, recovery, sync conflict, pause, repeated-word, Urdu, and timestamp regression tests.

Additionally, the caption generation/timing helper functions and clip generation functions were compared byte-for-byte with base commit `4501faba85b986018b53f5d02cf03f789c66e403` and were unchanged. A real multiline rotated/shadowed caption frame was rendered and inspected.

Full browser visual testing could not be completed: the cloud browser policy blocked local and standalone preview URLs. Interaction tests use an event-capable DOM test double, not a real browser. No production transcription or clip generation was triggered during testing.

## Review before deployment

Open an existing clip with saved captions and hard refresh. Check the desktop and mobile layouts, correct a word and reload, drag all handle types at 0 and 90 degrees, select a font/preset/animation, and download the styled video. Keep Sync Audio untouched during this editor-only check. Verify an existing silence interval and word timing against the original clip. No new environment variables or paid services are needed.
