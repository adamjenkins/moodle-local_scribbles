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
use local_scribbles\local\pages;

/**
 * Tests for saving and bringing back annotation pages.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(\local_scribbles\external\save_page::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(\local_scribbles\external\delete_page::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(\local_scribbles\external\get_page::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(\local_scribbles\external\get_pages::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(\local_scribbles\local\pages::class)]
final class pages_test extends \advanced_testcase {
    /**
     * One annotation of every type.
     *
     * @return array
     */
    private static function items(): array {
        return [
            ['type' => 'pen', 'colour' => '#E03131', 'size' => 4, 'points' => [[1, 2], [3.5, 4]], 'angle' => 0.5],
            ['type' => 'highlighter', 'colour' => '#ffe066', 'size' => 8, 'points' => [[5, 6]]],
            ['type' => 'box', 'colour' => '#1971c2', 'size' => 2, 'x0' => 1, 'y0' => 2, 'x1' => 30, 'y1' => 40],
            ['type' => 'ellipse', 'colour' => '#2f9e44', 'size' => 2, 'x0' => 1, 'y0' => 2, 'x1' => 30, 'y1' => 40],
            ['type' => 'text', 'colour' => '#212529', 'fontsize' => 18.5, 'x' => 7, 'y' => 8, 'text' => "a < b\n<b>c</b>"],
        ];
    }

    /**
     * Call save_page the way the AJAX layer does.
     *
     * @param int $id
     * @param int $contextid
     * @param array $items
     * @param string $name
     * @return array
     */
    private static function save(int $id, int $contextid, array $items, string $name = 'Week 3'): array {
        $data = json_encode(['items' => $items, 'scrolltop' => 10, 'pagescrolltop' => 20]);
        $result = save_page::execute($id, $contextid, '', 'Course: Biology', $name, $data);
        return external_api::clean_returnvalue(save_page::execute_returns(), $result);
    }

    /**
     * A teacher in a course, logged in, with the course context.
     *
     * @return \context_course
     */
    private function as_teacher(): \context_course {
        $course = $this->getDataGenerator()->create_course(['summary' => '']);
        $this->setUser($this->getDataGenerator()->create_and_enrol($course, 'editingteacher'));
        return \context_course::instance($course->id);
    }

    /**
     * A saved page comes back with every annotation intact, and is listed.
     */
    public function test_save_and_get(): void {
        $this->resetAfterTest();
        $context = $this->as_teacher();

        $saved = self::save(0, $context->id, self::items());
        $this->assertSame('Week 3', $saved['name']);

        $list = external_api::clean_returnvalue(get_pages::execute_returns(), get_pages::execute());
        $this->assertCount(1, $list['pages']);
        $this->assertSame($saved['id'], $list['pages'][0]['id']);

        $page = external_api::clean_returnvalue(get_page::execute_returns(), get_page::execute($saved['id']));
        $data = json_decode($page['data'], true);
        $this->assertCount(5, $data['items']);
        $this->assertSame('#e03131', $data['items'][0]['colour']);
        $this->assertSame(0.5, $data['items'][0]['angle']);
        $this->assertSame([[1, 2], [3.5, 4]], $data['items'][0]['points']);
        $this->assertSame("a < b\n<b>c</b>", $data['items'][4]['text']);
        $this->assertSame(10, $data['scrolltop']);
        $this->assertSame(20, $data['pagescrolltop']);
    }

    /**
     * Saving again with the id updates the page; with no name it takes the Moodle page title.
     */
    public function test_update_and_default_name(): void {
        global $DB;
        $this->resetAfterTest();
        $context = $this->as_teacher();

        $saved = self::save(0, $context->id, self::items());
        $updated = self::save($saved['id'], $context->id, array_slice(self::items(), 0, 1), '  ');

        $this->assertSame($saved['id'], $updated['id']);
        $this->assertSame('Course: Biology', $updated['name']);
        $this->assertSame(1, $DB->count_records(pages::TABLE));
        $record = $DB->get_record(pages::TABLE, ['id' => $saved['id']]);
        $this->assertCount(1, json_decode($record->data)->items);
    }

    /**
     * A name or Moodle page title holding markup is saved as plain text, not refused.
     */
    public function test_markup_in_name_and_title(): void {
        global $DB;
        $this->resetAfterTest();
        $context = $this->as_teacher();

        $data = json_encode(['items' => self::items()]);
        $result = save_page::execute(0, $context->id, '', '<b>Course</b>', '<b>Week</b> 3', $data);
        $result = external_api::clean_returnvalue(save_page::execute_returns(), $result);

        $this->assertSame('Week 3', $result['name']);
        $this->assertSame('Course', $DB->get_field(pages::TABLE, 'pagetitle', ['id' => $result['id']]));
    }

    /**
     * Another user's page can be neither read, updated nor listed.
     */
    public function test_pages_are_private(): void {
        $this->resetAfterTest();
        $context = $this->as_teacher();
        $saved = self::save(0, $context->id, self::items());

        $this->setUser($this->getDataGenerator()->create_and_enrol(\get_course($context->instanceid), 'editingteacher'));
        $list = external_api::clean_returnvalue(get_pages::execute_returns(), get_pages::execute());
        $this->assertEmpty($list['pages']);

        try {
            get_page::execute($saved['id']);
            $this->fail('Read another user\'s page');
        } catch (\dml_missing_record_exception $e) {
            $this->assertStringContainsString(pages::TABLE, $e->getMessage());
        }

        $this->expectException(\dml_missing_record_exception::class);
        self::save($saved['id'], $context->id, self::items());
    }

    /**
     * The owner can delete a page, even after losing the right to make more; nobody else can.
     */
    public function test_delete(): void {
        global $DB, $USER;
        $this->resetAfterTest();
        $context = $this->as_teacher();
        $owner = clone $USER;
        $saved = self::save(0, $context->id, self::items());
        $kept = self::save(0, $context->id, self::items());

        $this->setUser($this->getDataGenerator()->create_user());
        try {
            delete_page::execute($saved['id']);
            $this->fail('Deleted another user\'s page');
        } catch (\dml_missing_record_exception $e) {
            $this->assertTrue($DB->record_exists(pages::TABLE, ['id' => $saved['id']]));
        }

        $this->setUser($owner);
        role_unassign_all(['userid' => $owner->id, 'contextid' => $context->id]);
        $result = external_api::clean_returnvalue(delete_page::execute_returns(), delete_page::execute($saved['id']));

        $this->assertTrue($result['deleted']);
        $this->assertFalse($DB->record_exists(pages::TABLE, ['id' => $saved['id']]));
        $this->assertTrue($DB->record_exists(pages::TABLE, ['id' => $kept['id']]));
    }

    /**
     * New pages stop at the limit, but a saved page can still be updated; 0 means no limit.
     */
    public function test_limit(): void {
        global $DB, $USER;
        $this->resetAfterTest();
        $context = $this->as_teacher();
        set_config('maxpages', 1, 'local_scribbles');

        $saved = self::save(0, $context->id, self::items());
        self::save($saved['id'], $context->id, self::items(), 'Renamed');
        try {
            self::save(0, $context->id, self::items());
            $this->fail('Saved past the limit');
        } catch (\moodle_exception $e) {
            $this->assertSame('errortoomanypages', $e->errorcode);
        }

        set_config('maxpages', 0, 'local_scribbles');
        self::save(0, $context->id, self::items());
        $this->assertSame(2, $DB->count_records(pages::TABLE, ['userid' => $USER->id]));
    }

    /**
     * A student cannot save a page.
     */
    public function test_student_cannot_save(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course(['summary' => '']);
        $this->setUser($this->getDataGenerator()->create_and_enrol($course, 'student'));

        $this->expectException(\required_capability_exception::class);
        self::save(0, \context_course::instance($course->id)->id, self::items());
    }

    /**
     * Data that is not a drawing is refused.
     *
     * @param string $data
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('invalid_data_provider')]
    public function test_invalid_data(string $data): void {
        $this->expectException(\moodle_exception::class);
        pages::clean_data($data);
    }

    /**
     * Invalid annotation page data.
     *
     * @return array
     */
    public static function invalid_data_provider(): array {
        $valid = ['type' => 'box', 'colour' => '#000000', 'size' => 2, 'x0' => 1, 'y0' => 2, 'x1' => 3, 'y1' => 4];
        $encode = fn(array $item) => [json_encode(['items' => [$item]])];
        return [
            'not json' => ['{'],
            'no items' => ['{"scrolltop":1}'],
            'unknown type' => $encode(['type' => 'image'] + $valid),
            'colour not a hex value' => $encode(['colour' => 'url(x)'] + $valid),
            'size out of range' => $encode(['size' => 99] + $valid),
            'missing coordinate' => $encode(array_diff_key($valid, ['x1' => 1])),
            'coordinate not a number' => $encode(['x0' => '1'] + $valid),
            'empty stroke' => $encode(['type' => 'pen', 'colour' => '#000000', 'size' => 2, 'points' => []]),
            'bad point' => $encode(['type' => 'pen', 'colour' => '#000000', 'size' => 2, 'points' => [[1]]]),
            'empty text' => $encode(['type' => 'text', 'colour' => '#000000', 'fontsize' => 9, 'x' => 1, 'y' => 1, 'text' => '']),
            'zero font' => $encode(['type' => 'text', 'colour' => '#000000', 'fontsize' => 0, 'x' => 1, 'y' => 1, 'text' => 'a']),
        ];
    }

    /**
     * Oversized data is refused before it is parsed.
     */
    public function test_too_large(): void {
        $this->expectException(\moodle_exception::class);
        $this->expectExceptionMessage('too large');
        pages::clean_data(str_repeat(' ', pages::MAX_BYTES + 1));
    }

    /**
     * Only the checked values are stored.
     */
    public function test_unknown_values_dropped(): void {
        $clean = pages::clean_data(json_encode(['items' => [self::items()[2] + ['onclick' => 'x']], 'other' => 'y']));
        $this->assertStringNotContainsString('onclick', $clean);
        $this->assertStringNotContainsString('other', $clean);
    }

    /**
     * Deleting a user removes their annotation pages.
     */
    public function test_user_deleted(): void {
        global $DB, $USER;
        $this->resetAfterTest();
        $context = $this->as_teacher();
        self::save(0, $context->id, self::items());
        $userid = $USER->id;
        $this->setAdminUser();

        delete_user($DB->get_record('user', ['id' => $userid]));

        $this->assertFalse($DB->record_exists(pages::TABLE, ['userid' => $userid]));
    }
}
