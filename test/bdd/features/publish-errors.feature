Feature: Publish errors test
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @publish-error
  Scenario: Publish a knowledge asset directly on the node with invalid request
    And I setup 1 additional node
    And I wait for 15 seconds

    When I call Publish directly on the node 1 with validPublishRequestBody
    Then Latest Publish operation finished with status: FAILED
