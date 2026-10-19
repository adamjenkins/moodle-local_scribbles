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
 * Renders the "Scribbles" entry points and loads the overlay module.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class ui {
    /** @var string Button next to the edit mode switch in the navbar. */
    public const LOCATION_NAVBAR = 'navbar';

    /** @var string Link in the footer help ("?") menu. */
    public const LOCATION_FOOTER = 'footer';

    /** @var string Both entry points. */
    public const LOCATION_BOTH = 'both';

    /** @var string[] Page layouts where an overlay makes no sense. */
    private const EXCLUDED_LAYOUTS = ['embedded', 'popup', 'frametop', 'print', 'redirect', 'maintenance', 'secure'];

    /** @var bool Whether the AMD module has been requested on this page. */
    private static $jsloaded = false;

    /**
     * The navbar button, or '' when it should not be shown.
     *
     * @param \renderer_base $renderer
     * @return string HTML
     */
    public static function navbar_button(\renderer_base $renderer): string {
        if (!self::should_show(self::LOCATION_NAVBAR)) {
            return '';
        }
        self::load_js();
        return $renderer->render_from_template('local_scribbles/navbar_button', []);
    }

    /**
     * The footer help menu link, or '' when it should not be shown.
     *
     * @return string HTML
     */
    public static function footer_link(): string {
        global $OUTPUT;

        if (!self::should_show(self::LOCATION_FOOTER)) {
            return '';
        }
        self::load_js();
        return $OUTPUT->render_from_template('local_scribbles/footer_link', []);
    }

    /**
     * Whether the entry point for a location belongs on the current page.
     *
     * @param string $location One of the LOCATION_ constants (not BOTH)
     * @return bool
     */
    public static function should_show(string $location): bool {
        global $PAGE;

        if (during_initial_install() || CLI_SCRIPT || AJAX_SCRIPT) {
            return false;
        }

        $configured = get_config('local_scribbles', 'buttonlocation') ?: self::LOCATION_NAVBAR;
        if ($configured !== self::LOCATION_BOTH && $configured !== $location) {
            return false;
        }

        if (in_array($PAGE->pagelayout, self::EXCLUDED_LAYOUTS, true)) {
            return false;
        }

        return access::can_use($PAGE->context);
    }

    /**
     * Request the overlay module once per page.
     *
     * @return void
     */
    private static function load_js(): void {
        global $PAGE;

        if (self::$jsloaded) {
            return;
        }
        self::$jsloaded = true;

        $PAGE->requires->js_call_amd('local_scribbles/scribbles', 'init', [[
            'contextid' => $PAGE->context->id,
            'listurl' => (new \moodle_url('/local/scribbles/index.php'))->out(false),
        ]]);
    }
}
