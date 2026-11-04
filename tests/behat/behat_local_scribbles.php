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

// NOTE: no MOODLE_INTERNAL test here, this file may be required by behat before including /config.php.

require_once(__DIR__ . '/../../../../lib/behat/behat_base.php');

use Behat\Mink\Exception\ExpectationException;

/**
 * Steps for driving the scribbles overlay.
 *
 * @package    local_scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class behat_local_scribbles extends behat_base {
    /**
     * Drag on the drawing canvas, in CSS pixels from the top left of the window.
     *
     * The events are dispatched on the canvas: a synthetic pointer cannot be captured,
     * so capture is switched off for it.
     *
     * @Given /^I drag on the scribbles canvas from (\d+),(\d+) to (\d+),(\d+)$/
     * @param int $x0
     * @param int $y0
     * @param int $x1
     * @param int $y1
     */
    public function i_drag_on_the_canvas(int $x0, int $y0, int $x1, int $y1): void {
        $js = <<<JS
(function() {
    const canvas = document.querySelector('[data-region="canvas"]');
    canvas.setPointerCapture = function() {};
    const fire = function(type, x, y) {
        canvas.dispatchEvent(new PointerEvent(type, {
            bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y,
        }));
    };
    fire('pointerdown', $x0, $y0);
    for (let i = 1; i <= 5; i++) {
        fire('pointermove', $x0 + ($x1 - $x0) * i / 5, $y0 + ($y1 - $y0) * i / 5);
    }
    fire('pointerup', $x1, $y1);
})();
JS;
        $this->getSession()->executeScript($js);
    }

    /**
     * Click on the drawing canvas, in CSS pixels from the top left of the window.
     *
     * @Given /^I click on the scribbles canvas at (\d+),(\d+)$/
     * @param int $x
     * @param int $y
     */
    public function i_click_on_the_canvas(int $x, int $y): void {
        $this->i_drag_on_the_canvas($x, $y, $x, $y);
    }

    /**
     * Something must be drawn on the canvas.
     *
     * @Then /^the scribbles canvas should have annotations on it$/
     */
    public function the_canvas_should_have_annotations(): void {
        $js = <<<JS
return (function() {
    const canvas = document.querySelector('[data-region="canvas"]');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some(function(value, i) {
        return i % 4 === 3 && value > 0;
    });
})();
JS;
        if (!$this->getSession()->evaluateScript($js)) {
            throw new ExpectationException('The canvas is empty', $this->getSession());
        }
    }

    /**
     * The close button must lie exactly over the button that opens scribbles.
     *
     * @Then /^the scribbles close button should cover the open button$/
     */
    public function the_close_button_should_cover_the_open_button(): void {
        $js = <<<JS
return (function() {
    const close = document.querySelector('.local_scribbles-close').getBoundingClientRect();
    const open = document.querySelector('.local_scribbles-navbutton').getBoundingClientRect();
    return close.top === open.top && close.left === open.left &&
        close.width === open.width && close.height === open.height;
})();
JS;
        if (!$this->getSession()->evaluateScript($js)) {
            throw new ExpectationException('The close button is not over the open button', $this->getSession());
        }
    }

    /**
     * Compare a value of the first annotation of a saved page.
     *
     * @Then /^the first annotation of the page "(?P<name>[^"]*)" should have (?P<field>[a-z0-9]+) "(?P<value>[^"]*)"$/
     * @param string $name
     * @param string $field
     * @param string $value
     */
    public function the_first_annotation_should_have(string $name, string $field, string $value): void {
        $actual = $this->first_annotation($name)->$field ?? null;
        if ((string) $actual !== $value) {
            throw new ExpectationException("$field is " . var_export($actual, true) . ", not $value", $this->getSession());
        }
    }

    /**
     * The first annotation of a saved page must be rotated.
     *
     * @Then /^the first annotation of the page "(?P<name>[^"]*)" should be rotated$/
     * @param string $name
     */
    public function the_first_annotation_should_be_rotated(string $name): void {
        if (empty($this->first_annotation($name)->angle)) {
            throw new ExpectationException('The annotation is not rotated', $this->getSession());
        }
    }

    /**
     * The first annotation of a saved page.
     *
     * @param string $name
     * @return stdClass
     */
    private function first_annotation(string $name): stdClass {
        global $DB;

        $record = $DB->get_record('local_scribbles_pages', ['name' => $name], '*', MUST_EXIST);
        return json_decode($record->data)->items[0];
    }
}
