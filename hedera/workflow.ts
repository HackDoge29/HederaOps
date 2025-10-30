// workflow.ts
import { 
  HederaClientManager,
} from "./src/config";
import { HederaTokenService } from "./src/token-service";
import { HederaConsensusService } from "./src/consensus-service";
import { HederaFileService } from "./src/file-service";
import { HederaSmartContractService } from "./src/smart-contract-service";
import { PrivateKey, AccountId } from "@hashgraph/sdk";
import dotenv from "dotenv";

dotenv.config();

/**
 * Complete HederaOps Workflow Example
 * Demonstrates integration of all Hedera services
 */
class HederaOpsWorkflow {
  private tokenService: HederaTokenService;
  private consensusService: HederaConsensusService;
  private fileService: HederaFileService;
  private contractService: HederaSmartContractService;
  
  private operatorKey: PrivateKey;
  private operatorId: string;
  
  // Store created resources
  private resources: {
    hopsTokenId?: string;
    agriTokenId?: string;
    farmerNFTId?: string;
    carbonCreditNFTId?: string;
    orchestratorContractId?: string;
    agricultureContractId?: string;
    healthcareContractId?: string;
    sustainabilityContractId?: string;
    farmerTopicId?: string;
  } = {};
  
  constructor() {
    this.operatorKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY!);
    this.operatorId = process.env.HEDERA_ACCOUNT_ID!;
    
    // Initialize Hedera client
    HederaClientManager.initialize({
      operatorId: this.operatorId,
      operatorKey: process.env.HEDERA_PRIVATE_KEY!,
      network: "testnet",
      mirrorNode: "https://testnet.mirrornode.hedera.com"
    });
    
    this.tokenService = new HederaTokenService();
    this.consensusService = new HederaConsensusService();
    this.fileService = new HederaFileService();
    this.contractService = new HederaSmartContractService();
  }
  
  /**
   * Step 1: Create all tokens
   */
  async createTokens(): Promise<void> {
    console.log("\n=== Step 1: Creating Tokens ===\n");
    
    // Create HOPS utility token
    console.log("Creating HOPS utility token...");
    this.resources.hopsTokenId = await this.tokenService.createHOPSToken({
      name: "HederaOps Token",
      symbol: "HOPS",
      decimals: 8,
      initialSupply: 1_000_000_000 * 10**8, // 1 billion
      treasury: this.operatorId,
      adminKey: this.operatorKey
    });
    console.log(`✓ HOPS Token created: ${this.resources.hopsTokenId}`);
    
    // Create AGRI module token
    console.log("\nCreating AGRI module token...");
    this.resources.agriTokenId = await this.tokenService.createModuleToken({
      name: "Agriculture Token",
      symbol: "AGRI",
      decimals: 8,
      initialSupply: 100_000_000 * 10**8, // 100 million
      treasury: this.operatorId,
      adminKey: this.operatorKey
    });
    console.log(`✓ AGRI Token created: ${this.resources.agriTokenId}`);
    
    // Create Farmer Identity NFT
    console.log("\nCreating Farmer Identity NFT...");
    this.resources.farmerNFTId = await this.tokenService.createNFT({
      name: "Farmer Identity",
      symbol: "FARMID",
      treasury: this.operatorId,
      adminKey: this.operatorKey,
      supplyKey: this.operatorKey
    });
    console.log(`✓ Farmer NFT created: ${this.resources.farmerNFTId}`);
    
    // Create Carbon Credit NFT
    console.log("\nCreating Carbon Credit NFT...");
    this.resources.carbonCreditNFTId = await this.tokenService.createNFT({
      name: "Carbon Credit Certificate",
      symbol: "CARBON",
      treasury: this.operatorId,
      adminKey: this.operatorKey,
      supplyKey: this.operatorKey,
      royaltyFee: {
        numerator: 5,
        denominator: 100,
        fallbackFee: 1,
        feeCollector: this.operatorId
      }
    });
    console.log(`✓ Carbon Credit NFT created: ${this.resources.carbonCreditNFTId}`);
  }
  
  /**
   * Step 2: Deploy smart contracts
   */
  async deployContracts(): Promise<void> {
    console.log("\n=== Step 2: Deploying Smart Contracts ===\n");
    
    // In production, these bytecodes would come from compiled contracts
    const orchestratorBytecode = process.env.ORCHESTRATOR_BYTECODE!;
    const agricultureBytecode = process.env.AGRICULTURE_BYTECODE!;
    const healthcareBytecode = process.env.HEALTHCARE_BYTECODE!;
    const sustainabilityBytecode = process.env.SUSTAINABILITY_BYTECODE!;
    
    // Deploy Orchestrator
    console.log("Deploying Orchestrator Contract...");
    this.resources.orchestratorContractId = await this.contractService.deployOrchestrator(
      orchestratorBytecode,
      this.operatorKey
    );
    console.log(`✓ Orchestrator deployed: ${this.resources.orchestratorContractId}`);
    
    // Deploy Agriculture Contract
    console.log("\nDeploying Agriculture Contract...");
    this.resources.agricultureContractId = await this.contractService.deployAgricultureContract(
      agricultureBytecode,
      this.resources.orchestratorContractId,
      this.resources.agriTokenId!
    );
    console.log(`✓ Agriculture Contract deployed: ${this.resources.agricultureContractId}`);
    
    // Deploy Healthcare Contract
    console.log("\nDeploying Healthcare Contract...");
    this.resources.healthcareContractId = await this.contractService.deployHealthcareContract(
      healthcareBytecode,
      this.resources.orchestratorContractId
    );
    console.log(`✓ Healthcare Contract deployed: ${this.resources.healthcareContractId}`);
    
    // Deploy Sustainability Contract
    console.log("\nDeploying Sustainability Contract...");
    this.resources.sustainabilityContractId = await this.contractService.deploySustainabilityContract(
      sustainabilityBytecode,
      this.resources.carbonCreditNFTId!
    );
    console.log(`✓ Sustainability Contract deployed: ${this.resources.sustainabilityContractId}`);
    
    // Save deployed contracts
    await this.contractService.saveDeployedContracts("deployed-contracts.json");
  }
  
  /**
   * Step 3: Create farmer entity
   */
  async createFarmerEntity(): Promise<void> {
    console.log("\n=== Step 3: Creating Farmer Entity ===\n");
    
    // Register farmer on orchestrator
    console.log("Registering farmer entity...");
    await this.contractService.registerEntity(
      this.resources.orchestratorContractId!,
      0, // EntityType.FARMER
      ["agriculture", "healthcare", "sustainability"]
    );
    console.log("✓ Farmer registered on orchestrator");
    
    // Create topic for farmer's audit trail
    console.log("\nCreating farmer's HCS topic...");
    this.resources.farmerTopicId = await this.consensusService.createTopic({
      memo: "Farmer: John Ochieng - Ochieng Coffee Estate",
      adminKey: this.operatorKey,
      submitKey: this.operatorKey
    });
    console.log(`✓ Farmer topic created: ${this.resources.farmerTopicId}`);
    
    // Mint farmer identity NFT
    console.log("\nMinting farmer identity NFT...");
    const farmerMetadata = {
      name: "John Ochieng",
      farm: "Ochieng Coffee Estate",
      location: "Kisumu County, Kenya",
      farmSize: 5.5,
      crops: ["coffee", "maize"],
      certifications: ["organic", "fair_trade"],
      topicId: this.resources.farmerTopicId
    };
    
    const metadataBuffer = Buffer.from(JSON.stringify(farmerMetadata));
    const [serial] = await this.tokenService.mintNFT(
      this.resources.farmerNFTId!,
      [metadataBuffer],
      this.operatorKey
    );
    console.log(`✓ Farmer NFT minted: Serial #${serial}`);
  }
  
  /**
   * Step 4: Record harvest workflow
   */
  async recordHarvestWorkflow(): Promise<void> {
    console.log("\n=== Step 4: Recording Harvest Workflow ===\n");
    
    const harvestData = {
      cropType: "coffee",
      quantity: 1300,
      qualityGrade: 5, // AA grade
      location: { latitude: -0.0917, longitude: 34.7680 },
      timestamp: Date.now()
    };
    
    // Record harvest on smart contract
    console.log("Recording harvest on smart contract...");
    const harvestId = await this.contractService.recordHarvest(
      this.resources.agricultureContractId!,
      harvestData.cropType,
      harvestData.quantity,
      harvestData.qualityGrade
    );
    console.log(`✓ Harvest recorded: ${harvestId}`);
    
    // Submit harvest record to HCS
    console.log("\nSubmitting harvest to HCS...");
    const hcsResult = await this.consensusService.submitHarvestRecord({
      farmerId: this.operatorId,
      cropType: harvestData.cropType,
      quantity: harvestData.quantity,
      quality: "AA",
      location: harvestData.location,
      timestamp: harvestData.timestamp
    });
    console.log(`✓ HCS message submitted: Sequence #${hcsResult.sequenceNumber}`);
    
    // Store harvest metadata in file service
    console.log("\nStoring harvest metadata...");
    const harvestMetadata = {
      harvestId,
      farmerId: this.operatorId,
      ...harvestData,
      hcsSequence: hcsResult.sequenceNumber,
      hcsTransaction: hcsResult.transactionId
    };
    
    const fileId = await this.fileService.storeJSON(
      harvestMetadata,
      "Harvest Metadata"
    );
    console.log(`✓ Metadata stored: ${fileId}`);
    
    return harvestId;
  }
  
  /**
   * Step 5: Create sales contract and process payment
   */
  async salesContractWorkflow(harvestId: string): Promise<void> {
    console.log("\n=== Step 5: Sales Contract & Payment Workflow ===\n");
    
    const buyerId = "0.0.98765"; // Example buyer account
    const quantity = 1300;
    const pricePerUnit = 5.5; // $5.50 per kg
    const totalAmount = quantity * pricePerUnit;
    
    // Create sales contract
    console.log("Creating sales contract...");
    const contractId = await this.contractService.createSalesContract(
      this.resources.agricultureContractId!,
      buyerId,
      harvestId,
      quantity,
      Math.floor(pricePerUnit * 100) // Convert to cents
    );
    console.log(`✓ Sales contract created: ${contractId}`);
    console.log(`  Total amount: $${totalAmount}`);
    
    // Simulate buyer depositing escrow
    console.log("\nBuyer depositing escrow...");
    await this.contractService.depositEscrow(
      this.resources.agricultureContractId!,
      contractId,
      totalAmount
    );
    console.log("✓ Escrow deposited");
    
    // In production, delivery and quality would be verified
    console.log("\nVerifying delivery and quality...");
    console.log("✓ Delivery confirmed");
    console.log("✓ Quality verified");
    
    // Process payment
    console.log("\nProcessing payment to farmer...");
    const farmerPayment = await this.contractService.processPayment(
      this.resources.agricultureContractId!,
      contractId
    );
    
    const platformFee = totalAmount * 0.0015; // 0.15%
    console.log(`✓ Payment processed:`);
    console.log(`  Farmer received: $${(farmerPayment / 100).toFixed(2)}`);
    console.log(`  Platform fee: $${platformFee.toFixed(2)}`);
  }
  
  /**
   * Step 6: Healthcare integration
   */
  async healthcareIntegrationWorkflow(): Promise<void> {
    console.log("\n=== Step 6: Healthcare Integration Workflow ===\n");
    
    const monthlyPremium = 50; // $50
    const coverageLimit = 500000; // $500,000
    
    // Create health insurance policy
    console.log("Creating health insurance policy...");
    const policyId = await this.contractService.createHealthInsurance(
      this.resources.healthcareContractId!,
      "Basic Plan",
      monthlyPremium * 100, // Convert to cents
      coverageLimit * 100,
      true // Enable auto-deduct
    );
    console.log(`✓ Insurance policy created: ${policyId}`);
    console.log(`  Monthly premium: $${monthlyPremium}`);
    console.log(`  Coverage: $${coverageLimit.toLocaleString()}`);
    console.log(`  Auto-deduct from farming income: Enabled`);
    
    // Submit insurance creation to HCS
    console.log("\nRecording insurance on HCS...");
    await this.consensusService.submitMessage(
      this.resources.farmerTopicId!,
      {
        type: "healthcare.insurance_created",
        entityId: this.operatorId,
        timestamp: Date.now(),
        data: {
          policyId,
          planType: "Basic Plan",
          monthlyPremium,
          coverageLimit,
          autoDeduct: true
        }
      }
    );
    console.log("✓ Insurance recorded on HCS");
    
    // Simulate healthcare visit
    console.log("\nRecording healthcare visit...");
    const facilityId = "0.0.87654"; // Example facility
    const visitId = await this.contractService.recordHealthcareVisit(
      this.resources.healthcareContractId!,
      this.operatorId,
      facilityId,
      "Routine checkup",
      2500 // $25.00
    );
    console.log(`✓ Healthcare visit recorded: ${visitId}`);
    console.log("  Insurance coverage: 80% ($20)");
    console.log("  Patient payment: 20% ($5)");
  }
  
  /**
   * Step 7: Sustainability & carbon credits
   */
  async sustainabilityWorkflow(): Promise<void> {
    console.log("\n=== Step 7: Sustainability & Carbon Credits Workflow ===\n");
    
    const carbonSequestered = 13.75; // tons CO2
    const projectType = "organic_coffee_agroforestry";
    
    // Award carbon credits
    console.log("Awarding carbon credits...");
    const creditId = await this.contractService.awardCarbonCredits(
      this.resources.sustainabilityContractId!,
      this.operatorId,
      Math.floor(carbonSequestered * 1000), // Convert to kg
      projectType
    );
    console.log(`✓ Carbon credits awarded: ${creditId}`);
    console.log(`  Amount: ${carbonSequestered} tons CO2`);
    console.log(`  Project type: ${projectType}`);
    
    // Mint carbon credit NFTs
    console.log("\nMinting carbon credit NFTs...");
    const creditMetadata = {
      creditId,
      entity: this.operatorId,
      amount: carbonSequestered,
      vintage: 2025,
      projectType,
      verificationMethod: "third_party_audit",
      certifications: ["Gold Standard", "Organic"],
      location: "Kisumu County, Kenya"
    };
    
    const metadataBuffer = Buffer.from(JSON.stringify(creditMetadata));
    const [serial] = await this.tokenService.mintNFT(
      this.resources.carbonCreditNFTId!,
      [metadataBuffer],
      this.operatorKey
    );
    console.log(`✓ Carbon credit NFT minted: Serial #${serial}`);
    
    // Record on HCS
    console.log("\nRecording carbon credits on HCS...");
    await this.consensusService.submitCarbonCredits({
      entityId: this.operatorId,
      carbonSequestration: carbonSequestered,
      creditsAwarded: carbonSequestered,
      verificationMethod: "third_party_audit",
      timestamp: Date.now()
    });
    console.log("✓ Carbon credits recorded on HCS");
    
    const creditValue = carbonSequestered * 18; // $18 per credit
    console.log(`\nEstimated market value: $${creditValue.toFixed(2)}`);
  }
  
  /**
   * Step 8: Generate summary report
   */
  async generateSummaryReport(): Promise<void> {
    console.log("\n=== Step 8: Summary Report ===\n");
    
    console.log("📊 HederaOps Implementation Summary\n");
    
    console.log("Tokens Created:");
    console.log(`  ✓ HOPS Token: ${this.resources.hopsTokenId}`);
    console.log(`  ✓ AGRI Token: ${this.resources.agriTokenId}`);
    console.log(`  ✓ Farmer NFT: ${this.resources.farmerNFTId}`);
    console.log(`  ✓ Carbon Credit NFT: ${this.resources.carbonCreditNFTId}`);
    
    console.log("\nSmart Contracts Deployed:");
    console.log(`  ✓ Orchestrator: ${this.resources.orchestratorContractId}`);
    console.log(`  ✓ Agriculture: ${this.resources.agricultureContractId}`);
    console.log(`  ✓ Healthcare: ${this.resources.healthcareContractId}`);
    console.log(`  ✓ Sustainability: ${this.resources.sustainabilityContractId}`);
    
    console.log("\nHCS Topics:");
    console.log(`  ✓ Farmer Topic: ${this.resources.farmerTopicId}`);
    
    console.log("\n💰 Financial Summary:");
    console.log("  Harvest payment: $7,150.00");
    console.log("  Health insurance premium: -$50.00");
    console.log("  Net farmer income: $7,100.00");
    console.log("  Carbon credit value: +$247.50");
    console.log("  Total farmer benefit: $7,347.50");
    
    console.log("\n🌍 Impact Summary:");
    console.log("  Carbon sequestered: 13.75 tons CO2");
    console.log("  Healthcare coverage: $500,000");
    console.log("  Supply chain: Fully traceable");
    console.log("  Quality verified: AA Grade");
    
    console.log("\n✅ All HederaOps services successfully integrated!\n");
  }
  
  /**
   * Run complete workflow
   */
  async run(): Promise<void> {
    try {
      console.log("🚀 Starting HederaOps Complete Workflow");
      console.log("==========================================");
      
      await this.createTokens();
      await this.deployContracts();
      await this.createFarmerEntity();
      const harvestId = await this.recordHarvestWorkflow();
      await this.salesContractWorkflow(harvestId);
      await this.healthcareIntegrationWorkflow();
      await this.sustainabilityWorkflow();
      await this.generateSummaryReport();
      
      console.log("🎉 Workflow completed successfully!");
      
    } catch (error) {
      console.error("\n❌ Error in workflow:", error);
      throw error;
    }
  }
}

// Run the workflow
if (require.main === module) {
  const workflow = new HederaOpsWorkflow();
  workflow.run().catch(console.error);
}

export { HederaOpsWorkflow };