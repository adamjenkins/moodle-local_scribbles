# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- Hammer and gun tools: a click smashes the screen like broken glass or shoots a
  bullet hole in it. Both shake the screen briefly, except with reduced
  motion. Each break is stored as a `smash` or `shot` annotation with
  two corners and a random `seed`, so it looks the same when an annotation page
  is opened again.

### Changed

- Supports Moodle 5.1 as well (requires `2025100600`, supported 5.1 to 5.3).

## [0.1.1] - 2026-11-04

### Added

- `composer.json` for Packagist, and the camp listing and release workflow.

## [0.1.0] - 2026-11-04

### Added

- A drawing layer over any page, opened from a button next to the edit mode
  switch and/or a footer help menu link (setting `buttonlocation`).
- Pen, highlighter, text, box, ellipse and eraser tools, colours, size, undo
  and clear. The last tool, colour and size are remembered per browser.
- Screenshots via browser tab capture: download as PNG, or save to the
  `local_scribbles` table and the user's file area, listed on
  `/local/scribbles/index.php`.
- A select tool: move, resize, rotate, recolour and delete annotations after
  drawing them, all undoable. The eraser removes whole annotations.
- Annotation pages: save the annotations themselves (table
  `local_scribbles_pages`) and open them again from the toolbar or My scribbles.
  Delete them from the same list or from My scribbles.
- The close button sits over the navbar button, which toggles scribbles.
- Settings `maxscreenshots` and `maxpages`: how many each user may keep.
- Capability `local/scribbles:use` (`RISK_PERSONAL`), external functions
  `local_scribbles_save_screenshot`, `local_scribbles_save_page`,
  `local_scribbles_delete_page`, `local_scribbles_get_pages` and
  `local_scribbles_get_page`, privacy provider,
  and clean-up when a user is deleted.
