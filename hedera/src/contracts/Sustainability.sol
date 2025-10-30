// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";


/**
 * @title SustainabilityContract
 * @dev Manages carbon credits and ESG tracking
 */
contract SustainabilityContract is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    
    address public carbonCreditNFT;
    
    struct CarbonCredit {
        bytes32 creditId;
        address entity;
        uint256 amount; // in tons CO2
        uint256 vintage;
        string projectType;
        bool verified;
        bool retired;
        uint256 timestamp;
    }
    
    mapping(bytes32 => CarbonCredit) public carbonCredits;
    mapping(address => uint256) public entityCarbonBalance;
    
    event CarbonCreditsAwarded(
        bytes32 indexed creditId,
        address indexed entity,
        uint256 amount
    );
    
    event CarbonCreditsRetired(
        bytes32 indexed creditId,
        address indexed entity,
        uint256 amount
    );
    
    constructor(address _carbonCreditNFT) {
        carbonCreditNFT = _carbonCreditNFT;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @dev Award carbon credits
     */
    function awardCarbonCredits(
        address _entity,
        uint256 _amount,
        string memory _projectType
    ) external onlyRole(VERIFIER_ROLE) returns (bytes32) {
        bytes32 creditId = keccak256(abi.encodePacked(
            _entity,
            _amount,
            block.timestamp
        ));
        
        carbonCredits[creditId] = CarbonCredit({
            creditId: creditId,
            entity: _entity,
            amount: _amount,
            vintage: block.timestamp / 365 days + 1970,
            projectType: _projectType,
            verified: true,
            retired: false,
            timestamp: block.timestamp
        });
        
        entityCarbonBalance[_entity] += _amount;
        
        emit CarbonCreditsAwarded(creditId, _entity, _amount);
        return creditId;
    }
    
    /**
     * @dev Retire carbon credits
     */
    function retireCredits(bytes32 _creditId) external {
        CarbonCredit storage credit = carbonCredits[_creditId];
        require(credit.entity == msg.sender, "Not credit owner");
        require(!credit.retired, "Already retired");
        
        credit.retired = true;
        entityCarbonBalance[msg.sender] -= credit.amount;
        
        emit CarbonCreditsRetired(_creditId, msg.sender, credit.amount);
    }
}