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

namespace local_scribbles\privacy;

use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;
use local_scribbles\local\manager;
use local_scribbles\local\pages;

/**
 * Tests for the local_scribbles privacy provider.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(\local_scribbles\privacy\provider::class)]
final class provider_test extends \core_privacy\tests\provider_testcase {
    /**
     * Save a small PNG screenshot for a user.
     *
     * @param int $userid
     * @param string $title
     * @return \stdClass
     */
    private static function save_for(int $userid, string $title): \stdClass {
        $image = imagecreatetruecolor(2, 2);
        ob_start();
        imagepng($image);
        $binary = ob_get_clean();
        return manager::save($userid, \context_system::instance()->id, '/course/view.php?id=2', $title, base64_encode($binary));
    }

    /**
     * Contexts, users, and export cover only the owner's own user context.
     */
    public function test_contexts_users_and_export(): void {
        $this->resetAfterTest();

        $owner = $this->getDataGenerator()->create_user();
        $other = $this->getDataGenerator()->create_user();
        $record = self::save_for($owner->id, 'Biology');
        $ownercontext = \context_user::instance($owner->id);

        $this->assertEquals([$ownercontext->id], provider::get_contexts_for_userid($owner->id)->get_contextids());
        $this->assertEmpty(provider::get_contexts_for_userid($other->id)->get_contextids());

        $userlist = new userlist($ownercontext, 'local_scribbles');
        provider::get_users_in_context($userlist);
        $this->assertEquals([$owner->id], $userlist->get_userids());

        $userlist = new userlist(\context_user::instance($other->id), 'local_scribbles');
        provider::get_users_in_context($userlist);
        $this->assertEmpty($userlist->get_userids());

        provider::export_user_data(new approved_contextlist($owner, 'local_scribbles', [$ownercontext->id]));
        $writer = writer::with_context($ownercontext);
        $subcontext = [get_string('pluginname', 'local_scribbles'), $record->id];
        $this->assertSame('Biology', $writer->get_data($subcontext)->pagetitle);
        $this->assertEquals(\context_system::instance()->id, $writer->get_data($subcontext)->contextid);
        $files = $writer->get_files($subcontext);
        $this->assertCount(1, $files);
    }

    /**
     * Save an annotation page for a user.
     *
     * @param int $userid
     * @return \stdClass
     */
    private static function save_page_for(int $userid): \stdClass {
        $item = ['type' => 'box', 'colour' => '#000000', 'size' => 2, 'x0' => 1, 'y0' => 2, 'x1' => 3, 'y1' => 4];
        return pages::save(0, $userid, 1, '', 'Biology', 'Week 3', json_encode(['items' => [$item]]));
    }

    /**
     * A user with only an annotation page is found, exported and deleted.
     */
    public function test_annotation_pages(): void {
        global $DB;
        $this->resetAfterTest();

        $owner = $this->getDataGenerator()->create_user();
        $other = $this->getDataGenerator()->create_user();
        $page = self::save_page_for($owner->id);
        self::save_page_for($other->id);
        $context = \context_user::instance($owner->id);

        $this->assertEquals([$context->id], provider::get_contexts_for_userid($owner->id)->get_contextids());
        $userlist = new userlist($context, 'local_scribbles');
        provider::get_users_in_context($userlist);
        $this->assertEquals([$owner->id], $userlist->get_userids());

        provider::export_user_data(new approved_contextlist($owner, 'local_scribbles', [$context->id]));
        $subcontext = [
            get_string('pluginname', 'local_scribbles'),
            get_string('annotationpages', 'local_scribbles'),
            $page->id,
        ];
        $exported = writer::with_context($context)->get_data($subcontext);
        $this->assertSame('Week 3', $exported->name);
        $this->assertEquals(1, $exported->contextid);
        $this->assertSame('box', $exported->data->items[0]->type);

        provider::delete_data_for_user(new approved_contextlist($owner, 'local_scribbles', [$context->id]));
        $this->assertFalse($DB->record_exists(pages::TABLE, ['userid' => $owner->id]));
        $this->assertTrue($DB->record_exists(pages::TABLE, ['userid' => $other->id]));
    }

    /**
     * Each delete method removes the owner's rows and files and nobody else's.
     */
    public function test_deletes(): void {
        global $DB;
        $this->resetAfterTest();

        $users = [];
        for ($i = 0; $i < 4; $i++) {
            $users[$i] = $this->getDataGenerator()->create_user();
            self::save_for($users[$i]->id, 'Page ' . $i);
            self::save_page_for($users[$i]->id);
        }
        $context = fn(int $i) => \context_user::instance($users[$i]->id);
        $fs = get_file_storage();

        provider::delete_data_for_all_users_in_context($context(0));
        provider::delete_data_for_user(new approved_contextlist($users[1], 'local_scribbles', [$context(1)->id]));
        provider::delete_data_for_users(new approved_userlist($context(2), 'local_scribbles', [$users[2]->id]));
        // A context that is not the user's own deletes nothing.
        provider::delete_data_for_user(new approved_contextlist($users[3], 'local_scribbles', [$context(0)->id]));

        for ($i = 0; $i < 3; $i++) {
            $this->assertFalse($DB->record_exists('local_scribbles', ['userid' => $users[$i]->id]));
            $this->assertFalse($DB->record_exists(pages::TABLE, ['userid' => $users[$i]->id]));
            $this->assertTrue($fs->is_area_empty($context($i)->id, 'local_scribbles', manager::FILEAREA, false));
        }
        $this->assertTrue($DB->record_exists('local_scribbles', ['userid' => $users[3]->id]));
        $this->assertTrue($DB->record_exists(pages::TABLE, ['userid' => $users[3]->id]));
        $this->assertFalse($fs->is_area_empty($context(3)->id, 'local_scribbles', manager::FILEAREA, false));
    }
}
