<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Library callbacks for local_scribbles.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Add the scribbles button to the navbar, right after the edit mode switch.
 *
 * Core has no hook for navbar items yet (core_renderer::navbar_plugin_output()
 * still calls this legacy callback), so this stays a lib.php function.
 *
 * @param renderer_base $renderer
 * @return string HTML
 */
function local_scribbles_render_navbar_output(renderer_base $renderer): string {
    return \local_scribbles\local\ui::navbar_button($renderer);
}

/**
 * Serve saved screenshots, to their owner only.
 *
 * @param stdClass $course
 * @param stdClass|null $cm
 * @param context $context
 * @param string $filearea
 * @param array $args
 * @param bool $forcedownload
 * @param array $options
 * @return bool false if the file was not found
 */
function local_scribbles_pluginfile($course, $cm, $context, $filearea, $args, $forcedownload, array $options = []) {
    global $DB, $USER;

    if ($context->contextlevel != CONTEXT_USER || $filearea !== \local_scribbles\local\manager::FILEAREA) {
        return false;
    }

    require_login(null, false);
    if ((int) $context->instanceid !== (int) $USER->id) {
        return false;
    }

    $itemid = (int) array_shift($args);
    if (!$DB->record_exists('local_scribbles', ['id' => $itemid, 'userid' => $USER->id])) {
        return false;
    }

    $filename = array_pop($args);
    $filepath = $args ? '/' . implode('/', $args) . '/' : '/';
    $fs = get_file_storage();
    $file = $fs->get_file($context->id, 'local_scribbles', $filearea, $itemid, $filepath, $filename);
    if (!$file || $file->is_directory()) {
        return false;
    }

    send_stored_file($file, 0, 0, $forcedownload, $options);
}
