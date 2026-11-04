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

namespace local_scribbles\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use local_scribbles\local\pages;

/**
 * List the current user's annotation pages, most recently saved first.
 *
 * No capability is needed: these are the user's own, like the My scribbles page.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_pages extends external_api {
    /** @var int How many pages the overlay's panel lists. */
    private const LIMIT = 100;

    /**
     * Returns description of method parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([]);
    }

    /**
     * List the pages.
     *
     * @return array
     */
    public static function execute(): array {
        global $DB, $USER;

        self::validate_context(\context_user::instance($USER->id));

        $records = $DB->get_records(
            pages::TABLE,
            ['userid' => $USER->id],
            'timemodified DESC, id DESC',
            'id, name, pagetitle, timemodified',
            0,
            self::LIMIT
        );

        $list = [];
        foreach ($records as $record) {
            $list[] = [
                'id' => (int) $record->id,
                'name' => $record->name,
                'pagetitle' => (string) $record->pagetitle,
                'timemodified' => userdate($record->timemodified, get_string('strftimedatetime', 'langconfig')),
            ];
        }
        return ['pages' => $list];
    }

    /**
     * Returns description of method result value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'pages' => new external_multiple_structure(new external_single_structure([
                'id' => new external_value(PARAM_INT, 'Id of the annotation page'),
                'name' => new external_value(PARAM_TEXT, 'Name of the annotation page'),
                'pagetitle' => new external_value(PARAM_TEXT, 'Title of the Moodle page it was drawn on'),
                'timemodified' => new external_value(PARAM_TEXT, 'When it was last saved, formatted for display'),
            ])),
        ]);
    }
}
