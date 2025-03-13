Feature: Tests
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    Given 1 bootstrap is running

  @test
  Scenario: Publishing a valid assertion on both blockchains
    Given I setup 4 nodes
    Given I wait for 5 seconds

    When I call Publish on the node 2 with validAssertion on blockchain hardhat1:31337
    And I wait for latest Publish to finalize
    Then Latest Publish operation finished with status: COMPLETED
