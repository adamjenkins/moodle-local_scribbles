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
use local_scribbles\local\manager;

/**
 * Tests for saving screenshots, who may save them and deleting them.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \local_scribbles\external\save_screenshot
 * @covers     \local_scribbles\local\manager
 * @covers     \local_scribbles\local\access
 * @covers     \local_scribbles\local\observer
 */
final class save_screenshot_test extends \advanced_testcase {
    /**
     * A small image as a data: URL.
     *
     * @param string $type png or jpeg
     * @return string
     */
    private static function image_data_url(string $type = 'png'): string {
        $image = imagecreatetruecolor(4, 3);
        ob_start();
        $type === 'png' ? imagepng($image) : imagejpeg($image);
        $binary = ob_get_clean();
        return 'data:image/' . $type . ';base64,' . base64_encode($binary);
    }

    /**
     * Call the external function the way the AJAX layer does.
     *
     * @param int $contextid
     * @param string $image
     * @param string $pageurl
     * @return array
     */
    private static function call(int $contextid, string $image, string $pageurl = ''): array {
        $result = save_screenshot::execute($contextid, $pageurl, 'Course: Biology', $image);
        return external_api::clean_returnvalue(save_screenshot::execute_returns(), $result);
    }

    /**
     * A teacher saves a screenshot on their course page: a row and one image file in their user context.
     */
    public function test_teacher_saves_screenshot(): void {
        global $CFG, $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['summary' => '']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);
        $context = \context_course::instance($course->id);

        $result = self::call($context->id, self::image_data_url(), $CFG->wwwroot . '/course/view.php?id=' . $course->id);

        $record = $DB->get_record('local_scribbles', ['id' => $result['id']], '*', MUST_EXIST);
        $this->assertEquals($teacher->id, $record->userid);
        $this->assertEquals($context->id, $record->contextid);
        $this->assertSame($CFG->wwwroot . '/course/view.php?id=' . $course->id, $record->pageurl);
        $this->assertSame('Course: Biology', $record->pagetitle);

        $file = manager::get_file($record);
        $this->assertNotNull($file);
        $this->assertEquals(\context_user::instance($teacher->id)->id, $file->get_contextid());
        $this->assertSame('image/png', $file->get_mimetype());
        $this->assertStringEndsWith('.png', $file->get_filename());
    }

    /**
     * A JPEG is stored with a .jpg name; an external page URL is not kept.
     */
    public function test_jpeg_and_external_url(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['summary' => '']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'teacher');
        $this->setUser($teacher);

        $result = self::call(
            \context_course::instance($course->id)->id,
            self::image_data_url('jpeg'),
            'https://evil.example.com/phish'
        );

        $record = $DB->get_record('local_scribbles', ['id' => $result['id']], '*', MUST_EXIST);
        $this->assertSame('', $record->pageurl);
        $this->assertStringEndsWith('.jpg', manager::get_file($record)->get_filename());
    }

    /**
     * A student may not save in their course.
     */
    public function test_student_cannot_save(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['summary' => '']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->expectException(\required_capability_exception::class);
        self::call(\context_course::instance($course->id)->id, self::image_data_url());
    }

    /**
     * Teaching course A gives no scribbles in course B where the user is a student,
     * but does on pages outside courses (their dashboard).
     */
    public function test_capability_scope(): void {
        $this->resetAfterTest();

        $coursea = $this->getDataGenerator()->create_course(['summary' => '']);
        $courseb = $this->getDataGenerator()->create_course(['summary' => '']);
        $user = $this->getDataGenerator()->create_and_enrol($coursea, 'editingteacher');
        $this->getDataGenerator()->enrol_user($user->id, $courseb->id, 'student');
        $this->setUser($user);

        $this->assertTrue(\local_scribbles\local\access::can_use(\context_course::instance($coursea->id)));
        $this->assertFalse(\local_scribbles\local\access::can_use(\context_course::instance($courseb->id)));
        $this->assertTrue(\local_scribbles\local\access::can_use(\context_user::instance($user->id)));
        $this->assertTrue(\local_scribbles\local\access::can_use(\context_system::instance()));

        $student = $this->getDataGenerator()->create_and_enrol($courseb, 'student');
        $this->setUser($student);
        $this->assertFalse(\local_scribbles\local\access::can_use(\context_user::instance($student->id)));
    }

    /**
     * Anything that is not a PNG or JPEG is rejected and nothing is stored.
     */
    public function test_rejects_non_image(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();

        try {
            self::call(\context_system::instance()->id, 'data:image/png;base64,' . base64_encode('<svg onload="alert(1)"/>'));
            $this->fail('Expected an exception');
        } catch (\moodle_exception $e) {
            $this->assertSame('errorinvalidimage', $e->errorcode);
        }
        $this->assertSame(0, $DB->count_records('local_scribbles'));
    }

    /**
     * Oversized input is rejected before decoding.
     */
    public function test_rejects_too_large(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        $this->expectExceptionMessage(get_string('errorimagetoolarge', 'local_scribbles', display_size(manager::MAX_BYTES)));
        self::call(\context_system::instance()->id, str_repeat('A', intdiv(manager::MAX_BYTES, 3) * 4 + 8));
    }

    /**
     * Deleting one screenshot removes its row and file; deleting the user removes the rest.
     */
    public function test_delete_and_user_deleted(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['summary' => '']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);
        $contextid = \context_course::instance($course->id)->id;
        $usercontextid = \context_user::instance($teacher->id)->id;

        $first = $DB->get_record('local_scribbles', ['id' => self::call($contextid, self::image_data_url())['id']]);
        self::call($contextid, self::image_data_url());
        self::call($contextid, self::image_data_url());

        manager::delete($first);
        $this->assertSame(2, $DB->count_records('local_scribbles', ['userid' => $teacher->id]));
        $fs = get_file_storage();
        $this->assertTrue($fs->is_area_empty($usercontextid, 'local_scribbles', manager::FILEAREA, $first->id));

        $this->setAdminUser();
        delete_user($teacher);
        $this->assertSame(0, $DB->count_records('local_scribbles', ['userid' => $teacher->id]));
        $this->assertTrue($fs->is_area_empty($usercontextid, 'local_scribbles', manager::FILEAREA, false));
    }
}
