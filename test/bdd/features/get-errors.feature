Feature: Get errors test
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @get-errors
  Scenario: Getting non-existent UAL
    Given I setup 4 nodes
    And I wait for 5 seconds

    When I call Get directly on the node 1 with nonExistentUAL on blockchain hardhat1:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: GetRouteError

  @get-errors
  Scenario: Getting invalid UAL
    Given I setup 4 nodes
    And I wait for 5 seconds

    When I call Get directly on the node 1 with invalidUAL on blockchain hardhat1:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: GetRouteError

  @get-errors
  Scenario: Getting non-existent state
    Given I setup 4 nodes
    And I set R0 to be 1 on blockchain hardhat1:31337
    And I set R1 to be 2 on blockchain hardhat1:31337
    And I set R0 to be 1 on blockchain hardhat2:31337
    And I set R1 to be 2 on blockchain hardhat2:31337
    And I wait for 5 seconds

    When I call Publish on the node 1 with validAssertion on blockchain hardhat1:31337
    And I wait for latest Publish to finalize
    And I call Get directly on the node 1 with nonExistentState on blockchain hardhat1:31337
    Then It should fail with status code 400

  @get-errors
  Scenario: Getting invalid state hash
    Given I setup 4 nodes
    And I set R0 to be 1 on blockchain hardhat1:31337
    And I set R1 to be 2 on blockchain hardhat1:31337
    And I set R0 to be 1 on blockchain hardhat2:31337
    And I set R1 to be 2 on blockchain hardhat2:31337
    And I wait for 5 seconds

    When I call Publish on the node 1 with validAssertion on blockchain hardhat1:31337
    And I wait for latest Publish to finalize
    And I call Get directly on the node 1 with invalidStateHash on blockchain hardhat1:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: GetAssertionIdError
