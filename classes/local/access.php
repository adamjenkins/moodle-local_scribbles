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
 * Who may use scribbles on which page.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class access {
    /** @var string The capability that grants scribbles. */
    public const CAPABILITY = 'local/scribbles:use';

    /**
     * Whether the current user may use scribbles on a page in the given context.
     *
     * Inside a course (or one of its activities) the capability is checked
     * there, so a teacher of course A gets no button in course B where they
     * are a student. Outside courses (dashboard, profile, front page, admin
     * pages) a user who holds the capability in any course may use it, since
     * the capability is a course-level one and teachers hold no system role.
     *
     * @param \context $context The page context
     * @return bool
     */
    public static function can_use(\context $context): bool {
        if (!isloggedin() || isguestuser()) {
            return false;
        }

        $coursecontext = $context->get_course_context(false);
        if ($coursecontext && (int) $coursecontext->instanceid !== (int) SITEID) {
            return has_capability(self::CAPABILITY, $context);
        }

        if (has_capability(self::CAPABILITY, \context_system::instance())) {
            return true;
        }
        return !empty(get_user_capability_course(self::CAPABILITY, null, true, '', '', 1));
    }
}
