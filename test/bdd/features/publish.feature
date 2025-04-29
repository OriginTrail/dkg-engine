Feature: Release related tests
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @ignore
  Scenario: Publishing a valid assertion on both blockchains
    And I setup 4 nodes
    And I wait for 5 seconds

    When I call Publish on the node 4 with validAssertion on blockchain hardhat1:31337
    And I wait for latest Publish to finalize
    Then Latest Publish operation finished with status: COMPLETED
    When I call Publish on the node 4 with validAssertion on blockchain hardhat2:31337
    And I wait for latest Publish to finalize
    Then Latest Publish operation finished with status: COMPLETED