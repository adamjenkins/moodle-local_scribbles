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
use local_scribbles\local\access;
use local_scribbles\local\manager;
use local_scribbles\local\pages;

/**
 * Save annotations as an annotation page of the current user.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_page extends external_api {
    /**
     * Returns description of method parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'id' => new external_value(PARAM_INT, 'Annotation page to update, 0 for a new one', VALUE_DEFAULT, 0),
            'contextid' => new external_value(PARAM_INT, 'Context id of the Moodle page it is drawn on'),
            'pageurl' => new external_value(PARAM_RAW, 'URL of the Moodle page', VALUE_DEFAULT, ''),
            'pagetitle' => new external_value(PARAM_RAW, 'Title of the Moodle page', VALUE_DEFAULT, ''),
            'name' => new external_value(PARAM_RAW, 'Name for the annotation page', VALUE_DEFAULT, ''),
            'data' => new external_value(PARAM_RAW, 'The annotations as JSON'),
        ]);
    }

    /**
     * Save the page.
     *
     * @param int $id
     * @param int $contextid
     * @param string $pageurl
     * @param string $pagetitle
     * @param string $name
     * @param string $data
     * @return array
     */
    public static function execute(int $id, int $contextid, string $pageurl, string $pagetitle, string $name, string $data): array {
        global $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'id' => $id,
            'contextid' => $contextid,
            'pageurl' => $pageurl,
            'pagetitle' => $pagetitle,
            'name' => $name,
            'data' => $data,
        ]);

        $context = \context::instance_by_id($params['contextid']);
        self::validate_context($context);
        if (!access::can_use($context)) {
            throw new \required_capability_exception($context, access::CAPABILITY, 'nopermissions', '');
        }

        // Titles and names are free text and may hold a "<", which PARAM_TEXT would refuse as a parameter.
        $url = manager::clean_page_url($params['pageurl']);

        $record = pages::save(
            $params['id'],
            (int) $USER->id,
            $context->id,
            $url,
            clean_param($params['pagetitle'], PARAM_TEXT),
            clean_param($params['name'], PARAM_TEXT),
            $params['data']
        );

        return ['id' => (int) $record->id, 'name' => $record->name];
    }

    /**
     * Returns description of method result value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'id' => new external_value(PARAM_INT, 'Id of the annotation page'),
            'name' => new external_value(PARAM_TEXT, 'Name it was saved with'),
        ]);
    }
}
