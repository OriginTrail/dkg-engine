Feature: Release related tests
  Background: Setup local blockchain, bootstraps and nodes
    Given the blockchains are set up
    And 1 bootstrap is running

  @release
  Scenario: Get bid suggestion with a valid assertion and valid hashFunctionId and scoreFunctionId on both blockchains
    Given I set R0 to be 1 on blockchain hardhat1:31337
    And I set R1 to be 2 on blockchain hardhat1:31337
    And I set R0 to be 1 on blockchain hardhat2:31337
    And I set R1 to be 2 on blockchain hardhat2:31337
    And I setup 4 nodes
    And I wait for 5 seconds
    
    When I call Get Bid Suggestion on the node 2 with validPublish_1ForValidUpdate_1 on blockchain hardhat1:31337
    Then I call Info route on the node 2
    
    When I call Get Bid Suggestion on the node 2 with validPublish_1ForValidUpdate_1 on blockchain hardhat2:31337
    Then I call Info route on the node 2

    When I call Get Bid Suggestion on node 2 using parameters validPublish_1ForValidUpdate_1, hashFunctionId 1, scoreFunctionId 1, within blockchain hardhat1:31337
    Then I call Info route on the node 2   
    
    When I call Get Bid Suggestion on node 2 using parameters validPublish_1ForValidUpdate_1, hashFunctionId 1, scoreFunctionId 1, within blockchain hardhat2:31337
    Then I call Info route on the node 2  
    
    When I call Get Bid Suggestion on node 2 using parameters validPublish_1ForValidUpdate_1, hashFunctionId 1, scoreFunctionId 2, within blockchain hardhat1:31337
    Then I call Info route on the node 2   
    
    When I call Get Bid Suggestion on node 2 using parameters validPublish_1ForValidUpdate_1, hashFunctionId 1, scoreFunctionId 2, within blockchain hardhat2:31337
    Then I call Info route on the node 2  
    
    When I call Get Bid Suggestion on node 2 using parameters validPublish_1ForValidUpdate_1, hashFunctionId 1, scoreFunctionId 4, within blockchain hardhat1:31337
    Then I call Info route on the node 2  
    
    When I call Get Bid Suggestion on node 2 using parameters validPublish_1ForValidUpdate_1, hashFunctionId 1, scoreFunctionId 4, within blockchain hardhat2:31337
    Then I call Info route on the node 2  
