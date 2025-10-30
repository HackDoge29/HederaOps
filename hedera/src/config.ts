// src/hedera/config.ts
import { Client, AccountId, PrivateKey } from "@hashgraph/sdk";

export interface HederaConfig {
  operatorId: string;
  operatorKey: string;
  network: "testnet" | "mainnet";
  mirrorNode: string;
}

export class HederaClientManager {
  private static instance: Client;
  
  static initialize(config: HederaConfig): Client {
    if (this.instance) {
      return this.instance;
    }
    
    const client = config.network === "mainnet"
      ? Client.forMainnet()
      : Client.forTestnet();
    
    client.setOperator(
      AccountId.fromString(config.operatorId),
      PrivateKey.fromString(config.operatorKey)
    );
    
    // Set default transaction fees and timeouts
    client.setDefaultMaxTransactionFee(100); // 100 HBAR
    client.setMaxQueryPayment(10); // 10 HBAR
    client.setRequestTimeout(60000); // 60 seconds
    
    this.instance = client;
    return client;
  }
  
  static getClient(): Client {
    if (!this.instance) {
      throw new Error("Hedera client not initialized");
    }
    return this.instance;
  }
}
