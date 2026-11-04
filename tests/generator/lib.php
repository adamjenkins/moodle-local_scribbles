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

use local_scribbles\local\manager;
use local_scribbles\local\pages;

/**
 * Data generator for local_scribbles.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class local_scribbles_generator extends component_generator_base {
    /**
     * Create a saved annotation page holding one box.
     *
     * @param array|stdClass $record userid and name; optionally pageurl and pagetitle
     * @return stdClass The record
     */
    public function create_page($record): stdClass {
        $record = (array) $record;
        $box = ['type' => 'box', 'colour' => '#e03131', 'size' => 4, 'x0' => 300, 'y0' => 300, 'x1' => 500, 'y1' => 400];
        return pages::save(
            0,
            (int) $record['userid'],
            \context_system::instance()->id,
            $record['pageurl'] ?? '',
            $record['pagetitle'] ?? 'Dashboard',
            $record['name'],
            json_encode(['items' => [$box]])
        );
    }

    /**
     * Create a saved screenshot holding a small image.
     *
     * @param array|stdClass $record userid; optionally pageurl and pagetitle
     * @return stdClass The record
     */
    public function create_screenshot($record): stdClass {
        $record = (array) $record;
        $image = imagecreatetruecolor(4, 3);
        ob_start();
        imagepng($image);
        $binary = ob_get_clean();
        return manager::save(
            (int) $record['userid'],
            \context_system::instance()->id,
            $record['pageurl'] ?? '',
            $record['pagetitle'] ?? 'Dashboard',
            base64_encode($binary)
        );
    }
}
