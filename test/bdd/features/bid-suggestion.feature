@ignore
Feature: Bid suggestion tests
  # @ignore: dkg.js SDK removed network.getBidSuggestion() and assertion.getSizeInBytes()
  # in v8. Re-enable once the SDK exposes a bid-suggestion API again.

  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @bid-suggestion
  Scenario: Get bid suggestion with a valid assertion
    And I setup 2 additional nodes
    And I wait for 15 seconds

    When I call Get Bid Suggestion on the node 1 with validPublish_1ForValidUpdate_1 on blockchain hardhat1:31337
    Then I call Info route on the node 1
