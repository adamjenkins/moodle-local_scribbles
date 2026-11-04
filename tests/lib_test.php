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

namespace local_scribbles;

use local_scribbles\local\manager;

/**
 * Tests for refusing saved screenshots to anyone but their owner.
 *
 * Serving the file itself sets headers, which PHPUnit does not allow.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversFunction('local_scribbles_pluginfile')]
final class lib_test extends \advanced_testcase {
    /**
     * Load the callback.
     */
    public static function setUpBeforeClass(): void {
        global $CFG;
        parent::setUpBeforeClass();
        require_once($CFG->dirroot . '/local/scribbles/lib.php');
    }

    /**
     * Ask the callback for a saved screenshot's file.
     *
     * @param \context $context
     * @param string $filearea
     * @param \stored_file $file
     * @param int $itemid
     * @return false The callback's result when it refuses
     */
    private static function serve(\context $context, string $filearea, \stored_file $file, int $itemid) {
        return local_scribbles_pluginfile(
            null,
            null,
            $context,
            $filearea,
            [$itemid, $file->get_filename()],
            false
        );
    }

    /**
     * Nobody but the owner gets the file, and the owner only through the right file area, context and row.
     */
    public function test_only_the_owner_is_served(): void {
        $this->resetAfterTest();

        $generator = $this->getDataGenerator();
        $owner = $generator->create_user();
        $other = $generator->create_user();
        $record = $generator->get_plugin_generator('local_scribbles')->create_screenshot(['userid' => $owner->id]);
        $file = manager::get_file($record);
        $ownercontext = \context_user::instance($owner->id);

        // Another user, in the owner's context or their own.
        $this->setUser($other);
        $this->assertFalse(self::serve($ownercontext, manager::FILEAREA, $file, $record->id));
        $this->assertFalse(self::serve(\context_user::instance($other->id), manager::FILEAREA, $file, $record->id));

        // The owner, but not through another file area, another context or a row that is gone.
        $this->setUser($owner);
        $this->assertFalse(self::serve($ownercontext, 'other', $file, $record->id));
        $this->assertFalse(self::serve(\context_system::instance(), manager::FILEAREA, $file, $record->id));
        $this->assertFalse(self::serve($ownercontext, manager::FILEAREA, $file, $record->id + 1));
    }
}
