# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - Unreleased

### Added

- A drawing layer over any page, opened from a button next to the edit mode
  switch and/or a footer help menu link (setting `buttonlocation`).
- Pen, highlighter, text, box, ellipse and eraser tools, colours, size, undo
  and clear. The last tool, colour and size are remembered per browser.
- Screenshots via browser tab capture: download as PNG, or save to the
  `local_scribbles` table and the user's file area, listed on
  `/local/scribbles/index.php`.
- Capability `local/scribbles:use`, external function
  `local_scribbles_save_screenshot`, privacy provider, and clean-up when a
  user is deleted.
