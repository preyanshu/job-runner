import mongoose, { Document, Schema } from 'mongoose';

// NFT Token Info Interface
interface INFTTokenInfo {
  hash: string;
  name: string;
  symbol: string;
  totalSupply: string;
}

// NFT Movement Metrics Interface
interface INFTMovementMetrics {
  totalTransfers: number;
  uniqueHolders: string[];
  currentHolders: { [tokenId: string]: string };
  transferHistory: Array<{
    tokenId: string;
    from: string;
    to: string;
    txHash: string;
    timestamp: string;
    fee: string;
  }>;
  mintTransactions: Array<{
    tokenId: string;
    to: string;
    txHash: string;
    timestamp: string;
    fee: string;
  }>;
  burnTransactions: Array<{
    tokenId: string;
    from: string;
    txHash: string;
    timestamp: string;
    fee: string;
  }>;
  topHolders: Array<{
    address: string;
    tokenCount: number;
    tokensOwned: string[];
  }>;
  mostActiveTraders: Array<{
    address: string;
    totalTransfers: number;
    uniqueTokensTraded: number;
  }>;
  transfersByTimeframe: {
    last1h: number;
    last6h: number;
    last24h: number;
  };
  movementPatterns: {
    avgHoldingTime: number;
    mostTradedTokens: Array<{
      tokenId: string;
      transferCount: number;
      uniqueOwners: number;
    }>;
    transferFrequency: number;
    flippingActivity: number;
  };
  priceAnalysis: {
    avgTransactionFee: string;
    totalFeesGenerated: string;
    feeDistribution: {
      low: number;
      medium: number;
      high: number;
    };
  };
  processedTransactionHashes: string[];
}

// NFT Alert Interface
interface INFTAlert {
  type: 'MASS_TRANSFER' | 'WHALE_ACCUMULATION' | 'SUSPICIOUS_MINTING' | 'HIGH_ACTIVITY_SPIKE' | 'WASH_TRADING' | 'WATCHED_WALLET_ACTIVITY';
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: Date;
  data: any;
}

// Analysis Metadata Interface
interface IAnalysisMetadata {
  transactionsAnalyzed: number;
  newTransactionsThisBatch: number;
  cumulativeTransactions: number;
  uniqueTokensTracked: number;
  uniqueHoldersCount: number;
  timeRange: string;
  dataQuality: 'COMPLETE' | 'PARTIAL' | 'LIMITED';
  lastUpdated: Date;
  apiEndpoint: string;
}

// Main NFT Snapshot Interface
export interface INFTSnapshot extends Document {
  tokenAddress: string;
  network: string;
  tokenInfo: INFTTokenInfo;
  timestamp: Date;
  movementMetrics: INFTMovementMetrics;
  alerts: INFTAlert[];
  riskScore: number;
  analysisMetadata: IAnalysisMetadata;
  createdAt: Date;
  updatedAt: Date;
}

// NFT Token Info Schema
const NFTTokenInfoSchema = new Schema({
  hash: { type: String, required: true },
  name: { type: String, required: true },
  symbol: { type: String, required: true },
  totalSupply: { type: String, required: true }
}, { _id: false });

// Transfer History Schema
const TransferHistorySchema = new Schema({
  tokenId: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  txHash: { type: String, required: true },
  timestamp: { type: String, required: true },
  fee: { type: String, required: true }
}, { _id: false });

// Mint Transaction Schema
const MintTransactionSchema = new Schema({
  tokenId: { type: String, required: true },
  to: { type: String, required: true },
  txHash: { type: String, required: true },
  timestamp: { type: String, required: true },
  fee: { type: String, required: true }
}, { _id: false });

// Burn Transaction Schema
const BurnTransactionSchema = new Schema({
  tokenId: { type: String, required: true },
  from: { type: String, required: true },
  txHash: { type: String, required: true },
  timestamp: { type: String, required: true },
  fee: { type: String, required: true }
}, { _id: false });

// Top Holders Schema
const TopHolderSchema = new Schema({
  address: { type: String, required: true },
  tokenCount: { type: Number, required: true },
  tokensOwned: [{ type: String }]
}, { _id: false });

// Most Active Traders Schema
const MostActiveTraderSchema = new Schema({
  address: { type: String, required: true },
  totalTransfers: { type: Number, required: true },
  uniqueTokensTraded: { type: Number, required: true }
}, { _id: false });

// Most Traded Tokens Schema
const MostTradedTokenSchema = new Schema({
  tokenId: { type: String, required: true },
  transferCount: { type: Number, required: true },
  uniqueOwners: { type: Number, required: true }
}, { _id: false });

// Transfers by Timeframe Schema
const TransfersByTimeframeSchema = new Schema({
  last1h: { type: Number, default: 0 },
  last6h: { type: Number, default: 0 },
  last24h: { type: Number, default: 0 }
}, { _id: false });

// Movement Patterns Schema
const MovementPatternsSchema = new Schema({
  avgHoldingTime: { type: Number, required: true },
  mostTradedTokens: [MostTradedTokenSchema],
  transferFrequency: { type: Number, required: true },
  flippingActivity: { type: Number, required: true }
}, { _id: false });

// Fee Distribution Schema
const FeeDistributionSchema = new Schema({
  low: { type: Number, default: 0 },
  medium: { type: Number, default: 0 },
  high: { type: Number, default: 0 }
}, { _id: false });

// Price Analysis Schema
const PriceAnalysisSchema = new Schema({
  avgTransactionFee: { type: String, required: true },
  totalFeesGenerated: { type: String, required: true },
  feeDistribution: FeeDistributionSchema
}, { _id: false });

// NFT Movement Metrics Schema
const NFTMovementMetricsSchema = new Schema({
  totalTransfers: { type: Number, required: true },
  uniqueHolders: [{ type: String }],
  currentHolders: { 
    type: Map, 
    of: String,
    default: {}
  },
  transferHistory: [TransferHistorySchema],
  mintTransactions: [MintTransactionSchema],
  burnTransactions: [BurnTransactionSchema],
  topHolders: [TopHolderSchema],
  mostActiveTraders: [MostActiveTraderSchema],
  transfersByTimeframe: TransfersByTimeframeSchema,
  movementPatterns: MovementPatternsSchema,
  priceAnalysis: PriceAnalysisSchema,
  processedTransactionHashes: [{ type: String }]
}, { _id: false });

// NFT Alert Schema
const NFTAlertSchema = new Schema({
  type: { 
    type: String, 
    required: true,
    enum: ['MASS_TRANSFER', 'WHALE_ACCUMULATION', 'SUSPICIOUS_MINTING', 'HIGH_ACTIVITY_SPIKE', 'WASH_TRADING', 'WATCHED_WALLET_ACTIVITY']
  },
  message: { type: String, required: true },
  severity: { 
    type: String, 
    required: true,
    enum: ['LOW', 'MEDIUM', 'HIGH']
  },
  timestamp: { type: Date, required: true },
  data: { type: Schema.Types.Mixed, required: true }
}, { _id: false });

// Analysis Metadata Schema
const AnalysisMetadataSchema = new Schema({
  transactionsAnalyzed: { type: Number, required: true },
  newTransactionsThisBatch: { type: Number, required: true },
  cumulativeTransactions: { type: Number, required: true },
  uniqueTokensTracked: { type: Number, required: true },
  uniqueHoldersCount: { type: Number, required: true },
  timeRange: { type: String, required: true },
  dataQuality: { 
    type: String, 
    required: true,
    enum: ['COMPLETE', 'PARTIAL', 'LIMITED']
  },
  lastUpdated: { type: Date, required: true },
  apiEndpoint: { type: String, required: true }
}, { _id: false });

// Main NFT Snapshot Schema
const NFTSnapshotSchema = new Schema<INFTSnapshot>({
  tokenAddress: { 
    type: String, 
    required: true,
    index: true,
    lowercase: true
  },
  
  network: { 
    type: String, 
    enum: ["testnet", "devnet", "mainnet"], 
    default: "testnet",
    required: true,
    index: true
  }, // Network for this snapshot
  tokenInfo: { 
    type: NFTTokenInfoSchema, 
    required: true 
  },
  timestamp: { 
    type: Date, 
    required: true,
    index: true,
    default: Date.now
  },
  movementMetrics: { 
    type: NFTMovementMetricsSchema, 
    required: true 
  },
  alerts: [NFTAlertSchema],
  riskScore: { 
    type: Number, 
    required: true,
    min: 1,
    max: 10
  },
  analysisMetadata: { 
    type: AnalysisMetadataSchema, 
    required: true 
  }
}, {
  timestamps: true,
  collection: 'nft_snapshots'
});

// Indexes for better query performance
NFTSnapshotSchema.index({ tokenAddress: 1, timestamp: -1 });
NFTSnapshotSchema.index({ 'tokenInfo.symbol': 1 });
NFTSnapshotSchema.index({ 'tokenInfo.name': 1 });
NFTSnapshotSchema.index({ riskScore: -1 });
NFTSnapshotSchema.index({ 'alerts.severity': 1 });
NFTSnapshotSchema.index({ 'analysisMetadata.dataQuality': 1 });

// Instance methods
NFTSnapshotSchema.methods.getLatestTransfers = function(limit: number = 10) {
  return this.movementMetrics.transferHistory.slice(0, limit);
};

NFTSnapshotSchema.methods.getTopHolders = function(limit: number = 5) {
  return this.movementMetrics.topHolders.slice(0, limit);
};

NFTSnapshotSchema.methods.getHighSeverityAlerts = function() {
  return this.alerts.filter((alert: INFTAlert) => alert.severity === 'HIGH');
};

NFTSnapshotSchema.methods.getTotalUniqueTokens = function() {
  return Object.keys(this.movementMetrics.currentHolders).length;
};

NFTSnapshotSchema.methods.isHighRisk = function() {
  return this.riskScore >= 7;
};

// Static methods
NFTSnapshotSchema.statics.findByTokenAddress = function(tokenAddress: string) {
  return this.find({ tokenAddress: tokenAddress.toLowerCase() });
};

NFTSnapshotSchema.statics.findLatestByToken = function(tokenAddress: string) {
  return this.findOne({ tokenAddress: tokenAddress.toLowerCase() }).sort({ timestamp: -1 });
};

NFTSnapshotSchema.statics.findHighRiskTokens = function() {
  return this.find({ riskScore: { $gte: 7 } }).sort({ riskScore: -1, timestamp: -1 });
};

NFTSnapshotSchema.statics.findWithRecentAlerts = function(hours: number = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    'alerts.timestamp': { $gte: cutoff },
    'alerts.severity': { $in: ['HIGH', 'MEDIUM'] }
  }).sort({ timestamp: -1 });
};

NFTSnapshotSchema.statics.getTokenAnalyticsSummary = function(tokenAddress: string) {
  return this.aggregate([
    { $match: { tokenAddress: tokenAddress.toLowerCase() } },
    { $sort: { timestamp: -1 } },
    { $limit: 1 },
    {
      $project: {
        tokenAddress: 1,
        tokenInfo: 1,
        timestamp: 1,
        'movementMetrics.totalTransfers': 1,
        'movementMetrics.uniqueHolders': { $size: '$movementMetrics.uniqueHolders' },
        'movementMetrics.currentHolders': { $size: { $objectToArray: '$movementMetrics.currentHolders' } },
        'movementMetrics.transfersByTimeframe': 1,
        'movementMetrics.priceAnalysis.totalFeesGenerated': 1,
        riskScore: 1,
        alertCount: { $size: '$alerts' },
        highSeverityAlerts: {
          $size: {
            $filter: {
              input: '$alerts',
              cond: { $eq: ['$this.severity', 'HIGH'] }
            }
          }
        }
      }
    }
  ]);
};

// Create and export the model
export const NFTSnapshot = mongoose.model<INFTSnapshot>('NFTSnapshot', NFTSnapshotSchema);

// Export interfaces for use in other files
export {
  INFTTokenInfo,
  INFTMovementMetrics,
  INFTAlert,
  IAnalysisMetadata
};