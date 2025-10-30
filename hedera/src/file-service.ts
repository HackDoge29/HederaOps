import {
  FileCreateTransaction,
  FileAppendTransaction,
  FileContentsQuery,
  FileUpdateTransaction,
  FileDeleteTransaction,
  FileId,
  PrivateKey
} from "@hashgraph/sdk";
import { HederaClientManager } from "./config";

export interface FileConfig {
  memo?: string;
  keys?: PrivateKey[];
  contents: Uint8Array;
}

export class HederaFileService {
  private client = HederaClientManager.getClient();
  private readonly MAX_CHUNK_SIZE = 4096; // 4KB chunks
  
  /**
   * Create file on Hedera network
   */
  async createFile(config: FileConfig): Promise<string> {
    // For files larger than 4KB, we need to split into chunks
    const chunks = this.splitIntoChunks(config.contents);
    
    // Create file with first chunk
    const transaction = new FileCreateTransaction()
      .setContents(chunks[0]);
    
    if (config.memo) {
      transaction.setFileMemo(config.memo);
    }
    
    if (config.keys && config.keys.length > 0) {
      transaction.setKeys(config.keys);
    }
    
    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    const fileId = receipt.fileId!.toString();
    
    // Append remaining chunks if any
    for (let i = 1; i < chunks.length; i++) {
      await this.appendToFile(fileId, chunks[i]);
    }
    
    return fileId;
  }
  
  /**
   * Append data to existing file
   */
  async appendToFile(
    fileId: string,
    contents: Uint8Array,
    key?: PrivateKey
  ): Promise<void> {
    const chunks = this.splitIntoChunks(contents);
    
    for (const chunk of chunks) {
      const transaction = new FileAppendTransaction()
        .setFileId(FileId.fromString(fileId))
        .setContents(chunk);
      
      if (key) {
        transaction.freezeWith(this.client);
        const signedTx = await transaction.sign(key);
        const response = await signedTx.execute(this.client);
        await response.getReceipt(this.client);
      } else {
        const response = await transaction.execute(this.client);
        await response.getReceipt(this.client);
      }
    }
  }
  
  /**
   * Read file contents
   */
  async getFileContents(fileId: string): Promise<Uint8Array> {
    const query = new FileContentsQuery()
      .setFileId(FileId.fromString(fileId));
    
    const contents = await query.execute(this.client);
    return contents;
  }
  
  /**
   * Update file contents
   */
  async updateFile(
    fileId: string,
    newContents: Uint8Array,
    key?: PrivateKey
  ): Promise<void> {
    const transaction = new FileUpdateTransaction()
      .setFileId(FileId.fromString(fileId))
      .setContents(newContents);
    
    if (key) {
      transaction.freezeWith(this.client);
      const signedTx = await transaction.sign(key);
      const response = await signedTx.execute(this.client);
      await response.getReceipt(this.client);
    } else {
      const response = await transaction.execute(this.client);
      await response.getReceipt(this.client);
    }
  }
  
  /**
   * Delete file
   */
  async deleteFile(fileId: string, key?: PrivateKey): Promise<void> {
    const transaction = new FileDeleteTransaction()
      .setFileId(FileId.fromString(fileId));
    
    if (key) {
      transaction.freezeWith(this.client);
      const signedTx = await transaction.sign(key);
      const response = await signedTx.execute(this.client);
      await response.getReceipt(this.client);
    } else {
      const response = await transaction.execute(this.client);
      await response.getReceipt(this.client);
    }
  }
  
  /**
   * Store JSON data
   */
  async storeJSON(data: any, memo?: string, keys?: PrivateKey[]): Promise<string> {
    const jsonString = JSON.stringify(data);
    const contents = new TextEncoder().encode(jsonString);
    
    return this.createFile({
      memo: memo || "HederaOps JSON Data",
      keys,
      contents
    });
  }
  
  /**
   * Retrieve JSON data
   */
  async retrieveJSON(fileId: string): Promise<any> {
    const contents = await this.getFileContents(fileId);
    const jsonString = new TextDecoder().decode(contents);
    return JSON.parse(jsonString);
  }
  
  /**
   * Store document metadata
   */
  async storeDocumentMetadata(data: {
    documentType: string;
    entityId: string;
    hash: string;
    timestamp: number;
    metadata: any;
  }): Promise<string> {
    return this.storeJSON(data, `Document: ${data.documentType}`);
  }
  
  /**
   * Store smart contract bytecode
   */
  async storeContractBytecode(
    bytecode: Uint8Array,
    contractName: string
  ): Promise<string> {
    return this.createFile({
      memo: `Contract: ${contractName}`,
      contents: bytecode
    });
  }
  
  /**
   * Split data into chunks
   */
  private splitIntoChunks(data: Uint8Array): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    let offset = 0;
    
    while (offset < data.length) {
      const chunkSize = Math.min(this.MAX_CHUNK_SIZE, data.length - offset);
      chunks.push(data.slice(offset, offset + chunkSize));
      offset += chunkSize;
    }
    
    return chunks;
  }
}
