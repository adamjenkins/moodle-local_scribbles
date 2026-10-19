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

/**
 * Save an annotated screenshot to the current user's scribbles.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_screenshot extends external_api {
    /**
     * Returns description of method parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'contextid' => new external_value(PARAM_INT, 'Context id of the page the screenshot was taken on'),
            'pageurl' => new external_value(PARAM_RAW, 'URL of the page', VALUE_DEFAULT, ''),
            'pagetitle' => new external_value(PARAM_TEXT, 'Title of the page', VALUE_DEFAULT, ''),
            'image' => new external_value(PARAM_RAW, 'PNG or JPEG image as a data: URL or base64'),
        ]);
    }

    /**
     * Save the screenshot.
     *
     * @param int $contextid
     * @param string $pageurl
     * @param string $pagetitle
     * @param string $image
     * @return array
     */
    public static function execute(int $contextid, string $pageurl, string $pagetitle, string $image): array {
        global $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'contextid' => $contextid,
            'pageurl' => $pageurl,
            'pagetitle' => $pagetitle,
            'image' => $image,
        ]);

        $context = \context::instance_by_id($params['contextid']);
        self::validate_context($context);
        if (!access::can_use($context)) {
            throw new \required_capability_exception($context, access::CAPABILITY, 'nopermissions', '');
        }

        // Only links back into this site are kept.
        $url = clean_param($params['pageurl'], PARAM_LOCALURL);

        $record = manager::save((int) $USER->id, $context->id, $url, $params['pagetitle'], $params['image']);

        return [
            'id' => (int) $record->id,
            'listurl' => (new \moodle_url('/local/scribbles/index.php'))->out(false),
        ];
    }

    /**
     * Returns description of method result value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'id' => new external_value(PARAM_INT, 'Id of the saved screenshot'),
            'listurl' => new external_value(PARAM_URL, 'URL of the saved scribbles page'),
        ]);
    }
}
