Feature: Publish related tests
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @smoke @publish
  Scenario: Publishing a valid assertion
    And I setup 1 additional node
    And I wait for nodes to sync and mark active

    When I call Publish on the node 1 with validAssertion on blockchain hardhat1:31337
    And I wait for latest Publish to finalize
    Then Latest Publish operation finished with status: COMPLETED

  @publish @get
  Scenario: Publish and retrieve a knowledge asset
    And I setup 1 additional node
    And I wait for nodes to sync and mark active

    When I call Publish on the node 1 with validAssertion on blockchain hardhat1:31337
    And I wait for latest Publish to finalize
    Then Latest Publish operation finished with status: COMPLETED
    And I wait for 10 seconds

    When I get operation result from node 1 for latest published assertion
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: COMPLETED
