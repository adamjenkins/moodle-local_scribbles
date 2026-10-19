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

namespace local_scribbles\local;

/**
 * Hooks API callbacks for local_scribbles.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class hook_callbacks {
    /**
     * Add the "Annotate this page" link to the footer help menu.
     *
     * In Boost the standard footer HTML is the body of the "?" popover.
     *
     * @param \core\hook\output\before_standard_footer_html_generation $hook
     * @return void
     */
    public static function before_standard_footer_html(
        \core\hook\output\before_standard_footer_html_generation $hook
    ): void {
        $hook->add_html(ui::footer_link());
    }
}
