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

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\transform;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;
use local_scribbles\local\manager;

/**
 * Privacy subsystem implementation for local_scribbles.
 *
 * Screenshots belong to the user who saved them and live in that user's own
 * context, whatever page they were taken on, so all data is in user contexts.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\core_userlist_provider,
    \core_privacy\local\request\plugin\provider {
    /**
     * Returns meta data about this system.
     *
     * @param collection $collection
     * @return collection
     */
    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table('local_scribbles', [
            'userid' => 'privacy:metadata:local_scribbles:userid',
            'contextid' => 'privacy:metadata:local_scribbles:contextid',
            'pageurl' => 'privacy:metadata:local_scribbles:pageurl',
            'pagetitle' => 'privacy:metadata:local_scribbles:pagetitle',
            'timecreated' => 'privacy:metadata:local_scribbles:timecreated',
        ], 'privacy:metadata:local_scribbles');

        $collection->add_subsystem_link('core_files', [], 'privacy:metadata:core_files');

        return $collection;
    }

    /**
     * The user's own context, if they have saved any screenshots.
     *
     * @param int $userid
     * @return contextlist
     */
    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();
        $sql = "SELECT ctx.id
                  FROM {context} ctx
                 WHERE ctx.contextlevel = :contextlevel
                   AND ctx.instanceid = :userid
                   AND EXISTS (SELECT 1 FROM {local_scribbles} s WHERE s.userid = ctx.instanceid)";
        $contextlist->add_from_sql($sql, ['contextlevel' => CONTEXT_USER, 'userid' => $userid]);
        return $contextlist;
    }

    /**
     * The owner of a user context, if they have saved any screenshots.
     *
     * @param userlist $userlist
     * @return void
     */
    public static function get_users_in_context(userlist $userlist): void {
        $context = $userlist->get_context();
        if (!$context instanceof \context_user) {
            return;
        }
        $userlist->add_from_sql(
            'userid',
            "SELECT userid FROM {local_scribbles} WHERE userid = :userid",
            ['userid' => $context->instanceid]
        );
    }

    /**
     * Export the user's screenshots and their images.
     *
     * @param approved_contextlist $contextlist
     * @return void
     */
    public static function export_user_data(approved_contextlist $contextlist): void {
        global $DB;

        $userid = (int) $contextlist->get_user()->id;
        foreach ($contextlist->get_contexts() as $context) {
            if (!self::is_own_user_context($context, $userid)) {
                continue;
            }
            $records = $DB->get_records('local_scribbles', ['userid' => $userid], 'timecreated, id');
            foreach ($records as $record) {
                $subcontext = [get_string('pluginname', 'local_scribbles'), $record->id];
                writer::with_context($context)
                    ->export_data($subcontext, (object) [
                        'pageurl' => $record->pageurl,
                        'pagetitle' => $record->pagetitle,
                        'timecreated' => transform::datetime($record->timecreated),
                    ])
                    ->export_area_files($subcontext, 'local_scribbles', manager::FILEAREA, $record->id);
            }
        }
    }

    /**
     * Delete all screenshots in a context.
     *
     * @param \context $context
     * @return void
     */
    public static function delete_data_for_all_users_in_context(\context $context): void {
        if ($context instanceof \context_user) {
            manager::delete_all_for_user((int) $context->instanceid, $context->id);
        }
    }

    /**
     * Delete the user's screenshots.
     *
     * @param approved_contextlist $contextlist
     * @return void
     */
    public static function delete_data_for_user(approved_contextlist $contextlist): void {
        $userid = (int) $contextlist->get_user()->id;
        foreach ($contextlist->get_contexts() as $context) {
            if (self::is_own_user_context($context, $userid)) {
                manager::delete_all_for_user($userid, $context->id);
            }
        }
    }

    /**
     * Delete the screenshots of the listed users in a context.
     *
     * @param approved_userlist $userlist
     * @return void
     */
    public static function delete_data_for_users(approved_userlist $userlist): void {
        $context = $userlist->get_context();
        if (!$context instanceof \context_user) {
            return;
        }
        if (in_array((int) $context->instanceid, array_map('intval', $userlist->get_userids()), true)) {
            manager::delete_all_for_user((int) $context->instanceid, $context->id);
        }
    }

    /**
     * Whether a context is the given user's own user context.
     *
     * @param \context $context
     * @param int $userid
     * @return bool
     */
    private static function is_own_user_context(\context $context, int $userid): bool {
        return $context->contextlevel == CONTEXT_USER && (int) $context->instanceid === $userid;
    }
}
