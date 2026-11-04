@local @local_scribbles @javascript
Feature: Draw, edit and save annotations
  In order to annotate a page and come back to it
  As a teacher
  I need to edit annotations after drawing them and save them as a page

  Background:
    Given the following "users" exist:
      | username | firstname | lastname | email                |
      | teacher1 | Terry     | One      | teacher1@example.com |
    And the following "courses" exist:
      | fullname | shortname | summary |
      | Biology  | BIO       |         |
    And the following "course enrolments" exist:
      | user     | course | role           |
      | teacher1 | BIO    | editingteacher |
    And I am on the "BIO" "course" page logged in as "teacher1"
    And I click on ".local_scribbles-navbutton" "css_element"
    And "[data-region='canvas']" "css_element" should exist

  Scenario: The button that opens scribbles also closes it
    Then the scribbles close button should cover the open button
    And I click on ".local_scribbles-close" "css_element"
    And "[data-region='canvas']" "css_element" should not exist
    And I click on ".local_scribbles-navbutton" "css_element"
    And "[data-region='canvas']" "css_element" should exist

  Scenario: Move, resize, recolour and rotate an annotation, then save it
    When I click on "button[data-tool='box']" "css_element"
    And I drag on the scribbles canvas from 300,300 to 500,400
    And I click on "button[data-tool='select']" "css_element"
    # A click inside an unselected box does not select it, but on its edge it does.
    And I click on the scribbles canvas at 400,350
    And I click on the scribbles canvas at 300,350
    And I drag on the scribbles canvas from 300,350 to 400,400
    # The box is now 400,350 to 600,450, its corner handle 6 pixels out.
    And I drag on the scribbles canvas from 606,456 to 706,506
    And I click on "button[data-colour='#1971c2']" "css_element"
    And I click on "[data-action='pages']" "css_element"
    And I set the field with xpath "//input[@id='local_scribbles-pagename']" to "Unrotated"
    And I click on "[data-region='pages'] button[type='submit']" "css_element"
    And "[data-region='pages']" "css_element" should not be visible
    Then the first annotation of the page "Unrotated" should have x0 "400"
    And the first annotation of the page "Unrotated" should have y0 "350"
    And the first annotation of the page "Unrotated" should have x1 "700"
    And the first annotation of the page "Unrotated" should have y1 "500"
    And the first annotation of the page "Unrotated" should have colour "#1971c2"
    # A click on the selection swaps the handles for rotate handles.
    And I click on the scribbles canvas at 400,425
    And I drag on the scribbles canvas from 706,506 to 550,600
    And I click on "[data-action='pages']" "css_element"
    And I set the field with xpath "//input[@id='local_scribbles-pagename']" to "Rotated"
    And I press "Save as new"
    And "[data-region='pages']" "css_element" should not be visible
    And the first annotation of the page "Rotated" should be rotated

  Scenario: An annotation page comes back and can be deleted from the overlay
    Given the following "local_scribbles > pages" exist:
      | user     | name       |
      | teacher1 | Week 3 map |
    When I click on "[data-action='pages']" "css_element"
    And I click on "Open" "button" in the "[data-region='pages']" "css_element"
    Then the scribbles canvas should have annotations on it
    And I click on "[data-action='pages']" "css_element"
    And I click on "Delete" "button" in the "[data-region='pages']" "css_element"
    And I click on "Delete" "button" in the ".modal.show" "css_element"
    And I should see "Annotation page deleted."
    And "Open" "button" should not exist in the "[data-region='pages']" "css_element"
    And the scribbles canvas should have annotations on it

  Scenario: The Open link on My scribbles brings the page back
    Given the following "local_scribbles > pages" exist:
      | user     | name       |
      | teacher1 | Week 3 map |
    When I visit "/local/scribbles/index.php"
    And I follow "Open"
    Then "[data-region='canvas']" "css_element" should exist
    And the scribbles canvas should have annotations on it
