Feature: Get asset states test
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @release
  Scenario: Get first state of the updated knowledge asset on both blockchains
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

    When I call Get directly on the node 4 with validGetFirstStateRequestBody on blockchain hardhat1:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: COMPLETED

    When I call Get directly on the node 4 with validGetFirstStateRequestBody on blockchain hardhat2:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: COMPLETED

  @release
  Scenario: Get latest state of the updated knowledge asset on both blockchains
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

    When I call Get directly on the node 4 with validGetUpdatedStateRequestBody on blockchain hardhat1:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: COMPLETED

    When I call Get directly on the node 4 with validGetUpdatedStateRequestBody on blockchain hardhat2:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: COMPLETED

  @release
  Scenario: Get all states of the knowledge asset that is updated 2 times on both blockchains
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

    And I wait for 30 seconds

    When I call Update on the node 4 for the latest published UAL with validUpdate_2 on blockchain hardhat1:31337
    And I wait for latest Update to finalize
    Then Latest Update operation finished with status: COMPLETED

    When I call Update on the node 4 for the latest published UAL with validUpdate_2 on blockchain hardhat2:31337
    And I wait for latest Update to finalize
    Then Latest Update operation finished with status: COMPLETED

    When I call Get directly on the node 4 with getFirstStateRequestBody on blockchain hardhat1:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: COMPLETED

    When I call Get directly on the node 4 with getFirstStateRequestBody on blockchain hardhat2:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: COMPLETED

    When I call Get directly on the node 4 with getSecondStateRequestBody on blockchain hardhat1:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: COMPLETED

    When I call Get directly on the node 4 with getSecondStateRequestBody on blockchain hardhat2:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: COMPLETED

    When I call Get directly on the node 4 with getThirdStateRequestBody on blockchain hardhat1:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: COMPLETED

    When I call Get directly on the node 4 with getThirdStateRequestBody on blockchain hardhat2:31337
    And I wait for latest resolve to finalize
    Then Latest Get operation finished with status: COMPLETED
