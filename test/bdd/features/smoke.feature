Feature: Smoke related tests
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @smoke
  Scenario: Setting up and tearing down infrastucture
  Given infrastucture is functional