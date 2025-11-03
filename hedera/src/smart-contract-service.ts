// src/hedera/smart-contract-service.ts
import {
  ContractCreateFlow,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractCallQuery,
  ContractId,
  ContractFunctionResult,
  PrivateKey,
  Hbar,
  Status
} from "@hashgraph/sdk";
import { HederaClientManager } from "./config.js";
import { ethers } from "ethers";
import fs from "fs/promises";

export interface ContractDeployConfig {
  bytecode: string;
  gas: number;
  constructorParams?: any[];
  adminKey?: PrivateKey;
}

export class HederaSmartContractService {
  private client = HederaClientManager.getClient();
  
  // Store deployed contract IDs
  private deployedContracts: Map<string, string> = new Map();
  
  /**
   * Retry helper for network operations
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 2000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a retryable error
        const isRetryable = 
          error.message?.includes('UNKNOWN') ||
          error.message?.includes('UNAVAILABLE') ||
          error.message?.includes('DEADLINE_EXCEEDED') ||
          error.code === 2 || // gRPC UNKNOWN
          error.code === 14; // gRPC UNAVAILABLE
        
        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }
        
        console.log(`⚠️  Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // Exponential backoff
        delayMs *= 1.5;
      }
    }
    
    throw lastError;
  }
  
  /**
   * Deploy smart contract to Hedera using ContractCreateFlow
   */
  async deployContract(
    name: string,
    config: ContractDeployConfig
  ): Promise<string> {
    console.log(`\n📝 Deploying ${name}...`);
    console.log(`   Bytecode size: ${config.bytecode.length / 2 - 1} bytes`);
    console.log(`   Gas limit: ${config.gas.toLocaleString()}`);
    
    // Remove 0x prefix if present
    const bytecodeHex = config.bytecode.replace("0x", "");
    
    // Create contract using ContractCreateFlow (handles large bytecode automatically)
    const contractCreateFlow = new ContractCreateFlow()
      .setBytecode(bytecodeHex)
      .setGas(config.gas);
    
    if (config.adminKey) {
      contractCreateFlow.setAdminKey(config.adminKey);
    }
    
    if (config.constructorParams && config.constructorParams.length > 0) {
      const params = this.encodeConstructorParams(config.constructorParams);
      contractCreateFlow.setConstructorParameters(params);
    }
    
    console.log("   Executing contract creation...");
    const contractId = await this.retryOperation(async () => {
      const contractCreateTx = await contractCreateFlow.execute(this.client);
      console.log(`   Tx submitted: ${contractCreateTx.transactionId.toString()}`);
      
      const contractCreateRx = await contractCreateTx.getReceipt(this.client);
      
      if (contractCreateRx.status !== Status.Success) {
        throw new Error(`Deployment failed with status: ${contractCreateRx.status.toString()}`);
      }
      
      if (!contractCreateRx.contractId) {
        throw new Error('Failed to retrieve contract ID from receipt');
      }
      
      return contractCreateRx.contractId.toString();
    }, 5, 3000);
    
    this.deployedContracts.set(name, contractId);
    console.log(`   ✅ ${name} deployed: ${contractId}`);
    console.log(`   🔍 Explorer: https://hashscan.io/testnet/contract/${contractId}\n`);
    
    return contractId;
  }
  
  /**
   * Deploy HederaOps Orchestrator Contract
   */
  async deployOrchestrator(
    bytecode: string,
    adminKey: PrivateKey
  ): Promise<string> {
    return this.deployContract("Orchestrator", {
      bytecode,
      gas: 3_500_000,
      adminKey
    });
  }
  
  /**
   * Deploy Agriculture Contract
   */
  async deployAgricultureContract(
    bytecode: string,
    orchestratorAddress: string,
    paymentTokenAddress: string
  ): Promise<string> {
    return this.deployContract("AgricultureContract", {
      bytecode,
      gas: 3_500_000,
      constructorParams: [orchestratorAddress, paymentTokenAddress]
    });
  }
  
  /**
   * Deploy Healthcare Contract
   */
  async deployHealthcareContract(
    bytecode: string,
    orchestratorAddress: string
  ): Promise<string> {
    return this.deployContract("HealthcareContract", {
      bytecode,
      gas: 3_500_000,
      constructorParams: [orchestratorAddress]
    });
  }
  
  /**
   * Deploy Sustainability Contract
   */
  async deploySustainabilityContract(
    bytecode: string,
    carbonCreditNFTAddress: string
  ): Promise<string> {
    return this.deployContract("SustainabilityContract", {
      bytecode,
      gas: 3_500_000,
      constructorParams: [carbonCreditNFTAddress]
    });
  }
  
  /**
   * Execute contract function
   */
  async executeContract(
    contractId: string,
    functionName: string,
    params: ContractFunctionParameters,
    gas: number = 1000_000,
    payableAmount?: Hbar
  ): Promise<ContractFunctionResult> {
    return this.retryOperation(async () => {
      const transaction = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(contractId))
        .setGas(gas)
        .setFunction(functionName, params);
      
      if (payableAmount) {
        transaction.setPayableAmount(payableAmount);
      }
      
      const response = await transaction.execute(this.client);
      await response.getReceipt(this.client);
      
      // Query result if needed
      const query = new ContractCallQuery()
        .setContractId(ContractId.fromString(contractId))
        .setFunction(functionName, params)
        .setGas(gas);
      
      return query.execute(this.client);
    });
  }
  
  /**
   * Query contract (view function)
   */
  async queryContract(
    contractId: string,
    functionName: string,
    params: ContractFunctionParameters
  ): Promise<ContractFunctionResult> {
    return this.retryOperation(async () => {
      const query = new ContractCallQuery()
        .setContractId(ContractId.fromString(contractId))
        .setFunction(functionName, params)
        .setGas(1000_000);
      
      return query.execute(this.client);
    });
  }
  
  /**
   * Register entity in orchestrator
   */
  async registerEntity(
    orchestratorContractId: string,
    entityType: number,
    modules: string[]
  ): Promise<boolean> {
    console.log("\n📋 Registering entity...");
    const params = new ContractFunctionParameters()
      .addUint8(entityType as any)
      .addStringArray(modules);
    
    try {
      const transaction = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(orchestratorContractId))
        .setGas(1000_000)
        .setFunction("registerEntity", params);
      
      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      
      console.log(`   ✅ Entity registered successfully`);
      return receipt.status === Status.Success;
    } catch (error: any) {
      console.error(`   ❌ Failed to register entity:`, error.message);
      throw error;
    }
  }
  
  /**
   * Record harvest in agriculture contract
   */
  async recordHarvest(
    agricultureContractId: string,
    cropType: string,
    quantity: number,
    qualityGrade: number
  ): Promise<string> {
    console.log("\n🌾 Recording harvest...");
    const params = new ContractFunctionParameters()
      .addString(cropType)
      .addUint256(quantity)
      .addUint8(qualityGrade);
    
    try {
      const transaction = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(agricultureContractId))
        .setGas(500_000)
        .setFunction("recordHarvest", params);
      
      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      
      // Generate harvest ID (you may want to get this from contract event)
      const harvestId = `harvest_${Date.now()}`;
      console.log(`   ✅ Harvest recorded: ${harvestId}`);
      
      return harvestId;
    } catch (error: any) {
      console.error(`   ❌ Failed to record harvest:`, error.message);
      throw error;
    }
  }
  
  /**
   * Get entity info from orchestrator
   */
  async getEntity(
    orchestratorContractId: string,
    wallet: string
  ): Promise<any> {
    const params = new ContractFunctionParameters()
      .addAddress(wallet);
    
    const result = await this.queryContract(
      orchestratorContractId,
      "getEntity",
      params
    );
    
    return this.decodeEntityResult(result);
  }
  
  /**
   * Get specific harvest
   */
  async getHarvest(
    agricultureContractId: string,
    harvestId: string
  ): Promise<any> {
    const params = new ContractFunctionParameters()
      .addBytes32(Uint8Array.from(Buffer.from(ethers.keccak256(ethers.toUtf8Bytes(harvestId)).replace("0x", ""), "hex")));
    
    const result = await this.queryContract(
      agricultureContractId,
      "harvests",
      params
    );
    
    return this.decodeHarvestResult(result);
  }
  
  /**
   * Get farmer's harvests
   */
  async getFarmerHarvests(
    agricultureContractId: string,
    farmerAddress: string
  ): Promise<string[]> {
    const accountId = this.convertAddressToAccountId(farmerAddress);
    
    const params = new ContractFunctionParameters()
      .addAddress(accountId);
    
    const result = await this.queryContract(
      agricultureContractId,
      "getFarmerHarvests",
      params
    );
    
    const harvestIds: string[] = [];
    const count = result.getUint256(0);
    
    for (let i = 0; i < count; i++) {
      harvestIds.push(Buffer.from(result.getBytes32(i + 1)).toString("hex"));
    }
    
    return harvestIds;
  }
  
  /**
   * Helper: Encode constructor parameters
   */
  private encodeConstructorParams(params: any[]): Uint8Array {
    const contractParams = new ContractFunctionParameters();
    
    params.forEach(param => {
      if (typeof param === "string") {
        if (param.startsWith("0.0.")) {
          // Convert Hedera account ID to EVM address
          const evmAddress = this.hederaIdToEvmAddress(param);
          contractParams.addAddress(evmAddress);
        } else if (param.startsWith("0x") && param.length === 42) {
          // Already an EVM address
          contractParams.addAddress(param);
        } else {
          // Regular string parameter
          contractParams.addString(param);
        }
      } else if (typeof param === "number") {
        contractParams.addUint256(param);
      } else if (typeof param === "boolean") {
        contractParams.addBool(param);
      }
    });
    
    return contractParams._build();  
  }
  
  /**
   * Helper: Convert Hedera account/contract ID to EVM address
   */
  private hederaIdToEvmAddress(hederaId: string): string {
    // Parse Hedera ID format: shard.realm.num
    const parts = hederaId.split('.');
    if (parts.length !== 3) {
      throw new Error(`Invalid Hedera ID format: ${hederaId}`);
    }
    
    const [shard, realm, num] = parts.map(p => parseInt(p, 10));
    
    // Hedera uses a simple mapping for testnet/mainnet:
    // The last 8 bytes (20 hex chars) represent the entity number
    // Format: 0x + 20 zeros + entity_num_as_hex
    const numHex = num.toString(16).padStart(40, '0');
    const evmAddress = `0x${numHex}`;
    
    console.log(`   🔄 Converted ${hederaId} -> ${evmAddress}`);
    return evmAddress;
  }
  
  /**
   * Helper: Convert Hedera address to account ID
   */
  private convertAddressToAccountId(address: string): string {
    if (address.startsWith("0.0.")) {
      return address;
    }
    return address;
  }
  
  /**
   * Helper: Decode entity result
   */
  private decodeEntityResult(result: ContractFunctionResult): any {
    return {
      wallet: result.getAddress(0).toString(),
      entityType: result.getUint8(1),
      reputationScore: result.getUint256(2),
      verified: result.getBool(3),
      created: result.getUint256(4),
      totalTransactions: result.getUint256(5)
    };
  }
  
  /**
   * Helper: Decode harvest result
   */
  private decodeHarvestResult(result: ContractFunctionResult): any {
    return {
      harvestId: result.getBytes32(0).toString(),
      farmer: result.getAddress(1).toString(),
      cropType: result.getString(2),
      quantity: result.getUint256(3),
      qualityGrade: result.getUint8(4),
      timestamp: result.getUint256(5),
      verified: result.getBool(6)
    };
  }
  
  /**
   * Get deployed contract address
   */
  getContractAddress(name: string): string | undefined {
    return this.deployedContracts.get(name);
  }
  
  /**
   * Save deployed contract addresses to file
   */
  async saveDeployedContracts(filename: string): Promise<void> {
    const contracts = Object.fromEntries(this.deployedContracts);
    const jsonString = JSON.stringify(contracts, null, 2);
    await fs.writeFile(filename, jsonString);
    console.log(`\n💾 Contract addresses saved to ${filename}`);
  }
  
  /**
   * Load deployed contract addresses from file
   */
  async loadDeployedContracts(filename: string): Promise<void> {
    const data = await fs.readFile(filename, "utf-8");
    const contracts = JSON.parse(data);
    
    Object.entries(contracts).forEach(([name, address]) => {
      this.deployedContracts.set(name, address as string);
    });
    
    console.log(`\n📂 Loaded ${Object.keys(contracts).length} contract addresses from ${filename}`);
  }

  /**
   * Record healthcare visit
   */
  async recordHealthcareVisit(
    healthcareContractId: string,
    patient: string,
    facility: string,
    diagnosis: string,
    cost: number
  ): Promise<string> {
    console.log("\n🏥 Recording healthcare visit...");
    const params = new ContractFunctionParameters()
      .addAddress(patient)
      .addAddress(facility)
      .addString(diagnosis)
      .addUint256(cost);
    
    try {
      const transaction = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(healthcareContractId))
        .setGas(500_000)
        .setFunction("recordVisit", params);
      
      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      
      const visitId = `visit_${Date.now()}`;
      console.log(`   ✅ Visit recorded: ${visitId}`);
      
      return visitId;
    } catch (error: any) {
      console.error(`   ❌ Failed to record visit:`, error.message);
      throw error;
    }
  }
}