Feature: Update errors test
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @update-error
  Scenario: Update knowledge asset that was not previously published
    And I setup 1 additional node
    And I wait for 15 seconds

    When I call Update directly on the node 1 with validUpdateRequestBody
    And I wait for latest Update to finalize
    Then Latest Update operation finished with status: HTTP_404
