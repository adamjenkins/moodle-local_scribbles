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
 * Stores, finds and deletes saved screenshots.
 *
 * Each screenshot is a local_scribbles row plus one image file in the owner's
 * user context (component local_scribbles, filearea screenshot, itemid = row id).
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class manager {
    /** @var string File area holding the images. */
    public const FILEAREA = 'screenshot';

    /** @var int Largest accepted image, in bytes after base64 decoding. */
    public const MAX_BYTES = 8388608;

    /** @var array Accepted image types and the file extension each is stored with. */
    private const TYPES = [
        IMAGETYPE_PNG => 'png',
        IMAGETYPE_JPEG => 'jpg',
    ];

    /**
     * Save a screenshot for a user.
     *
     * @param int $userid Owner
     * @param int $contextid Context of the page the screenshot was taken on
     * @param string $pageurl Page URL (already cleaned to a local URL, or '')
     * @param string $pagetitle Page title
     * @param string $imagedata A data: URL or bare base64 PNG/JPEG
     * @return \stdClass The new local_scribbles record
     */
    public static function save(
        int $userid,
        int $contextid,
        string $pageurl,
        string $pagetitle,
        string $imagedata
    ): \stdClass {
        global $DB;

        $binary = self::decode_image($imagedata);
        $info = getimagesizefromstring($binary);
        if ($info === false || !isset(self::TYPES[$info[2]])) {
            throw new \moodle_exception('errorinvalidimage', 'local_scribbles');
        }

        $now = time();
        $record = (object) [
            'userid' => $userid,
            'contextid' => $contextid,
            'pageurl' => $pageurl,
            'pagetitle' => \core_text::substr($pagetitle, 0, 1333),
            'timecreated' => $now,
        ];

        $transaction = $DB->start_delegated_transaction();
        $record->id = $DB->insert_record('local_scribbles', $record);

        $fs = get_file_storage();
        $fs->create_file_from_string([
            'contextid' => \context_user::instance($userid)->id,
            'component' => 'local_scribbles',
            'filearea' => self::FILEAREA,
            'itemid' => $record->id,
            'filepath' => '/',
            'filename' => 'scribble-' . date('Ymd-His', $now) . '.' . self::TYPES[$info[2]],
            'userid' => $userid,
        ], $binary);
        $transaction->allow_commit();

        return $record;
    }

    /**
     * The image file of a screenshot.
     *
     * @param \stdClass $record local_scribbles record
     * @return \stored_file|null
     */
    public static function get_file(\stdClass $record): ?\stored_file {
        $context = \context_user::instance($record->userid, IGNORE_MISSING);
        if (!$context) {
            return null;
        }
        $files = get_file_storage()->get_area_files(
            $context->id,
            'local_scribbles',
            self::FILEAREA,
            $record->id,
            'id',
            false
        );
        return $files ? reset($files) : null;
    }

    /**
     * Delete one screenshot and its image.
     *
     * @param \stdClass $record local_scribbles record
     * @return void
     */
    public static function delete(\stdClass $record): void {
        global $DB;

        $context = \context_user::instance($record->userid, IGNORE_MISSING);
        if ($context) {
            get_file_storage()->delete_area_files($context->id, 'local_scribbles', self::FILEAREA, $record->id);
        }
        $DB->delete_records('local_scribbles', ['id' => $record->id]);
    }

    /**
     * Delete all of a user's screenshots.
     *
     * @param int $userid
     * @param int $usercontextid The user's context id (passed in because the
     *     context may already be gone when the user is being deleted)
     * @return void
     */
    public static function delete_all_for_user(int $userid, int $usercontextid): void {
        global $DB;

        get_file_storage()->delete_area_files($usercontextid, 'local_scribbles', self::FILEAREA);
        $DB->delete_records('local_scribbles', ['userid' => $userid]);
    }

    /**
     * Decode a data: URL or bare base64 string, enforcing the size limit.
     *
     * @param string $imagedata
     * @return string Binary image data
     */
    private static function decode_image(string $imagedata): string {
        $base64 = preg_replace('~^data:image/(png|jpeg);base64,~', '', trim($imagedata));
        // Base64 is 4 bytes per 3: reject oversized input before decoding it.
        if (strlen($base64) > self::MAX_BYTES / 3 * 4 + 4) {
            throw new \moodle_exception('errorimagetoolarge', 'local_scribbles', '', display_size(self::MAX_BYTES));
        }
        $binary = base64_decode($base64, true);
        if ($binary === false || $binary === '') {
            throw new \moodle_exception('errorinvalidimage', 'local_scribbles');
        }
        if (strlen($binary) > self::MAX_BYTES) {
            throw new \moodle_exception('errorimagetoolarge', 'local_scribbles', '', display_size(self::MAX_BYTES));
        }
        return $binary;
    }
}
