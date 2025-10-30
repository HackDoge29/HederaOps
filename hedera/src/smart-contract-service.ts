// src/hedera/smart-contract-service.ts
import {
  ContractCreateFlow,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractCallQuery,
  ContractId,
  ContractFunctionResult,
  PrivateKey,
  Hbar
} from "@hashgraph/sdk";
import { HederaClientManager } from "./config";
import { HederaFileService } from "./file-service";
import { ethers } from "ethers";
import fs from "fs";

export interface ContractDeployConfig {
  bytecode: string;
  gas: number;
  constructorParams?: any[];
  adminKey?: PrivateKey;
}

export class HederaSmartContractService {
  private client = HederaClientManager.getClient();
  private fileService = new HederaFileService();
  
  // Store deployed contract IDs
  private deployedContracts: Map<string, string> = new Map();
  
  /**
   * Deploy smart contract to Hedera
   */
  async deployContract(
    name: string,
    config: ContractDeployConfig
  ): Promise<string> {
    // Store bytecode in Hedera File Service
    const bytecodeBuffer = Buffer.from(config.bytecode.replace("0x", ""), "hex");
    const fileId = await this.fileService.storeContractBytecode(
      bytecodeBuffer,
      name
    );
    
    console.log(`Bytecode stored in file: ${fileId}`);
    
    // Create contract
    const contractCreate = new ContractCreateFlow()
      .setBytecodeFileId(fileId)
      .setGas(config.gas);
    
    if (config.adminKey) {
      contractCreate.setAdminKey(config.adminKey);
    }
    
    if (config.constructorParams && config.constructorParams.length > 0) {
      const params = this.encodeConstructorParams(config.constructorParams);
      contractCreate.setConstructorParameters(params);
    }
    
    const response = await contractCreate.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    const contractId = receipt.contractId!.toString();
    
    this.deployedContracts.set(name, contractId);
    console.log(`${name} deployed at: ${contractId}`);
    
    return contractId;
  }
  
  /**
   * Deploy HederaOps Orchestrator Contract
   */
  async deployOrchestrator(
    bytecode: string,
    adminKey: PrivateKey
  ): Promise<string> {
    return this.deployContract("HederaOpsOrchestrator", {
      bytecode,
      gas: 3_000_000,
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
      gas: 3_000_000,
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
      gas: 3_000_000,
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
      gas: 3_000_000,
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
    gas: number = 1_000_000,
    payableAmount?: number
  ): Promise<ContractFunctionResult> {
    const transaction = new ContractExecuteTransaction()
      .setContractId(ContractId.fromString(contractId))
      .setGas(gas)
      .setFunction(functionName, params);
    
    if (payableAmount) {
      transaction.setPayableAmount(new Hbar(payableAmount));
    }
    
    const response = await transaction.execute(this.client);
    const record = await response.getRecord(this.client);
    
    return record.contractFunctionResult!;
  }
  
  /**
   * Query contract (read-only)
   */
  async queryContract(
    contractId: string,
    functionName: string,
    params: ContractFunctionParameters,
    gas: number = 100_000
  ): Promise<ContractFunctionResult> {
    const query = new ContractCallQuery()
      .setContractId(ContractId.fromString(contractId))
      .setGas(gas)
      .setFunction(functionName, params);
    
    return await query.execute(this.client);
  }
  
  /**
   * Register entity on orchestrator
   */
  async registerEntity(
    orchestratorId: string,
    entityType: number,
    modules: string[]
  ): Promise<boolean> {
    const params = new ContractFunctionParameters()
      .addUint8(entityType)
      .addStringArray(modules);
    
    const result = await this.executeContract(
      orchestratorId,
      "registerEntity",
      params
    );
    
    return result.getBool(0);
  }
  
  /**
   * Create cross-module transaction
   */
  async createCrossModuleTransaction(
    orchestratorId: string,
    modules: string[],
    value: number
  ): Promise<string> {
    const params = new ContractFunctionParameters()
      .addStringArray(modules)
      .addUint256(value);
    
    const result = await this.executeContract(
      orchestratorId,
      "createCrossModuleTransaction",
      params
    );
    
    return result.getBytes32(0);
  }
  
  /**
   * Record harvest on blockchain
   */
  async recordHarvest(
    agricultureContractId: string,
    cropType: string,
    quantity: number,
    qualityGrade: number
  ): Promise<string> {
    const params = new ContractFunctionParameters()
      .addString(cropType)
      .addUint256(quantity)
      .addUint8(qualityGrade);
    
    const result = await this.executeContract(
      agricultureContractId,
      "recordHarvest",
      params
    );
    
    return result.getBytes32(0);
  }
  
  /**
   * Create sales contract with escrow
   */
  async createSalesContract(
    agricultureContractId: string,
    buyer: string,
    harvestId: string,
    quantity: number,
    pricePerUnit: number
  ): Promise<string> {
    const buyerAccountId = this.convertAddressToAccountId(buyer);
    
    const params = new ContractFunctionParameters()
      .addAddress(buyerAccountId)
      .addBytes32(Buffer.from(harvestId.replace("0x", ""), "hex"))
      .addUint256(quantity)
      .addUint256(pricePerUnit);
    
    const result = await this.executeContract(
      agricultureContractId,
      "createSalesContract",
      params
    );
    
    return result.getBytes32(0);
  }
  
  /**
   * Deposit escrow for sales contract
   */
  async depositEscrow(
    agricultureContractId: string,
    contractId: string,
    amount: number
  ): Promise<void> {
    const params = new ContractFunctionParameters()
      .addBytes32(Buffer.from(contractId.replace("0x", ""), "hex"));
    
    await this.executeContract(
      agricultureContractId,
      "depositEscrow",
      params,
      1_000_000,
      amount
    );
  }
  
  /**
   * Process payment to farmer
   */
  async processPayment(
    agricultureContractId: string,
    contractId: string
  ): Promise<number> {
    const params = new ContractFunctionParameters()
      .addBytes32(Buffer.from(contractId.replace("0x", ""), "hex"));
    
    const result = await this.executeContract(
      agricultureContractId,
      "processPayment",
      params,
      1_500_000
    );
    
    return result.getUint256(0);
  }
  
  /**
   * Create crop insurance policy
   */
  async createInsurancePolicy(
    agricultureContractId: string,
    cropType: string,
    insuredValue: number,
    coveragePercentage: number,
    durationDays: number,
    premiumAmount: number
  ): Promise<string> {
    const params = new ContractFunctionParameters()
      .addString(cropType)
      .addUint256(insuredValue)
      .addUint256(coveragePercentage)
      .addUint256(durationDays);
    
    const result = await this.executeContract(
      agricultureContractId,
      "createInsurancePolicy",
      params,
      1_000_000,
      premiumAmount
    );
    
    return result.getBytes32(0);
  }
  
  /**
   * Create health insurance policy
   */
  async createHealthInsurance(
    healthcareContractId: string,
    planType: string,
    monthlyPremium: number,
    coverageLimit: number,
    autoDeduct: boolean
  ): Promise<string> {
    const params = new ContractFunctionParameters()
      .addString(planType)
      .addUint256(monthlyPremium)
      .addUint256(coverageLimit)
      .addBool(autoDeduct);
    
    const result = await this.executeContract(
      healthcareContractId,
      "createInsurancePolicy",
      params
    );
    
    return result.getBytes32(0);
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
    const patientAccountId = this.convertAddressToAccountId(patient);
    const facilityAccountId = this.convertAddressToAccountId(facility);
    
    const params = new ContractFunctionParameters()
      .addAddress(patientAccountId)
      .addAddress(facilityAccountId)
      .addString(diagnosis)
      .addUint256(cost);
    
    const result = await this.executeContract(
      healthcareContractId,
      "recordVisit",
      params
    );
    
    return result.getBytes32(0);
  }
  
  /**
   * Award carbon credits
   */
  async awardCarbonCredits(
    sustainabilityContractId: string,
    entity: string,
    amount: number,
    projectType: string
  ): Promise<string> {
    const entityAccountId = this.convertAddressToAccountId(entity);
    
    const params = new ContractFunctionParameters()
      .addAddress(entityAccountId)
      .addUint256(amount)
      .addString(projectType);
    
    const result = await this.executeContract(
      sustainabilityContractId,
      "awardCarbonCredits",
      params
    );
    
    return result.getBytes32(0);
  }
  
  /**
   * Query entity information
   */
  async getEntity(
    orchestratorId: string,
    entityAddress: string
  ): Promise<any> {
    const accountId = this.convertAddressToAccountId(entityAddress);
    
    const params = new ContractFunctionParameters()
      .addAddress(accountId);
    
    const result = await this.queryContract(
      orchestratorId,
      "getEntity",
      params
    );
    
    return this.decodeEntityResult(result);
  }
  
  /**
   * Query harvest information
   */
  async getHarvest(
    agricultureContractId: string,
    harvestId: string
  ): Promise<any> {
    const params = new ContractFunctionParameters()
      .addBytes32(Buffer.from(harvestId.replace("0x", ""), "hex"));
    
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
    
    // Decode array of bytes32
    const harvestIds: string[] = [];
    const count = result.getUint256(0);
    
    for (let i = 0; i < count; i++) {
      harvestIds.push(result.getBytes32(i + 1));
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
          // Hedera account ID
          contractParams.addAddress(param);
        } else {
          contractParams.addString(param);
        }
      } else if (typeof param === "number") {
        contractParams.addUint256(param);
      } else if (typeof param === "boolean") {
        contractParams.addBool(param);
      }
    });
    
    return contractParams.toBytes();
  }
  
  /**
   * Helper: Convert Hedera address to account ID
   */
  private convertAddressToAccountId(address: string): string {
    // If already in account ID format
    if (address.startsWith("0.0.")) {
      return address;
    }
    
    // Convert EVM address to Hedera account ID
    // In production, this would query the mirror node
    return address;
  }
  
  /**
   * Helper: Decode entity result
   */
  private decodeEntityResult(result: ContractFunctionResult): any {
    return {
      wallet: result.getAddress(0),
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
      harvestId: result.getBytes32(0),
      farmer: result.getAddress(1),
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
    await fs.promises.writeFile(
      filename,
      JSON.stringify(contracts, null, 2)
    );
  }
  
  /**
   * Load deployed contract addresses from file
   */
  async loadDeployedContracts(filename: string): Promise<void> {
    const data = await fs.promises.readFile(filename, "utf-8");
    const contracts = JSON.parse(data);
    
    Object.entries(contracts).forEach(([name, address]) => {
      this.deployedContracts.set(name, address as string);
    });
  }
}

// Export service
export { HederaSmartContractService };