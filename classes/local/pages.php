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
 * Stores and checks saved annotation pages.
 *
 * The annotations are only ever drawn on a canvas, never put into HTML, but they
 * come from the browser, so what is stored is rebuilt from the checked values.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class pages {
    /** @var string Table holding the pages. */
    public const TABLE = 'local_scribbles_pages';

    /** @var int Pages a user may keep unless the maxpages setting says otherwise. */
    public const DEFAULT_MAX_PAGES = 100;

    /** @var int Largest accepted page data, in bytes. */
    public const MAX_BYTES = 4194304;

    /** @var string[] Annotations drawn as a freehand stroke. */
    private const STROKES = ['pen', 'highlighter'];

    /** @var string[] Annotations drawn between two corners. */
    private const SHAPES = ['box', 'ellipse'];

    /** @var float Largest coordinate accepted, in pixels. */
    private const MAX_COORDINATE = 1000000.0;

    /** @var int Longest text annotation accepted, in characters. */
    private const MAX_TEXT = 10000;

    /**
     * Save a new annotation page, or update one of the user's own.
     *
     * @param int $id Page to update, 0 for a new one
     * @param int $userid Owner
     * @param int $contextid Context of the Moodle page it is drawn on
     * @param string $pageurl Moodle page URL (already cleaned to a local URL, or '')
     * @param string $pagetitle Moodle page title
     * @param string $name Name for the page; the Moodle page title when empty
     * @param string $data The annotations, as JSON
     * @return \stdClass The saved record
     */
    public static function save(
        int $id,
        int $userid,
        int $contextid,
        string $pageurl,
        string $pagetitle,
        string $name,
        string $data
    ): \stdClass {
        global $DB;

        $now = time();
        $name = trim($name) !== '' ? trim($name) : trim($pagetitle);
        $record = (object) [
            'userid' => $userid,
            'contextid' => $contextid,
            'pageurl' => $pageurl,
            'pagetitle' => \core_text::substr($pagetitle, 0, 1333),
            'name' => \core_text::substr($name !== '' ? $name : get_string('untitledpage', 'local_scribbles'), 0, 255),
            'data' => self::clean_data($data),
            'timemodified' => $now,
        ];

        if ($id) {
            $record->id = $DB->get_field(self::TABLE, 'id', ['id' => $id, 'userid' => $userid], MUST_EXIST);
            $DB->update_record(self::TABLE, $record);
        } else {
            $limit = get_config('local_scribbles', 'maxpages');
            $limit = $limit === false ? self::DEFAULT_MAX_PAGES : (int) $limit;
            if ($limit > 0 && $DB->count_records(self::TABLE, ['userid' => $userid]) >= $limit) {
                throw new \moodle_exception('errortoomanypages', 'local_scribbles', '', $limit);
            }
            $record->timecreated = $now;
            $record->id = $DB->insert_record(self::TABLE, $record);
        }
        return $record;
    }

    /**
     * One of a user's own annotation pages.
     *
     * @param int $id
     * @param int $userid
     * @return \stdClass The record
     */
    public static function get_own(int $id, int $userid): \stdClass {
        global $DB;

        return $DB->get_record(self::TABLE, ['id' => $id, 'userid' => $userid], '*', MUST_EXIST);
    }

    /**
     * Check annotation page data and rebuild it from the checked values.
     *
     * @param string $data JSON from the browser
     * @return string JSON to store
     */
    public static function clean_data(string $data): string {
        if (strlen($data) > self::MAX_BYTES) {
            throw new \moodle_exception('errorpagetoolarge', 'local_scribbles', '', display_size(self::MAX_BYTES));
        }
        $decoded = json_decode($data, true);
        if (!is_array($decoded) || !isset($decoded['items']) || !is_array($decoded['items'])) {
            throw new \moodle_exception('errorinvalidpage', 'local_scribbles');
        }
        return json_encode([
            'items' => array_map([self::class, 'clean_item'], array_values($decoded['items'])),
            'scrolltop' => self::number($decoded['scrolltop'] ?? 0),
            'pagescrolltop' => self::number($decoded['pagescrolltop'] ?? 0),
        ]);
    }

    /**
     * Check one annotation and keep only the values it should have.
     *
     * @param mixed $item
     * @return array
     */
    private static function clean_item($item): array {
        if (!is_array($item) || !isset($item['type'], $item['colour']) || !is_string($item['colour'])) {
            throw new \moodle_exception('errorinvalidpage', 'local_scribbles');
        }
        if (!preg_match('/^#[0-9a-f]{6}$/i', $item['colour'])) {
            throw new \moodle_exception('errorinvalidpage', 'local_scribbles');
        }
        $clean = ['type' => $item['type'], 'colour' => strtolower($item['colour'])];
        if (!empty($item['angle'])) {
            $clean['angle'] = self::number($item['angle']);
        }

        if (in_array($item['type'], self::STROKES, true)) {
            if (empty($item['points']) || !is_array($item['points'])) {
                throw new \moodle_exception('errorinvalidpage', 'local_scribbles');
            }
            $clean['size'] = self::size($item['size'] ?? null);
            $clean['points'] = array_map([self::class, 'point'], array_values($item['points']));
        } else if (in_array($item['type'], self::SHAPES, true)) {
            $clean['size'] = self::size($item['size'] ?? null);
            foreach (['x0', 'y0', 'x1', 'y1'] as $key) {
                $clean[$key] = self::number($item[$key] ?? null);
            }
        } else if ($item['type'] === 'text') {
            $text = $item['text'] ?? null;
            if (!is_string($text) || $text === '' || \core_text::strlen($text) > self::MAX_TEXT) {
                throw new \moodle_exception('errorinvalidpage', 'local_scribbles');
            }
            $fontsize = self::number($item['fontsize'] ?? null);
            if ($fontsize <= 0) {
                throw new \moodle_exception('errorinvalidpage', 'local_scribbles');
            }
            $clean += ['fontsize' => $fontsize, 'x' => self::number($item['x'] ?? null), 'y' => self::number($item['y'] ?? null)];
            $clean['text'] = $text;
        } else {
            throw new \moodle_exception('errorinvalidpage', 'local_scribbles');
        }
        return $clean;
    }

    /**
     * Check a number is one a drawing could contain.
     *
     * @param mixed $value
     * @return float|int
     */
    private static function number($value) {
        if ((!is_int($value) && !is_float($value)) || abs($value) > self::MAX_COORDINATE) {
            throw new \moodle_exception('errorinvalidpage', 'local_scribbles');
        }
        return $value;
    }

    /**
     * Check a brush size.
     *
     * @param mixed $value
     * @return int
     */
    private static function size($value): int {
        if (!is_int($value) || $value < 1 || $value > 20) {
            throw new \moodle_exception('errorinvalidpage', 'local_scribbles');
        }
        return $value;
    }

    /**
     * Check one point of a stroke.
     *
     * @param mixed $point
     * @return array [x, y]
     */
    private static function point($point): array {
        if (!is_array($point) || count($point) !== 2 || !isset($point[0], $point[1])) {
            throw new \moodle_exception('errorinvalidpage', 'local_scribbles');
        }
        return [self::number($point[0]), self::number($point[1])];
    }
}
