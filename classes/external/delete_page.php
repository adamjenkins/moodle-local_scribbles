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
use core_external\external_single_structure;
use core_external\external_value;
use local_scribbles\local\pages;

/**
 * Delete one of the current user's annotation pages.
 *
 * No capability is needed: these are the user's own, like the My scribbles page.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class delete_page extends external_api {
    /**
     * Returns description of method parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'id' => new external_value(PARAM_INT, 'Id of the annotation page'),
        ]);
    }

    /**
     * Delete the page.
     *
     * @param int $id
     * @return array
     */
    public static function execute(int $id): array {
        global $DB, $USER;

        $params = self::validate_parameters(self::execute_parameters(), ['id' => $id]);
        self::validate_context(\context_user::instance($USER->id));

        $record = pages::get_own($params['id'], (int) $USER->id);
        $DB->delete_records(pages::TABLE, ['id' => $record->id]);

        return ['deleted' => true];
    }

    /**
     * Returns description of method result value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'deleted' => new external_value(PARAM_BOOL, 'Whether the page was deleted'),
        ]);
    }
}
