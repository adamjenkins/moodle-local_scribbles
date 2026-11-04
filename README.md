# Scribbles (local_scribbles)

A Moodle local plugin that lets teachers draw on any Moodle page and take a
screenshot of it. A button opens a transparent drawing layer over the page,
with a toolbar of drawing tools. Annotations stay editable after they are drawn
and can be saved as an annotation page to open again later. A screenshot can be
downloaded or saved to the teacher's "My scribbles" page.

## Features

- **Button next to the edit mode switch**, or a link in the footer help (?)
  menu, or both (*Site administration → Plugins → Local plugins → Scribbles*).
- **Tools**: select, pen, highlighter, text, box, ellipse and eraser (which
  removes each annotation it touches). Six preset
  colours and a custom colour picker, a size slider, undo (Ctrl/Cmd+Z) and
  clear all (which undo also reverses). Hold Shift with box or ellipse to draw
  a square or a circle. The last tool, colour and size are remembered in the
  browser (localStorage) from page to page.
- **Edit annotations** with the select tool: click one to select it, drag it to
  move it, drag a corner to resize it, or pick a colour to recolour it. Click it
  again to swap the corner handles for rotate handles. Delete removes it. Hold
  Shift to keep proportions when resizing or to rotate in 15 degree steps. Undo
  covers all of this.
- **Annotation pages** save the annotations themselves, separately from
  screenshots. The toolbar's annotation pages button names and saves the current
  annotations, and lists saved pages to open on the current Moodle page. *My
  scribbles* lists them too, and *Open* there goes back to the Moodle page they
  were drawn on. Annotations stay where they were on the screen, so they line up
  best in a window of the same size. Opening one is undoable. Saving an opened
  page updates it, or *Save as new* makes a copy. Saved pages can be deleted from
  the same list or from *My scribbles*; screenshots are deleted from *My scribbles*.
- **Screenshots** of the visible page with the annotations on it:
  - *Download* saves a PNG to the computer.
  - *Save* stores it on the server in the user's own file area. *My scribbles*
    (`/local/scribbles/index.php`) lists saved screenshots with the page they
    were taken on, and lets the user download or delete them.
- **The X button** appears exactly where the navigation bar button that opens
  scribbles is, so the same spot turns it on and off. If that button is not on
  the page (footer link only), the X is in the top right corner. Escape also
  closes scribbles, after first closing the pages panel or clearing a selection.

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
Users can always see and delete what they saved, even after they lose the
capability.

The capability carries `RISK_PERSONAL`: a screenshot shows whatever was on the
screen, so one of a gradebook, say, stores students' personal data in the
teacher's own area, where only that teacher can see it.

Each user may keep 100 screenshots and 100 annotation pages by default. Change
the limits, or set 0 for none, at *Site administration → Plugins → Local plugins
→ Scribbles*.

## Requirements

- Moodle 5.2 (`2026042000`) or later.
- A browser with `getDisplayMedia` for screenshots. Drawing works in every
  modern browser.

## Installation

1. Copy this plugin into `local/scribbles` in your Moodle codebase.
2. Visit *Site administration → Notifications* to install it.
3. Optionally, choose where the button appears at *Site administration →
   Plugins → Local plugins → Scribbles*.

## Privacy

Saved screenshots and annotation pages, with the URL and title of the page each
was made on, are personal data of the user who saved them. They are kept in that
user's context. The privacy provider exports and deletes them. They are also
deleted when the user is deleted. A saved page URL never keeps its `sesskey`.

## License

2026 Adam Jenkins <adam@wisecat.net>

GNU GPL v3 or later. See [LICENSE](LICENSE).
