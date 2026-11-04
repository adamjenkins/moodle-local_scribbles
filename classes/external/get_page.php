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
 * Get one of the current user's annotation pages, to bring it back.
 *
 * No capability is needed: these are the user's own, like the My scribbles page.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_page extends external_api {
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
     * Get the page.
     *
     * @param int $id
     * @return array
     */
    public static function execute(int $id): array {
        global $USER;

        $params = self::validate_parameters(self::execute_parameters(), ['id' => $id]);
        self::validate_context(\context_user::instance($USER->id));

        $record = pages::get_own($params['id'], (int) $USER->id);

        return [
            'id' => (int) $record->id,
            'name' => $record->name,
            'pageurl' => (string) $record->pageurl,
            'data' => $record->data,
        ];
    }

    /**
     * Returns description of method result value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'id' => new external_value(PARAM_INT, 'Id of the annotation page'),
            'name' => new external_value(PARAM_TEXT, 'Name of the annotation page'),
            'pageurl' => new external_value(PARAM_RAW, 'URL of the Moodle page it was drawn on'),
            'data' => new external_value(PARAM_RAW, 'The annotations as JSON'),
        ]);
    }
}
