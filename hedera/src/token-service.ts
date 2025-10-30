// src/hedera/token-service.ts
import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TokenBurnTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  AccountId,
  PrivateKey,
  TokenId,
  NftId,
  CustomRoyaltyFee,
  CustomFixedFee,
  Hbar
} from "@hashgraph/sdk";
import { HederaClientManager } from "./config";

export interface TokenConfig {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: number;
  treasury: string;
  adminKey: PrivateKey;
  supplyKey?: PrivateKey;
  pauseKey?: PrivateKey;
  freezeKey?: PrivateKey;
  wipeKey?: PrivateKey;
}

export interface NFTConfig {
  name: string;
  symbol: string;
  treasury: string;
  adminKey: PrivateKey;
  supplyKey: PrivateKey;
  metadata?: string;
  royaltyFee?: {
    numerator: number;
    denominator: number;
    fallbackFee: number;
    feeCollector: string;
  };
}

export class HederaTokenService {
  private client = HederaClientManager.getClient();
  
  /**
   * Create HOPS utility token (fungible)
   */
  async createHOPSToken(config: TokenConfig): Promise<string> {
    const transaction = new TokenCreateTransaction()
      .setTokenName(config.name)
      .setTokenSymbol(config.symbol)
      .setDecimals(config.decimals)
      .setInitialSupply(config.initialSupply)
      .setTreasuryAccountId(AccountId.fromString(config.treasury))
      .setAdminKey(config.adminKey)
      .setSupplyKey(config.supplyKey || config.adminKey)
      .setTokenType(TokenType.FungibleCommon)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(1_000_000_000); // 1 billion HOPS
    
    if (config.pauseKey) {
      transaction.setPauseKey(config.pauseKey);
    }
    
    if (config.freezeKey) {
      transaction.setFreezeKey(config.freezeKey);
    }
    
    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return receipt.tokenId!.toString();
  }
  
  /**
   * Create module-specific tokens (HLTH, AGRI, SPLY, IMPCT)
   */
  async createModuleToken(config: TokenConfig): Promise<string> {
    const transaction = new TokenCreateTransaction()
      .setTokenName(config.name)
      .setTokenSymbol(config.symbol)
      .setDecimals(config.decimals)
      .setInitialSupply(config.initialSupply)
      .setTreasuryAccountId(AccountId.fromString(config.treasury))
      .setAdminKey(config.adminKey)
      .setSupplyKey(config.supplyKey || config.adminKey)
      .setTokenType(TokenType.FungibleCommon)
      .setSupplyType(TokenSupplyType.Infinite);
    
    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return receipt.tokenId!.toString();
  }
  
  /**
   * Create NFT for identity, certifications, or carbon credits
   */
  async createNFT(config: NFTConfig): Promise<string> {
    const transaction = new TokenCreateTransaction()
      .setTokenName(config.name)
      .setTokenSymbol(config.symbol)
      .setTokenType(TokenType.NonFungibleUnique)
      .setSupplyType(TokenSupplyType.Infinite)
      .setTreasuryAccountId(AccountId.fromString(config.treasury))
      .setAdminKey(config.adminKey)
      .setSupplyKey(config.supplyKey);
    
    // Add royalty fee for carbon credit NFTs
    if (config.royaltyFee) {
      const royaltyFee = new CustomRoyaltyFee()
        .setNumerator(config.royaltyFee.numerator)
        .setDenominator(config.royaltyFee.denominator)
        .setFallbackFee(new CustomFixedFee().setHbarAmount(new Hbar(config.royaltyFee.fallbackFee)))
        .setFeeCollectorAccountId(AccountId.fromString(config.royaltyFee.feeCollector));
      
      transaction.setCustomFees([royaltyFee]);
    }
    
    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return receipt.tokenId!.toString();
  }
  
  /**
   * Mint NFT with metadata
   */
  async mintNFT(
    tokenId: string,
    metadata: Buffer[],
    supplyKey: PrivateKey
  ): Promise<number[]> {
    const transaction = new TokenMintTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setMetadata(metadata)
      .freezeWith(this.client);
    
    const signedTx = await transaction.sign(supplyKey);
    const response = await signedTx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return receipt.serials.map(serial => serial.toNumber());
  }
  
  /**
   * Associate token with account
   */
  async associateToken(
    accountId: string,
    tokenIds: string[],
    accountKey: PrivateKey
  ): Promise<void> {
    const transaction = new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setTokenIds(tokenIds.map(id => TokenId.fromString(id)))
      .freezeWith(this.client);
    
    const signedTx = await transaction.sign(accountKey);
    const response = await signedTx.execute(this.client);
    await response.getReceipt(this.client);
  }
  
  /**
   * Transfer fungible tokens
   */
  async transferTokens(
    tokenId: string,
    from: string,
    to: string,
    amount: number,
    fromKey: PrivateKey
  ): Promise<string> {
    const transaction = new TransferTransaction()
      .addTokenTransfer(TokenId.fromString(tokenId), AccountId.fromString(from), -amount)
      .addTokenTransfer(TokenId.fromString(tokenId), AccountId.fromString(to), amount)
      .freezeWith(this.client);
    
    const signedTx = await transaction.sign(fromKey);
    const response = await signedTx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return response.transactionId.toString();
  }
  
  /**
   * Transfer NFT
   */
  async transferNFT(
    tokenId: string,
    serial: number,
    from: string,
    to: string,
    fromKey: PrivateKey
  ): Promise<string> {
    const nftId = new NftId(TokenId.fromString(tokenId), serial);
    
    const transaction = new TransferTransaction()
      .addNftTransfer(nftId, AccountId.fromString(from), AccountId.fromString(to))
      .freezeWith(this.client);
    
    const signedTx = await transaction.sign(fromKey);
    const response = await signedTx.execute(this.client);
    await response.getReceipt(this.client);
    
    return response.transactionId.toString();
  }
  
  /**
   * Burn tokens
   */
  async burnTokens(
    tokenId: string,
    amount: number,
    supplyKey: PrivateKey
  ): Promise<void> {
    const transaction = new TokenBurnTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setAmount(amount)
      .freezeWith(this.client);
    
    const signedTx = await transaction.sign(supplyKey);
    const response = await signedTx.execute(this.client);
    await response.getReceipt(this.client);
  }
}
