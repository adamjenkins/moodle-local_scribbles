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
 * Admin settings for local_scribbles.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_scribbles', get_string('pluginname', 'local_scribbles'));

    $settings->add(new admin_setting_configselect(
        'local_scribbles/buttonlocation',
        get_string('buttonlocation', 'local_scribbles'),
        get_string('buttonlocation_desc', 'local_scribbles'),
        \local_scribbles\local\ui::LOCATION_NAVBAR,
        [
            \local_scribbles\local\ui::LOCATION_NAVBAR => get_string('buttonlocation_navbar', 'local_scribbles'),
            \local_scribbles\local\ui::LOCATION_FOOTER => get_string('buttonlocation_footer', 'local_scribbles'),
            \local_scribbles\local\ui::LOCATION_BOTH => get_string('buttonlocation_both', 'local_scribbles'),
        ]
    ));

    $ADMIN->add('localplugins', $settings);
}
