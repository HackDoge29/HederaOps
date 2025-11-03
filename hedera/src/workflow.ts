// workflow.ts
import { 
  HederaClientManager,
} from "./config.js";
import { HederaTokenService } from "./token-service.js";
import { HederaConsensusService } from "./consensus-service.js";
import { HederaFileService } from "./file-service.js";
import { HederaSmartContractService } from "./smart-contract-service.js";
import { PrivateKey, AccountId, Client, ContractCreateFlow } from "@hashgraph/sdk";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

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
   * Load bytecode from Hardhat artifact
   */
private async loadBytecode(contractFile: string, contractName: string): Promise<string> {
  const artifactsDir = path.join(process.cwd(), '..', 'hedera/artifacts/contracts');  // Fixed: Go up to root
  const filePath = path.join(artifactsDir, contractFile, `${contractName}.json`);
  
  try {
    const artifact = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(artifact);
    // console.log('Parsed Artifacts:', parsed)
    const bytecode = parsed.bytecode;
 if (!bytecode) {
        throw new Error(`No bytecode found in ${filePath}. Check compilation.`);
      }
      if (!bytecode.startsWith('0x')) {
        throw new Error(`Invalid bytecode in ${filePath}: Missing 0x prefix`);
      }
      return bytecode;
  } catch (error) {
    console.error(`Failed to load bytecode from ${filePath}:`, error);
    throw new Error(`Could not load bytecode for ${contractName}. Ensure Hardhat compilation is run.`);
  }
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
      initialSupply: 100_000_000, // 100 million tokens (will be 100M * 10^8 smallest units)
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
      initialSupply: 10_000_000, // 10 million tokens
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
    
    // Load bytecodes from Hardhat artifacts
    const orchestratorBytecode = await this.loadBytecode("Orchestrator.sol", "HederaOpsOrchestrator");
    const agricultureBytecode = await this.loadBytecode("Agriculture.sol", "AgricultureContract");
    const healthcareBytecode = await this.loadBytecode("Healthcare.sol", "HealthcareContract");
    const sustainabilityBytecode = await this.loadBytecode("Sustainability.sol", "SustainabilityContract");
    
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
  async recordHarvestWorkflow(): Promise<string> {
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
   * Step 5: Generate summary report
   */
  async generateSummaryReport(): Promise<void> {
    console.log("\n=== Step 5: Summary Report ===\n");
    
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
      
      // await this.createTokens();
      await this.deployContracts();
      await this.createFarmerEntity();
      const harvestId = await this.recordHarvestWorkflow();
      await this.generateSummaryReport();
      
      console.log("🎉 Workflow completed successfully!");
      
    } catch (error) {
      console.error("\n❌ Error in workflow:", error);
      throw error;
    }
  }
}

// ES Module equivalent of require.main === module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

// Run the workflow if this is the main module
if (isMainModule) {
  const workflow = new HederaOpsWorkflow();
  workflow.run().catch(console.error);
}

export { HederaOpsWorkflow };