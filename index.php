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
 * The current user's saved scribbles: view, download, delete.
 *
 * No capability is needed: anyone may see and delete screenshots they saved
 * themselves, even after losing the right to take new ones.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');

use local_scribbles\local\manager;

require_login(null, false);
if (isguestuser()) {
    throw new \moodle_exception('noguest');
}

$action = optional_param('action', '', PARAM_ALPHA);
$id = optional_param('id', 0, PARAM_INT);
$page = optional_param('page', 0, PARAM_INT);
$perpage = 24;

$context = context_user::instance($USER->id);
$url = new moodle_url('/local/scribbles/index.php');
$title = get_string('myscribbles', 'local_scribbles');

$PAGE->set_context($context);
$PAGE->set_url($url, $page ? ['page' => $page] : []);
$PAGE->set_pagelayout('standard');
$PAGE->set_title($title);
$PAGE->set_heading(fullname($USER));

if ($action === 'delete' && $id) {
    $record = $DB->get_record('local_scribbles', ['id' => $id, 'userid' => $USER->id], '*', MUST_EXIST);
    if (optional_param('confirm', 0, PARAM_BOOL)) {
        require_sesskey();
        manager::delete($record);
        redirect($url, get_string('scribbledeleted', 'local_scribbles'), null, \core\output\notification::NOTIFY_SUCCESS);
    }

    echo $OUTPUT->header();
    echo $OUTPUT->heading($title);
    $name = $record->pagetitle !== '' ? $record->pagetitle : userdate($record->timecreated);
    echo $OUTPUT->confirm(
        get_string('confirmdelete', 'local_scribbles', s($name)),
        new moodle_url($url, ['action' => 'delete', 'id' => $record->id, 'confirm' => 1, 'sesskey' => sesskey()]),
        $url
    );
    echo $OUTPUT->footer();
    exit;
}

$total = $DB->count_records('local_scribbles', ['userid' => $USER->id]);
$records = $DB->get_records(
    'local_scribbles',
    ['userid' => $USER->id],
    'timecreated DESC, id DESC',
    '*',
    $page * $perpage,
    $perpage
);

$items = [];
foreach ($records as $record) {
    $file = manager::get_file($record);
    if (!$file) {
        continue;
    }
    $fileurl = moodle_url::make_pluginfile_url(
        $file->get_contextid(),
        $file->get_component(),
        $file->get_filearea(),
        $file->get_itemid(),
        $file->get_filepath(),
        $file->get_filename()
    );
    $items[] = [
        'imageurl' => $fileurl->out(false),
        'downloadurl' => moodle_url::make_pluginfile_url(
            $file->get_contextid(),
            $file->get_component(),
            $file->get_filearea(),
            $file->get_itemid(),
            $file->get_filepath(),
            $file->get_filename(),
            true
        )->out(false),
        'deleteurl' => (new moodle_url($url, ['action' => 'delete', 'id' => $record->id]))->out(false),
        'pagetitle' => $record->pagetitle !== '' ? $record->pagetitle : get_string('untitledpage', 'local_scribbles'),
        'pageurl' => $record->pageurl,
        'timecreated' => userdate($record->timecreated, get_string('strftimedatetime', 'langconfig')),
    ];
}

echo $OUTPUT->header();
echo $OUTPUT->heading($title);
echo $OUTPUT->render_from_template('local_scribbles/list', [
    'items' => $items,
    'hasitems' => !empty($items),
]);
echo $OUTPUT->paging_bar($total, $page, $perpage, $url);
echo $OUTPUT->footer();
