// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title HealthcareContract
 * @dev Manages healthcare records and insurance
 */
contract HealthcareContract is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant PROVIDER_ROLE = keccak256("PROVIDER_ROLE");
    
    address public orchestrator;
    
    struct HealthInsurance {
        bytes32 policyId;
        address patient;
        string planType;
        uint256 monthlyPremium;
        uint256 coverageLimit;
        bool autoDeduct;
        address paymentSource; // Can be agriculture contract
        bool active;
        uint256 startDate;
    }
    
    struct HealthcareVisit {
        bytes32 visitId;
        address patient;
        address facility;
        string diagnosis;
        uint256 cost;
        uint256 insuranceCovered;
        uint256 patientPayment;
        uint256 timestamp;
    }
    
    mapping(bytes32 => HealthInsurance) public insurancePolicies;
    mapping(address => bytes32) public patientInsurance;
    mapping(bytes32 => HealthcareVisit) public visits;
    
    event InsurancePolicyCreated(
        bytes32 indexed policyId,
        address indexed patient,
        uint256 monthlyPremium
    );
    
    event PremiumDeducted(
        bytes32 indexed policyId,
        address indexed patient,
        uint256 amount
    );
    
    event VisitRecorded(
        bytes32 indexed visitId,
        address indexed patient,
        uint256 cost
    );
    
    constructor(address _orchestrator) {
        orchestrator = _orchestrator;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @dev Create health insurance policy
     */
    function createInsurancePolicy(
        string memory _planType,
        uint256 _monthlyPremium,
        uint256 _coverageLimit,
        bool _autoDeduct
    ) external returns (bytes32) {
        bytes32 policyId = keccak256(abi.encodePacked(
            msg.sender,
            _planType,
            block.timestamp
        ));
        
        insurancePolicies[policyId] = HealthInsurance({
            policyId: policyId,
            patient: msg.sender,
            planType: _planType,
            monthlyPremium: _monthlyPremium,
            coverageLimit: _coverageLimit,
            autoDeduct: _autoDeduct,
            paymentSource: address(0),
            active: true,
            startDate: block.timestamp
        });
        
        patientInsurance[msg.sender] = policyId;
        
        emit InsurancePolicyCreated(policyId, msg.sender, _monthlyPremium);
        return policyId;
    }
    
    /**
     * @dev Deduct premium (called by agriculture contract)
     */
    function deductPremium(address _patient, uint256 _amount) 
        external 
        returns (bool) 
    {
        bytes32 policyId = patientInsurance[_patient];
        HealthInsurance storage policy = insurancePolicies[policyId];
        
        require(policy.active, "Policy not active");
        require(policy.autoDeduct, "Auto-deduct not enabled");
        require(_amount >= policy.monthlyPremium, "Insufficient amount");
        
        emit PremiumDeducted(policyId, _patient, policy.monthlyPremium);
        return true;
    }
    
    /**
     * @dev Record healthcare visit
     */
    function recordVisit(
        address _patient,
        address _facility,
        string memory _diagnosis,
        uint256 _cost
    ) external onlyRole(PROVIDER_ROLE) returns (bytes32) {
        bytes32 visitId = keccak256(abi.encodePacked(
            _patient,
            _facility,
            block.timestamp
        ));
        
        bytes32 policyId = patientInsurance[_patient];
        HealthInsurance storage policy = insurancePolicies[policyId];
        
        uint256 insuranceCovered = 0;
        uint256 patientPayment = _cost;
        
        if (policy.active && _cost <= policy.coverageLimit) {
            insuranceCovered = (_cost * 80) / 100; // 80% coverage
            patientPayment = _cost - insuranceCovered;
        }
        
        visits[visitId] = HealthcareVisit({
            visitId: visitId,
            patient: _patient,
            facility: _facility,
            diagnosis: _diagnosis,
            cost: _cost,
            insuranceCovered: insuranceCovered,
            patientPayment: patientPayment,
            timestamp: block.timestamp
        });
        
        emit VisitRecorded(visitId, _patient, _cost);
        return visitId;
    }
}
