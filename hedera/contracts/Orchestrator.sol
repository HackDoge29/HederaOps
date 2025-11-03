// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title HederaOpsOrchestrator
 * @dev Central contract coordinating all HederaOps modules
 */
contract HederaOpsOrchestrator is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MODULE_ROLE = keccak256("MODULE_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    
    // Module contract addresses
    address public healthcareModule;
    address public agricultureModule;
    address public supplyChainModule;
    address public sustainabilityModule;
    
    // Entity registry
    mapping(address => Entity) public entities;
    mapping(bytes32 => CrossModuleTransaction) public transactions;
    
    struct Entity {
        address wallet;
        EntityType entityType;
        string[] activeModules;
        uint256 reputationScore;
        bool verified;
        uint256 created;
        uint256 totalTransactions;
    }
    
    struct CrossModuleTransaction {
        bytes32 txId;
        address initiator;
        string[] involvedModules;
        TransactionStatus status;
        uint256 timestamp;
        uint256 value;
    }
    
    enum EntityType { 
        FARMER, 
        PATIENT, 
        BUYER, 
        FACILITY, 
        PRODUCT, 
        ORGANIZATION,
        GOVERNMENT
    }
    
    enum TransactionStatus { 
        PENDING, 
        PROCESSING, 
        COMPLETED, 
        FAILED, 
        CANCELLED 
    }
    
    // Events
    event EntityRegistered(
        address indexed wallet, 
        EntityType entityType, 
        uint256 timestamp
    );
    
    event EntityVerified(address indexed wallet, uint256 timestamp);
    
    event CrossModuleTransactionCreated(
        bytes32 indexed txId, 
        address indexed initiator,
        string[] modules,
        uint256 value
    );
    
    event CrossModuleTransactionCompleted(
        bytes32 indexed txId,
        uint256 timestamp
    );
    
    event ReputationUpdated(
        address indexed entity,
        uint256 oldScore,
        uint256 newScore
    );
    
    event ModuleUpdated(
        string indexed moduleName,
        address newAddress
    );
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @dev Register new entity
     */
    function registerEntity(
        EntityType _type,
        string[] memory _modules
    ) external whenNotPaused returns (bool) {
        require(entities[msg.sender].wallet == address(0), "Entity exists");
        require(_modules.length > 0, "No modules specified");
        
        entities[msg.sender] = Entity({
            wallet: msg.sender,
            entityType: _type,
            activeModules: _modules,
            reputationScore: 500, // Starting score
            verified: false,
            created: block.timestamp,
            totalTransactions: 0
        });
        
        emit EntityRegistered(msg.sender, _type, block.timestamp);
        return true;
    }
    
    /**
     * @dev Verify entity (KYC/KYB completed)
     */
    function verifyEntity(address _entity) 
        external 
        onlyRole(VERIFIER_ROLE) 
    {
        require(entities[_entity].wallet != address(0), "Entity not found");
        require(!entities[_entity].verified, "Already verified");
        
        entities[_entity].verified = true;
        emit EntityVerified(_entity, block.timestamp);
    }
    
    /**
     * @dev Create cross-module transaction
     */
    function createCrossModuleTransaction(
        string[] memory _modules,
        uint256 _value
    ) external whenNotPaused returns (bytes32) {
        require(entities[msg.sender].verified, "Entity not verified");
        require(_modules.length > 0, "No modules specified");
        
        bytes32 txId = keccak256(abi.encode(
            msg.sender,
            block.timestamp,
            _modules,
            _value
        ));
        
        CrossModuleTransaction storage txn = transactions[txId];
        txn.txId = txId;
        txn.initiator = msg.sender;
        txn.involvedModules = _modules;
        txn.status = TransactionStatus.PENDING;
        txn.timestamp = block.timestamp;
        txn.value = _value;
        
        emit CrossModuleTransactionCreated(txId, msg.sender, _modules, _value);
        return txId;
    }
    
    /**
     * @dev Complete cross-module transaction
     */
    function completeCrossModuleTransaction(bytes32 _txId) 
        external 
        onlyRole(MODULE_ROLE)
        returns (bool) 
    {
        CrossModuleTransaction storage txn = transactions[_txId];
        require(txn.status == TransactionStatus.PROCESSING, "Invalid status");
        
        txn.status = TransactionStatus.COMPLETED;
        entities[txn.initiator].totalTransactions++;
        
        emit CrossModuleTransactionCompleted(_txId, block.timestamp);
        return true;
    }
    
    /**
     * @dev Update entity reputation
     */
    function updateReputation(
        address _entity,
        int256 _change
    ) external onlyRole(MODULE_ROLE) {
        Entity storage entity = entities[_entity];
        require(entity.wallet != address(0), "Entity not found");
        
        uint256 oldScore = entity.reputationScore;
        
        if (_change > 0) {
            entity.reputationScore += uint256(_change);
            if (entity.reputationScore > 1000) {
                entity.reputationScore = 1000; // Cap at 1000
            }
        } else {
            uint256 decrease = uint256(-_change);
            if (decrease >= entity.reputationScore) {
                entity.reputationScore = 0;
            } else {
                entity.reputationScore -= decrease;
            }
        }
        
        emit ReputationUpdated(_entity, oldScore, entity.reputationScore);
    }
    
    /**
     * @dev Set module contract addresses
     */
    function setModuleAddress(
        string memory _moduleName,
        address _moduleAddress
    ) external onlyRole(ADMIN_ROLE) {
        require(_moduleAddress != address(0), "Invalid address");
        
        bytes32 moduleHash = keccak256(bytes(_moduleName));
        
        if (moduleHash == keccak256("healthcare")) {
            healthcareModule = _moduleAddress;
        } else if (moduleHash == keccak256("agriculture")) {
            agricultureModule = _moduleAddress;
        } else if (moduleHash == keccak256("supply_chain")) {
            supplyChainModule = _moduleAddress;
        } else if (moduleHash == keccak256("sustainability")) {
            sustainabilityModule = _moduleAddress;
        } else {
            revert("Unknown module");
        }
        
        _grantRole(MODULE_ROLE, _moduleAddress);
        emit ModuleUpdated(_moduleName, _moduleAddress);
    }
    
    /**
     * @dev Get entity information
     */
    function getEntity(address _wallet) 
        external 
        view 
        returns (Entity memory) 
    {
        return entities[_wallet];
    }
    
    /**
     * @dev Get transaction information
     */
    function getTransaction(bytes32 _txId) 
        external 
        view 
        returns (CrossModuleTransaction memory) 
    {
        return transactions[_txId];
    }
    
    /**
     * @dev Pause contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @dev Unpause contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}


