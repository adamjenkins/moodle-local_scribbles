# Scribbles (local_scribbles)

A Moodle local plugin that lets teachers draw on any Moodle page and take a
screenshot of it. A button opens a transparent drawing layer over the page,
with a toolbar of drawing tools. The result can be downloaded or saved to the
teacher's "My scribbles" page for later.

## Features

- **Button next to the edit mode switch**, or a link in the footer help (?)
  menu, or both (*Site administration → Plugins → Local plugins → Scribbles*).
- **Tools**: pen, highlighter, text, box, ellipse and eraser. Six preset
  colours and a custom colour picker, a size slider, undo (Ctrl/Cmd+Z) and
  clear all (which undo also reverses). Hold Shift with box or ellipse to draw
  a square or a circle. The last tool, colour and size are remembered in the
  browser (localStorage) from page to page.
- **Screenshots** of the visible page with the annotations on it:
  - *Download* saves a PNG to the computer.
  - *Save* stores it on the server in the user's own file area. *My scribbles*
    (`/local/scribbles/index.php`) lists saved screenshots with the page they
    were taken on, and lets the user download or delete them.
- **The X button** in the top right corner, or Escape, closes scribbles.

## How screenshots are taken

Screenshots use the browser's own screen capture
(`navigator.mediaDevices.getDisplayMedia`), which asks for the current tab.
The browser asks the user once, at the first screenshot after scribbles is
opened, to allow sharing of the tab, and the capture stops when scribbles is
closed. Browsers allow screen capture only on HTTPS sites. On a plain HTTP
site you can draw, but screenshots are not available. The image shows exactly what was on screen, whatever the theme or CSS.
No third-party library is used. Chrome and Edge suggest the current tab. In
Firefox and Safari the user picks it from a list.

While scribbles is open the page cannot be scrolled, because the drawing is
pinned to the visible part of the page.

## Who can use it

The capability `local/scribbles:use` (course level) is given to the
editingteacher, teacher and manager archetypes. Inside a course or activity
it is checked there. On pages outside courses (Dashboard, profile, front page,
admin pages), anyone who holds it in at least one course can use scribbles.
Users can always see and delete their own saved screenshots, even after they
lose the capability.

## Requirements

- Moodle 4.5 (`2024100700`) or later.
- A browser with `getDisplayMedia` for screenshots. Drawing works in every
  modern browser.

## Installation

1. Copy this plugin into `local/scribbles` in your Moodle codebase.
2. Visit *Site administration → Notifications* to install it.
3. Optionally, choose where the button appears at *Site administration →
   Plugins → Local plugins → Scribbles*.

## Privacy

Saved screenshots, with the URL and title of the page each was taken on, are
personal data of the user who saved them. They are kept in that user's
context. The privacy provider exports and deletes them. They are also deleted
when the user is deleted.

## License

2026 Adam Jenkins <adam@wisecat.net>

GNU GPL v3 or later. See [LICENSE](LICENSE).
