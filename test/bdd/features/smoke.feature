Feature: Check Nodes Uptime By Info API Call
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @smoke
  Scenario: Setting up and tearing down infrastucture
  Given infrastucture is functional
  And I setup 2 aditional nodes
  And I wait for 5 seconds
  Given Node 1 responds to info route
  And Node 2 responds to info route