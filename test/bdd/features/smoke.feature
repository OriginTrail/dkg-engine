Feature: Smoke tests — node health and basic operation
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @smoke
  Scenario: Nodes start up and respond to the info route
    And I setup 2 additional nodes
    And I wait for 5 seconds
    Then Node 1 responds to info route
    And Node 2 responds to info route
