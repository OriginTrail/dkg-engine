Feature: Update asset test
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @release
  Scenario: Update an existing knowledge asset on both blockchains
    Given I set R0 to be 1 on blockchain hardhat1:31337
    And I set R1 to be 2 on blockchain hardhat1:31337
    And I set finalizationCommitsNumber to be 2 on blockchain hardhat1:31337
    And I set R0 to be 1 on blockchain hardhat2:31337
    And I set R1 to be 2 on blockchain hardhat2:31337
    And I set finalizationCommitsNumber to be 2 on blockchain hardhat2:31337
    And I setup 4 nodes
    And I wait for 5 seconds

    When I call Publish on the node 4 with validPublish_1ForValidUpdate_1 on blockchain hardhat1:31337
    And I wait for latest Publish to finalize
    Then Latest Publish operation finished with status: COMPLETED

    When I call Publish on the node 4 with validPublish_1ForValidUpdate_1 on blockchain hardhat2:31337
    And I wait for latest Publish to finalize
    Then Latest Publish operation finished with status: COMPLETED

    When I call Update on the node 4 for the latest published UAL with validUpdate_1 on blockchain hardhat1:31337
    And I wait for latest Update to finalize
    Then Latest Update operation finished with status: COMPLETED

    When I call Update on the node 4 for the latest published UAL with validUpdate_1 on blockchain hardhat2:31337
    And I wait for latest Update to finalize
    Then Latest Update operation finished with status: COMPLETED
