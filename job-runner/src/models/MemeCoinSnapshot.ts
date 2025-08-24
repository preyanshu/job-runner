import mongoose, { Schema, Document } from 'mongoose';

interface TokenInfo {
  hash: string;
  name: string;
  symbol: string;
  decimals: string;
  totalSupply: string;
  image: string | null;
}

interface FlowMetrics {
  totalTransfers: number;
  totalVolume: string;
  uniqueAddresses: string[];
  largeTransfers: Array<{
    txHash: string;
    from: string;
    to: string;
    value: string;
    timestamp: string;
  }>;
  burnTransactions: Array<{
    txHash: string;
    from: string;
    value: string;
    timestamp: string;
  }>;
  topSenders: Array<{
    address: string;
    totalSent: string;
    transactionCount: number;
  }>;
  topReceivers: Array<{
    address: string;
    totalReceived: string;
    transactionCount: number;
  }>;
  volumeByTimeframe: {
    last1h: string;
    last6h: string;
    last24h: string;
  };
  transferPatterns: {
    avgTransferSize: string;
    medianTransferSize: string;
    transferFrequency: number;
  };
  processedTransactionHashes: string[];
}

interface AlertData {
  type: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: Date;
  data: any;
}

interface AnalysisMetadata {
  transactionsAnalyzed: number;
  newTransactionsThisBatch: number;
  cumulativeTransactions: number;
  timeRange: string;
  dataQuality: 'LIMITED' | 'PARTIAL' | 'COMPLETE';
  lastUpdated: Date;
  apiEndpoint: string;
}

export interface MemeCoinSnapshotDocument extends Document {
  tokenAddress: string;
  network: string;
  tokenInfo: TokenInfo;
  timestamp: Date;
  flowMetrics: FlowMetrics;
  alerts: AlertData[];
  riskScore: number;
  analysisMetadata: AnalysisMetadata;
}

const AlertSchema = new Schema<AlertData>({
  type: { type: String, required: true },
  message: { type: String, required: true },
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: true },
  timestamp: { type: Date, required: true },
  data: Schema.Types.Mixed
}, { _id: false });

const MemeCoinSnapshotSchema: Schema = new Schema<MemeCoinSnapshotDocument>({
  tokenAddress: { type: String, required: true, index: true },
  
  network: { 
    type: String, 
    enum: ["testnet", "devnet", "mainnet"], 
    default: "testnet",
    required: true,
    index: true
  }, // Network for this snapshot
  tokenInfo: {
    hash: String,
    name: String,
    symbol: String,
    decimals: String,
    totalSupply: String,
    image: { type: String, default: null }
  },
  timestamp: { type: Date, default: Date.now },
  flowMetrics: {
    totalTransfers: Number,
    totalVolume: String,
    uniqueAddresses: [String],
    largeTransfers: [{
      txHash: String,
      from: String,
      to: String,
      value: String,
      timestamp: String
    }],
    burnTransactions: [{
      txHash: String,
      from: String,
      value: String,
      timestamp: String
    }],
    topSenders: [{
      address: String,
      totalSent: String,
      transactionCount: Number
    }],
    topReceivers: [{
      address: String,
      totalReceived: String,
      transactionCount: Number
    }],
    volumeByTimeframe: {
      last1h: String,
      last6h: String,
      last24h: String
    },
    transferPatterns: {
      avgTransferSize: String,
      medianTransferSize: String,
      transferFrequency: Number
    },
    processedTransactionHashes: [String]
  },
  alerts: { type: [AlertSchema], default: [] },
  riskScore: { type: Number, min: 0, max: 10 },
  analysisMetadata: {
    transactionsAnalyzed: Number,
    newTransactionsThisBatch: Number,
    cumulativeTransactions: Number,
    timeRange: String,
    dataQuality: { type: String, enum: ['LIMITED', 'PARTIAL', 'COMPLETE'] },
    lastUpdated: Date,
    apiEndpoint: String
  }
});

export const MemeCoinSnapshot = mongoose.model<MemeCoinSnapshotDocument>(
  'MemeCoinSnapshot',
  MemeCoinSnapshotSchema
);
