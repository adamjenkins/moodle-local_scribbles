@local @local_scribbles
Feature: See and delete what I saved on My scribbles
  In order to look after my saved scribbles
  As a teacher
  I need to see them and delete them, and nobody else may see them

  Background:
    Given the following "users" exist:
      | username | firstname | lastname | email                |
      | teacher1 | Terry     | One      | teacher1@example.com |
      | teacher2 | Tess      | Two      | teacher2@example.com |
    And the following "local_scribbles > pages" exist:
      | user     | name       |
      | teacher1 | Week 3 map |
    And the following "local_scribbles > screenshots" exist:
      | user     | pagetitle   |
      | teacher1 | Biology 101 |

  Scenario: The owner deletes an annotation page, after confirming
    Given I log in as "teacher1"
    When I visit "/local/scribbles/index.php"
    Then I should see "Week 3 map"
    And I should see "Biology 101"
    And I click on "a[href*='action=deletepage']" "css_element"
    And I should see "Delete the annotation page \"Week 3 map\"?"
    And I press "Cancel"
    And I should see "Week 3 map"
    And I click on "a[href*='action=deletepage']" "css_element"
    And I press "Continue"
    And I should see "Annotation page deleted."
    And I should not see "Week 3 map"
    And I should see "Biology 101"

  Scenario: The owner deletes a screenshot, after confirming
    Given I log in as "teacher1"
    When I visit "/local/scribbles/index.php"
    And I click on "a[href*='action=delete&']" "css_element"
    And I should see "Delete the scribble of \"Biology 101\"?"
    And I press "Continue"
    Then I should see "Scribble deleted."
    And I should not see "Biology 101"
    And I should see "Week 3 map"

  Scenario: Another user sees none of it
    Given I log in as "teacher2"
    When I visit "/local/scribbles/index.php"
    Then I should not see "Week 3 map"
    And I should not see "Biology 101"
    And I should see "You have not saved any annotation pages yet."
    And I should see "You have not saved any scribbles yet."
