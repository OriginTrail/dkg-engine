Feature: Get errors test
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @ignore
  Scenario: Getting non-existent UAL
    # @ignore: A validly-formatted but non-existent UAL causes the node's get
    # operation to stay IN_PROGRESS indefinitely while it searches the network.
    # The operation never reaches a terminal status, so polling times out.
    And I setup 1 additional node
    And I wait for 15 seconds

    When I call Get directly on the node 1 with nonExistentUAL on blockchain hardhat1:31337
    And I wait for latest Get to finalize
    Then Latest Get operation finished with status: FAILED

  @get-error
  Scenario: Getting invalid UAL
    And I setup 1 additional node
    And I wait for 15 seconds

    When I call Get directly on the node 1 with invalidUAL on blockchain hardhat1:31337
    And I wait for latest Get to finalize
    Then Latest Get operation finished with status: GetRouteError
