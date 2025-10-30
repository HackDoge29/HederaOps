// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title AgricultureContract
 * @dev Handles agricultural operations and payments
 */
contract AgricultureContract is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    
    address public orchestrator;
    address public paymentToken; // AGRI token or HBAR
    
    struct Harvest {
        bytes32 harvestId;
        address farmer;
        string cropType;
        uint256 quantity;
        uint8 qualityGrade; // 1-5 (5 = AA, 4 = A, etc.)
        uint256 timestamp;
        bool verified;
    }
    
    struct SalesContract {
        bytes32 contractId;
        address farmer;
        address buyer;
        bytes32 harvestId;
        uint256 quantity;
        uint256 pricePerUnit;
        uint256 totalAmount;
        uint256 escrowAmount;
        bool deliveryConfirmed;
        bool qualityVerified;
        bool completed;
        uint256 createdAt;
    }
    
    struct CropInsurance {
        bytes32 policyId;
        address farmer;
        string cropType;
        uint256 insuredValue;
        uint256 premium;
        uint256 coveragePercentage;
        bool active;
        uint256 startDate;
        uint256 endDate;
    }
    
    mapping(bytes32 => Harvest) public harvests;
    mapping(bytes32 => SalesContract) public salesContracts;
    mapping(bytes32 => CropInsurance) public insurancePolicies;
    mapping(address => bytes32[]) public farmerHarvests;
    
    event HarvestRecorded(
        bytes32 indexed harvestId,
        address indexed farmer,
        string cropType,
        uint256 quantity,
        uint256 timestamp
    );
    
    event SalesContractCreated(
        bytes32 indexed contractId,
        address indexed farmer,
        address indexed buyer,
        uint256 totalAmount
    );
    
    event PaymentProcessed(
        bytes32 indexed contractId,
        address indexed farmer,
        uint256 amount
    );
    
    event InsurancePolicyCreated(
        bytes32 indexed policyId,
        address indexed farmer,
        uint256 insuredValue
    );
    
    event InsurancePayoutProcessed(
        bytes32 indexed policyId,
        address indexed farmer,
        uint256 amount
    );
    
    constructor(address _orchestrator, address _paymentToken) {
        orchestrator = _orchestrator;
        paymentToken = _paymentToken;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @dev Record harvest on blockchain
     */
    function recordHarvest(
        string memory _cropType,
        uint256 _quantity,
        uint8 _qualityGrade
    ) external returns (bytes32) {
        require(_quantity > 0, "Invalid quantity");
        require(_qualityGrade >= 1 && _qualityGrade <= 5, "Invalid grade");
        
        bytes32 harvestId = keccak256(abi.encodePacked(
            msg.sender,
            _cropType,
            _quantity,
            block.timestamp
        ));
        
        harvests[harvestId] = Harvest({
            harvestId: harvestId,
            farmer: msg.sender,
            cropType: _cropType,
            quantity: _quantity,
            qualityGrade: _qualityGrade,
            timestamp: block.timestamp,
            verified: false
        });
        
        farmerHarvests[msg.sender].push(harvestId);
        
        emit HarvestRecorded(
            harvestId,
            msg.sender,
            _cropType,
            _quantity,
            block.timestamp
        );
        
        return harvestId;
    }
    
    /**
     * @dev Create sales contract with escrow
     */
    function createSalesContract(
        address _buyer,
        bytes32 _harvestId,
        uint256 _quantity,
        uint256 _pricePerUnit
    ) external nonReentrant returns (bytes32) {
        Harvest storage harvest = harvests[_harvestId];
        require(harvest.farmer == msg.sender, "Not harvest owner");
        require(harvest.quantity >= _quantity, "Insufficient quantity");
        require(_buyer != address(0), "Invalid buyer");
        
        uint256 totalAmount = _quantity * _pricePerUnit;
        
        bytes32 contractId = keccak256(abi.encodePacked(
            msg.sender,
            _buyer,
            _harvestId,
            block.timestamp
        ));
        
        salesContracts[contractId] = SalesContract({
            contractId: contractId,
            farmer: msg.sender,
            buyer: _buyer,
            harvestId: _harvestId,
            quantity: _quantity,
            pricePerUnit: _pricePerUnit,
            totalAmount: totalAmount,
            escrowAmount: 0,
            deliveryConfirmed: false,
            qualityVerified: false,
            completed: false,
            createdAt: block.timestamp
        });
        
        emit SalesContractCreated(contractId, msg.sender, _buyer, totalAmount);
        return contractId;
    }
    
    /**
     * @dev Buyer deposits payment to escrow
     */
    function depositEscrow(bytes32 _contractId) 
        external 
        payable 
        nonReentrant 
    {
        SalesContract storage contract_ = salesContracts[_contractId];
        require(contract_.buyer == msg.sender, "Not buyer");
        require(!contract_.completed, "Already completed");
        require(msg.value >= contract_.totalAmount, "Insufficient payment");
        
        contract_.escrowAmount = msg.value;
    }
    
    /**
     * @dev Confirm delivery and quality
     */
    function confirmDeliveryAndQuality(bytes32 _contractId) 
        external 
        onlyRole(VERIFIER_ROLE)
    {
        SalesContract storage contract_ = salesContracts[_contractId];
        require(!contract_.completed, "Already completed");
        
        contract_.deliveryConfirmed = true;
        contract_.qualityVerified = true;
    }
    
    /**
     * @dev Process payment to farmer
     */
    function processPayment(bytes32 _contractId) 
        external 
        nonReentrant 
        returns (uint256)
    {
        SalesContract storage contract_ = salesContracts[_contractId];
        require(
            msg.sender == contract_.buyer || 
            hasRole(ADMIN_ROLE, msg.sender),
            "Unauthorized"
        );
        require(contract_.deliveryConfirmed, "Delivery not confirmed");
        require(contract_.qualityVerified, "Quality not verified");
        require(!contract_.completed, "Already completed");
        require(contract_.escrowAmount > 0, "No escrow");
        
        uint256 platformFee = (contract_.escrowAmount * 15) / 10000; // 0.15%
        uint256 farmerPayment = contract_.escrowAmount - platformFee;
        
        contract_.completed = true;
        
        // Transfer to farmer
        (bool success, ) = contract_.farmer.call{value: farmerPayment}("");
        require(success, "Payment failed");
        
        emit PaymentProcessed(
            _contractId,
            contract_.farmer,
            farmerPayment
        );
        
        return farmerPayment;
    }
    
    /**
     * @dev Create crop insurance policy
     */
    function createInsurancePolicy(
        string memory _cropType,
        uint256 _insuredValue,
        uint256 _coveragePercentage,
        uint256 _durationDays
    ) external payable returns (bytes32) {
        require(_insuredValue > 0, "Invalid insured value");
        require(
            _coveragePercentage > 0 && _coveragePercentage <= 100,
            "Invalid coverage"
        );
        
        uint256 premium = (_insuredValue * 4) / 100; // 4% premium
        require(msg.value >= premium, "Insufficient premium");
        
        bytes32 policyId = keccak256(abi.encodePacked(
            msg.sender,
            _cropType,
            block.timestamp
        ));
        
        insurancePolicies[policyId] = CropInsurance({
            policyId: policyId,
            farmer: msg.sender,
            cropType: _cropType,
            insuredValue: _insuredValue,
            premium: premium,
            coveragePercentage: _coveragePercentage,
            active: true,
            startDate: block.timestamp,
            endDate: block.timestamp + (_durationDays * 1 days)
        });
        
        emit InsurancePolicyCreated(policyId, msg.sender, _insuredValue);
        return policyId;
    }
    
    /**
     * @dev Process insurance payout (called by oracle/verifier)
     */
    function processInsurancePayout(
        bytes32 _policyId,
        uint256 _payoutPercentage
    ) external onlyRole(VERIFIER_ROLE) nonReentrant {
        CropInsurance storage policy = insurancePolicies[_policyId];
        require(policy.active, "Policy not active");
        require(block.timestamp <= policy.endDate, "Policy expired");
        require(_payoutPercentage <= 100, "Invalid payout");
        
        uint256 payoutAmount = (policy.insuredValue * 
            policy.coveragePercentage * 
            _payoutPercentage) / 10000;
        
        policy.active = false;
        
        (bool success, ) = policy.farmer.call{value: payoutAmount}("");
        require(success, "Payout failed");
        
        emit InsurancePayoutProcessed(_policyId, policy.farmer, payoutAmount);
    }
    
    /**
     * @dev Get farmer's harvests
     */
    function getFarmerHarvests(address _farmer) 
        external 
        view 
        returns (bytes32[] memory) 
    {
        return farmerHarvests[_farmer];
    }
}
