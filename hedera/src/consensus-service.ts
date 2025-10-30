// src/hedera/consensus-service.ts
import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
  PrivateKey,
  TopicUpdateTransaction
} from "@hashgraph/sdk";
import { HederaClientManager } from "./config";

export interface TopicConfig {
  memo: string;
  adminKey?: PrivateKey;
  submitKey?: PrivateKey;
}

export interface MessageData {
  type: string;
  entityId: string;
  timestamp: number;
  data: any;
  signature?: string;
  previousHash?: string;
}

export class HederaConsensusService {
  private client = HederaClientManager.getClient();
  
  /**
   * Create topic for entity audit trail
   */
  async createTopic(config: TopicConfig): Promise<string> {
    const transaction = new TopicCreateTransaction()
      .setTopicMemo(config.memo);
    
    if (config.adminKey) {
      transaction.setAdminKey(config.adminKey);
    }
    
    if (config.submitKey) {
      transaction.setSubmitKey(config.submitKey);
    }
    
    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return receipt.topicId!.toString();
  }
  
  /**
   * Submit message to topic
   */
  async submitMessage(
    topicId: string,
    message: MessageData,
    submitKey?: PrivateKey
  ): Promise<{ transactionId: string; sequenceNumber: number }> {
    const messageJson = JSON.stringify(message);
    const messageBuffer = Buffer.from(messageJson, "utf-8");
    
    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(messageBuffer);
    
    if (submitKey) {
      transaction.freezeWith(this.client);
      const signedTx = await transaction.sign(submitKey);
      const response = await signedTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      
      return {
        transactionId: response.transactionId.toString(),
        sequenceNumber: receipt.topicSequenceNumber.toNumber()
      };
    }
    
    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return {
      transactionId: response.transactionId.toString(),
      sequenceNumber: receipt.topicSequenceNumber.toNumber()
    };
  }
  
  /**
   * Submit harvest record
   */
  async submitHarvestRecord(data: {
    farmerId: string;
    cropType: string;
    quantity: number;
    quality: string;
    location: { latitude: number; longitude: number };
    timestamp: number;
  }): Promise<{ transactionId: string; sequenceNumber: number }> {
    const message: MessageData = {
      type: "agriculture.harvest",
      entityId: data.farmerId,
      timestamp: data.timestamp,
      data: {
        cropType: data.cropType,
        quantity: data.quantity,
        quality: data.quality,
        location: data.location
      }
    };
    
    // In production, calculate hash of previous message
    // message.previousHash = await this.getLastMessageHash(topicId);
    
    // Get topic ID from farmer entity
    const topicId = await this.getEntityTopicId(data.farmerId);
    
    return this.submitMessage(topicId, message);
  }
  
  /**
   * Submit healthcare visit record
   */
  async submitHealthcareVisit(data: {
    patientId: string;
    facilityId: string;
    diagnosis: string;
    treatment: string[];
    cost: number;
    timestamp: number;
  }): Promise<{ transactionId: string; sequenceNumber: number }> {
    const message: MessageData = {
      type: "healthcare.visit",
      entityId: data.patientId,
      timestamp: data.timestamp,
      data: {
        facilityId: data.facilityId,
        diagnosis: data.diagnosis,
        treatment: data.treatment,
        cost: data.cost
      }
    };
    
    const topicId = await this.getEntityTopicId(data.patientId);
    return this.submitMessage(topicId, message);
  }
  
  /**
   * Submit supply chain movement
   */
  async submitSupplyChainMovement(data: {
    productId: string;
    from: string;
    to: string;
    location: { latitude: number; longitude: number };
    conditions: { temperature: number; humidity: number };
    timestamp: number;
  }): Promise<{ transactionId: string; sequenceNumber: number }> {
    const message: MessageData = {
      type: "supplychain.movement",
      entityId: data.productId,
      timestamp: data.timestamp,
      data: {
        from: data.from,
        to: data.to,
        location: data.location,
        conditions: data.conditions
      }
    };
    
    const topicId = await this.getEntityTopicId(data.productId);
    return this.submitMessage(topicId, message);
  }
  
  /**
   * Submit carbon credit calculation
   */
  async submitCarbonCredits(data: {
    entityId: string;
    carbonSequestration: number;
    creditsAwarded: number;
    verificationMethod: string;
    timestamp: number;
  }): Promise<{ transactionId: string; sequenceNumber: number }> {
    const message: MessageData = {
      type: "sustainability.carbon_credits",
      entityId: data.entityId,
      timestamp: data.timestamp,
      data: {
        carbonSequestration: data.carbonSequestration,
        creditsAwarded: data.creditsAwarded,
        verificationMethod: data.verificationMethod
      }
    };
    
    const topicId = await this.getEntityTopicId(data.entityId);
    return this.submitMessage(topicId, message);
  }
  
  /**
   * Update topic (e.g., change admin key)
   */
  async updateTopic(
    topicId: string,
    newMemo?: string,
    newAdminKey?: PrivateKey,
    currentAdminKey?: PrivateKey
  ): Promise<void> {
    const transaction = new TopicUpdateTransaction()
      .setTopicId(TopicId.fromString(topicId));
    
    if (newMemo) {
      transaction.setTopicMemo(newMemo);
    }
    
    if (newAdminKey) {
      transaction.setAdminKey(newAdminKey);
    }
    
    if (currentAdminKey) {
      transaction.freezeWith(this.client);
      const signedTx = await transaction.sign(currentAdminKey);
      const response = await signedTx.execute(this.client);
      await response.getReceipt(this.client);
    } else {
      const response = await transaction.execute(this.client);
      await response.getReceipt(this.client);
    }
  }
  
  // Helper method 
  private async getEntityTopicId(entityId: string): Promise<string> {

    return "0.0.123456";
  }
}