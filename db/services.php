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
 * External functions for local_scribbles.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_scribbles_save_screenshot' => [
        'classname' => 'local_scribbles\external\save_screenshot',
        'methodname' => 'execute',
        'description' => 'Save an annotated screenshot to the current user\'s scribbles',
        'type' => 'write',
        'ajax' => true,
        'capabilities' => 'local/scribbles:use',
    ],
    'local_scribbles_save_page' => [
        'classname' => 'local_scribbles\external\save_page',
        'methodname' => 'execute',
        'description' => 'Save annotations as an annotation page of the current user',
        'type' => 'write',
        'ajax' => true,
        'capabilities' => 'local/scribbles:use',
    ],
    'local_scribbles_delete_page' => [
        'classname' => 'local_scribbles\external\delete_page',
        'methodname' => 'execute',
        'description' => 'Delete one of the current user\'s annotation pages',
        'type' => 'write',
        'ajax' => true,
    ],
    'local_scribbles_get_pages' => [
        'classname' => 'local_scribbles\external\get_pages',
        'methodname' => 'execute',
        'description' => 'List the current user\'s annotation pages',
        'type' => 'read',
        'ajax' => true,
    ],
    'local_scribbles_get_page' => [
        'classname' => 'local_scribbles\external\get_page',
        'methodname' => 'execute',
        'description' => 'Get one of the current user\'s annotation pages',
        'type' => 'read',
        'ajax' => true,
    ],
];
