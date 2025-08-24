import axios from 'axios';
import { NFTSnapshot } from '../models/NFTSnapshot'; // Adjust path as needed
import { getNetworkConfig, DEFAULT_NETWORK } from '../config/networks';

// Type definitions for NFT transaction data structure
interface NFTTokenInfo {
  hash: string;
  name: string;
  symbol: string;
  totalSupply: string;
}

interface NFTTransaction {
  timestamp: string;
  from: string;
  to: string;
  tokenItemId: string;
  txHash: string;
  status: boolean;
  actionType: string;
  fee: string;
  tokenHash: string;
  token: NFTTokenInfo;
}

interface NFTMovementMetrics {
  totalTransfers: number;
  uniqueHolders: string[];
  currentHolders: { [tokenId: string]: string }; // tokenId -> current owner
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
    avgHoldingTime: number; // in hours
    mostTradedTokens: Array<{
      tokenId: string;
      transferCount: number;
      uniqueOwners: number;
    }>;
    transferFrequency: number;
    flippingActivity: number; // quick buy-sell within 24h
  };
  priceAnalysis: {
    avgTransactionFee: string;
    totalFeesGenerated: string;
    feeDistribution: {
      low: number;    // < 0.001 ETH equivalent
      medium: number; // 0.001 - 0.01 ETH
      high: number;   // > 0.01 ETH
    };
  };
  processedTransactionHashes: string[];
}

interface NFTAlertData {
  type: 'MASS_TRANSFER' | 'WHALE_ACCUMULATION' | 'SUSPICIOUS_MINTING' | 'HIGH_ACTIVITY_SPIKE' | 'WASH_TRADING' | 'WATCHED_WALLET_ACTIVITY';
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: Date;
  data: any;
}

interface NFTConfig {
  address: string;
  name: string;
  symbol: string;
  thresholds: {
    massTransferCount: number;     // Alert if more than X transfers in 1 hour
    whaleTokenCount: number;       // Alert if someone holds more than X tokens
    suspiciousMintRate: number;    // Alert if more than X mints per hour
    highActivitySpike: number;     // Alert if activity increases by X%
  };
  watchedAddresses: string[];
}

interface AnalyzeNFTOptions {
  apiEndpoint?: string;
  transactionLimit?: number;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Fetches the newest NFT transactions for a specific token
 */
async function fetchLatestNFTTransactions(
  tokenAddress: string,
  apiEndpoint: string,
  limit: number = 25
): Promise<{ transactions: NFTTransaction[], tokenInfo: NFTTokenInfo | null }> {
  try {
    const endpoint = `${apiEndpoint}/transfers/evm/erc721?tokenHash=${tokenAddress}&offset=0&limit=${limit}`;
    
    console.log(`🔍 Fetching NFT transactions from: ${endpoint}`);
    const response = await axios.get(endpoint, { timeout: 30000 });
    
    if (!response.data || !response.data.items) {
      throw new Error('Invalid API response structure');
    }

    const transactions = response.data.items || [];
    const tokenInfo = transactions[0]?.token || null;

    console.log(`✅ Successfully fetched ${transactions.length} latest NFT transactions`);
    return { transactions, tokenInfo };
  } catch (error) {
    console.error(`Error fetching NFT transactions for token ${tokenAddress}:`, error);
    return { transactions: [], tokenInfo: null };
  }
}

/**
 * Filters out transactions that have already been processed
 */
function getNewNFTTransactions(
  latestTransactions: NFTTransaction[], 
  previousSnapshot: any | null
): NFTTransaction[] {
  if (!previousSnapshot || !previousSnapshot.movementMetrics?.processedTransactionHashes) {
    return latestTransactions;
  }

  const processedHashes = new Set(previousSnapshot.movementMetrics.processedTransactionHashes);
  return latestTransactions.filter(tx => !processedHashes.has(tx.txHash));
}

/**
 * Updates holder metrics cumulatively
 */
function updateHolderMetrics(
  newTransactions: NFTTransaction[],
  previousMetrics: NFTMovementMetrics | null | undefined
): {
  currentHolders: { [tokenId: string]: string };
  holderStats: Map<string, { tokenCount: number; tokensOwned: string[] }>;
  traderStats: Map<string, { totalTransfers: number; uniqueTokens: Set<string> }>;
} {
  // Initialize with previous data
  const currentHolders = { ...(previousMetrics?.currentHolders || {}) };
  const holderStats = new Map<string, { tokenCount: number; tokensOwned: string[] }>();
  const traderStats = new Map<string, { totalTransfers: number; uniqueTokens: Set<string> }>();

  // Initialize holder stats from previous data
  if (previousMetrics?.topHolders) {
    previousMetrics.topHolders.forEach(holder => {
      holderStats.set(holder.address.toLowerCase(), {
        tokenCount: holder.tokenCount,
        tokensOwned: [...holder.tokensOwned]
      });
    });
  }

  // Initialize trader stats from previous data
  if (previousMetrics?.mostActiveTraders) {
    previousMetrics.mostActiveTraders.forEach(trader => {
      traderStats.set(trader.address.toLowerCase(), {
        totalTransfers: trader.totalTransfers,
        uniqueTokens: new Set() // We'll rebuild this from current holdings
      });
    });
  }

  // Process new transactions
  newTransactions.forEach(tx => {
    if (!tx.status) return;

    const tokenId = tx.tokenItemId;
    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();

    // Update current holder for this token
    currentHolders[tokenId] = to;

    // Update trader stats
    if (from !== ZERO_ADDRESS.toLowerCase()) {
      const fromStats = traderStats.get(from) || { totalTransfers: 0, uniqueTokens: new Set() };
      fromStats.totalTransfers++;
      fromStats.uniqueTokens.add(tokenId);
      traderStats.set(from, fromStats);
    }

    if (to !== ZERO_ADDRESS.toLowerCase()) {
      const toStats = traderStats.get(to) || { totalTransfers: 0, uniqueTokens: new Set() };
      toStats.totalTransfers++;
      toStats.uniqueTokens.add(tokenId);
      traderStats.set(to, toStats);
    }
  });

  // Rebuild holder stats from current holdings
  holderStats.clear();
  Object.entries(currentHolders).forEach(([tokenId, owner]) => {
    if (owner !== ZERO_ADDRESS.toLowerCase()) {
      const stats = holderStats.get(owner) || { tokenCount: 0, tokensOwned: [] };
      stats.tokenCount++;
      stats.tokensOwned.push(tokenId);
      holderStats.set(owner, stats);
    }
  });

  return { currentHolders, holderStats, traderStats };
}

/**
 * Analyzes NFT movement flows cumulatively
 */
function analyzeCumulativeNFTMovements(
  newTransactions: NFTTransaction[], 
  config: NFTConfig,
  previousSnapshot: any | null
): NFTMovementMetrics {
  const previousMetrics = previousSnapshot?.movementMetrics || null;
  
  // Get cumulative holder data
  const { currentHolders, holderStats, traderStats } = updateHolderMetrics(newTransactions, previousMetrics);
  
  // Calculate cumulative unique holders
  const uniqueHolders = new Set<string>(previousMetrics?.uniqueHolders || []);
  
  // Process new transactions for various metrics
  const newTransferHistory: NFTMovementMetrics['transferHistory'] = [];
  const newMintTransactions: NFTMovementMetrics['mintTransactions'] = [];
  const newBurnTransactions: NFTMovementMetrics['burnTransactions'] = [];
  const tokenTransferCounts = new Map<string, number>();
  
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  let transfers1h = previousMetrics?.transfersByTimeframe?.last1h || 0;
  let transfers6h = previousMetrics?.transfersByTimeframe?.last6h || 0;
  let transfers24h = previousMetrics?.transfersByTimeframe?.last24h || 0;
  let totalFees = BigInt(previousMetrics?.priceAnalysis?.totalFeesGenerated || '0');
  let feeDistribution = previousMetrics?.priceAnalysis?.feeDistribution || { low: 0, medium: 0, high: 0 };
  let flippingCount = 0;

  newTransactions.forEach(tx => {
    if (!tx.status) return;
    
    const txTime = new Date(tx.timestamp);
    const fee = BigInt(tx.fee || '0');
    const tokenId = tx.tokenItemId;
    
    // Track unique holders
    uniqueHolders.add(tx.from.toLowerCase());
    uniqueHolders.add(tx.to.toLowerCase());
    
    // Time-based transfer counting
    if (txTime >= oneHourAgo) transfers1h++;
    if (txTime >= sixHoursAgo) transfers6h++;
    if (txTime >= oneDayAgo) transfers24h++;
    
    // Fee analysis
    totalFees += fee;
    const feeInWei = Number(fee);
    if (feeInWei < 1e15) { // < 0.001 ETH equivalent
      feeDistribution.low++;
    } else if (feeInWei < 1e16) { // < 0.01 ETH
      feeDistribution.medium++;
    } else {
      feeDistribution.high++;
    }
    
    // Track token transfer counts for most traded analysis
    const currentCount = tokenTransferCounts.get(tokenId) || 0;
    tokenTransferCounts.set(tokenId, currentCount + 1);
    
    // Detect mints (from zero address)
    if (tx.from.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
      newMintTransactions.push({
        tokenId: tx.tokenItemId,
        to: tx.to,
        txHash: tx.txHash,
        timestamp: tx.timestamp,
        fee: tx.fee
      });
    }
    // Detect burns (to zero address)
    else if (tx.to.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
      newBurnTransactions.push({
        tokenId: tx.tokenItemId,
        from: tx.from,
        txHash: tx.txHash,
        timestamp: tx.timestamp,
        fee: tx.fee
      });
    }
    // Regular transfers
    else {
      newTransferHistory.push({
        tokenId: tx.tokenItemId,
        from: tx.from,
        to: tx.to,
        txHash: tx.txHash,
        timestamp: tx.timestamp,
        fee: tx.fee
      });
      
      // Check for flipping (quick buy-sell within 24h)
      // This is a simplified check - in reality you'd need more sophisticated logic
      if (txTime >= oneDayAgo) {
        flippingCount++;
      }
    }
  });

  // Merge with previous data (keep recent entries)
  const allTransferHistory = [
    ...newTransferHistory,
    ...(previousMetrics?.transferHistory?.slice(0, 500) || [])
  ].slice(0, 1000);

  const allMintTransactions = [
    ...newMintTransactions,
    ...(previousMetrics?.mintTransactions?.slice(0, 200) || [])
  ].slice(0, 500);

  const allBurnTransactions = [
    ...newBurnTransactions,
    ...(previousMetrics?.burnTransactions?.slice(0, 200) || [])
  ].slice(0, 500);

  // Calculate cumulative totals
  const previousTotalTransfers = previousMetrics?.totalTransfers || 0;
  const cumulativeTotalTransfers = previousTotalTransfers + newTransactions.length;

  // Calculate top holders from current holdings
  const topHolders = Array.from(holderStats.entries())
    .sort(([,a], [,b]) => b.tokenCount - a.tokenCount)
    .slice(0, 10)
    .map(([address, stats]) => ({
      address,
      tokenCount: stats.tokenCount,
      tokensOwned: stats.tokensOwned
    }));

  // Calculate most active traders
  const mostActiveTraders = Array.from(traderStats.entries())
    .sort(([,a], [,b]) => b.totalTransfers - a.totalTransfers)
    .slice(0, 10)
    .map(([address, stats]) => ({
      address,
      totalTransfers: stats.totalTransfers,
      uniqueTokensTraded: stats.uniqueTokens.size
    }));

  // Calculate most traded tokens
  const mostTradedTokens = Array.from(tokenTransferCounts.entries())
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([tokenId, transferCount]) => {
      // Count unique owners for this token from transfer history
      const uniqueOwners = new Set<string>();
      allTransferHistory
        .filter(tx => tx.tokenId === tokenId)
        .forEach(tx => {
          uniqueOwners.add(tx.from);
          uniqueOwners.add(tx.to);
        });
      
      return {
        tokenId,
        transferCount,
        uniqueOwners: uniqueOwners.size
      };
    });

  // Calculate average transaction fee
  const avgFee = newTransactions.length > 0 
    ? (totalFees / BigInt(Math.max(cumulativeTotalTransfers, 1))).toString()
    : '0';

  // Calculate average holding time (simplified - would need more complex analysis)
  const avgHoldingTime = 168; // Placeholder - 1 week in hours

  // Track all processed transaction hashes
  const processedTransactionHashes = [
    ...newTransactions.map(tx => tx.txHash),
    ...(previousMetrics?.processedTransactionHashes || [])
  ].slice(0, 2000);

  return {
    totalTransfers: cumulativeTotalTransfers,
    uniqueHolders: Array.from(uniqueHolders),
    currentHolders,
    transferHistory: allTransferHistory,
    mintTransactions: allMintTransactions,
    burnTransactions: allBurnTransactions,
    topHolders,
    mostActiveTraders,
    transfersByTimeframe: {
      last1h: transfers1h,
      last6h: transfers6h,
      last24h: transfers24h
    },
    movementPatterns: {
      avgHoldingTime,
      mostTradedTokens,
      transferFrequency: newTransactions.length,
      flippingActivity: flippingCount
    },
    priceAnalysis: {
      avgTransactionFee: avgFee,
      totalFeesGenerated: totalFees.toString(),
      feeDistribution
    },
    processedTransactionHashes
  };
}

/**
 * Detects alerts based on NFT movement analysis
 */
function detectNFTAlerts(
  metrics: NFTMovementMetrics, 
  config: NFTConfig, 
  previousSnapshot?: any,
  newTransactions: NFTTransaction[] = []
): NFTAlertData[] {
  const alerts: NFTAlertData[] = [];
  const now = new Date();

  // Mass transfer alerts (recent activity)
  if (metrics.transfersByTimeframe.last1h > config.thresholds.massTransferCount) {
    alerts.push({
      type: 'MASS_TRANSFER',
      message: `High transfer activity detected: ${metrics.transfersByTimeframe.last1h} transfers in the last hour`,
      severity: 'HIGH',
      timestamp: now,
      data: {
        transfersInLastHour: metrics.transfersByTimeframe.last1h,
        threshold: config.thresholds.massTransferCount
      }
    });
  }

  // Whale accumulation alerts
  const whales = metrics.topHolders.filter(holder => 
    holder.tokenCount >= config.thresholds.whaleTokenCount
  );

  if (whales.length > 0) {
    alerts.push({
      type: 'WHALE_ACCUMULATION',
      message: `${whales.length} whale holder(s) detected (holding ${config.thresholds.whaleTokenCount}+ tokens)`,
      severity: 'MEDIUM',
      timestamp: now,
      data: {
        whaleCount: whales.length,
        whales: whales.slice(0, 3),
        threshold: config.thresholds.whaleTokenCount
      }
    });
  }

  // Suspicious minting rate
  const recentMints = metrics.mintTransactions.filter(mint => {
    const mintTime = new Date(mint.timestamp);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    return mintTime >= oneHourAgo;
  });

  if (recentMints.length > config.thresholds.suspiciousMintRate) {
    alerts.push({
      type: 'SUSPICIOUS_MINTING',
      message: `High minting activity: ${recentMints.length} tokens minted in the last hour`,
      severity: 'HIGH',
      timestamp: now,
      data: {
        mintsInLastHour: recentMints.length,
        threshold: config.thresholds.suspiciousMintRate,
        recentMints: recentMints.slice(0, 5)
      }
    });
  }

  // High activity spike detection
  if (previousSnapshot) {
    const currentActivity = metrics.transfersByTimeframe.last24h;
    const previousActivity = previousSnapshot.movementMetrics?.transfersByTimeframe?.last24h || 0;
    
    if (previousActivity > 0) {
      const activityChangePercent = ((currentActivity - previousActivity) / previousActivity) * 100;
      
      if (activityChangePercent > config.thresholds.highActivitySpike) {
        alerts.push({
          type: 'HIGH_ACTIVITY_SPIKE',
          message: `Activity spike detected: ${activityChangePercent.toFixed(2)}% increase in 24h transfers`,
          severity: 'MEDIUM',
          timestamp: now,
          data: {
            changePercent: activityChangePercent,
            currentActivity,
            previousActivity,
            threshold: config.thresholds.highActivitySpike
          }
        });
      }
    }
  }

  // Potential wash trading detection (same addresses trading frequently)
  const potentialWashTrading = metrics.mostActiveTraders.filter(trader => 
    trader.totalTransfers > 20 && trader.uniqueTokensTraded < 3
  );

  if (potentialWashTrading.length > 0) {
    alerts.push({
      type: 'WASH_TRADING',
      message: `${potentialWashTrading.length} address(es) showing potential wash trading patterns`,
      severity: 'MEDIUM',
      timestamp: now,
      data: {
        suspiciousTraders: potentialWashTrading.slice(0, 3)
      }
    });
  }

  // Watched wallet activity
  const watchedActivity = newTransactions.filter(tx => 
    config.watchedAddresses.some(addr => 
      addr.toLowerCase() === tx.from.toLowerCase() || 
      addr.toLowerCase() === tx.to.toLowerCase()
    )
  );

  if (watchedActivity.length > 0) {
    const details = watchedActivity.map(tx => {
      const involvedAddress = config.watchedAddresses.find(addr =>
        addr.toLowerCase() === tx.from.toLowerCase() || addr.toLowerCase() === tx.to.toLowerCase()
      );

      const action = tx.from.toLowerCase() === ZERO_ADDRESS.toLowerCase() ? 'MINTED' :
                     tx.to.toLowerCase() === ZERO_ADDRESS.toLowerCase() ? 'BURNED' :
                     involvedAddress?.toLowerCase() === tx.from.toLowerCase() ? 'SENT' : 'RECEIVED';

      return {
        txHash: tx.txHash,
        tokenId: tx.tokenItemId,
        address: involvedAddress,
        action,
        from: tx.from,
        to: tx.to,
        timestamp: tx.timestamp
      };
    });

    alerts.push({
      type: 'WATCHED_WALLET_ACTIVITY',
      message: `${watchedActivity.length} transaction(s) involving watched wallet(s)`,
      severity: 'LOW',
      timestamp: now,
      data: {
        count: watchedActivity.length,
        transactions: details.slice(0, 5)
      }
    });
  }

  return alerts;
}

/**
 * Calculates risk score based on NFT metrics and alerts
 */
function calculateNFTRiskScore(metrics: NFTMovementMetrics, alerts: NFTAlertData[]): number {
  let riskScore = 1; // Base score

  // High transfer frequency risk
  if (metrics.transfersByTimeframe.last1h > 50) riskScore += 3;
  else if (metrics.transfersByTimeframe.last1h > 20) riskScore += 2;
  else if (metrics.transfersByTimeframe.last1h > 10) riskScore += 1;

  // Concentration risk (if few holders control many tokens)
  if (metrics.topHolders.length > 0) {
    const totalSupply = Object.keys(metrics.currentHolders).length;
    const topHolderTokens = metrics.topHolders[0].tokenCount;
    const concentration = (topHolderTokens / totalSupply) * 100;
    
    if (concentration > 50) riskScore += 2;
    else if (concentration > 25) riskScore += 1;
  }

  // Suspicious minting pattern
  const recentMints = metrics.mintTransactions.filter(mint => {
    const mintTime = new Date(mint.timestamp);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return mintTime >= oneDayAgo;
  });
  
  if (recentMints.length > 100) riskScore += 2;
  else if (recentMints.length > 50) riskScore += 1;

  // Alert-based risk
  const highSeverityAlerts = alerts.filter(a => a.severity === 'HIGH').length;
  const mediumSeverityAlerts = alerts.filter(a => a.severity === 'MEDIUM').length;
  
  riskScore += highSeverityAlerts * 2;
  riskScore += mediumSeverityAlerts;

  // Flipping activity risk
  if (metrics.movementPatterns.flippingActivity > 20) riskScore += 1;

  return Math.min(riskScore, 10); // Cap at 10
}

/**
 * Main function to analyze NFT lifetime movements and create/save cumulative snapshot
 */
// Helper function to validate Ethereum address format
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function analyzeNFTMovements(
  config: NFTConfig,
  network: string = DEFAULT_NETWORK,
  options: AnalyzeNFTOptions = {}
): Promise<any> {
  // Get network configuration
  const networkConfig = getNetworkConfig(network);
  
  const {
    apiEndpoint = networkConfig.apiEndpoint,
    transactionLimit = 25
  } = options;

  try {
    // Early validation of Ethereum address format
    if (!isValidEthereumAddress(config.address)) {
      const error = new Error(`Invalid Ethereum address format: ${config.address}`);
      (error as any).code = 'INVALID_ADDRESS_FORMAT';
      (error as any).collectionAddress = config.address;
      throw error;
    }

    console.log(`🖼️  Analyzing NFT movements for ${config.name} (${config.symbol})...`);

    // Fetch latest transactions
    const { transactions: latestTransactions, tokenInfo } = await fetchLatestNFTTransactions(
      config.address,
      apiEndpoint,
      transactionLimit
    );

    if (!tokenInfo) {
      throw new Error(`Could not fetch NFT token info for ${config.address}`);
    }

    console.log(`📊 Fetched ${latestTransactions.length} latest NFT transactions for ${config.name}`);

    // Get previous snapshot for cumulative analysis (same network)
    const previousSnapshot = await NFTSnapshot.findOne(
      { 
        tokenAddress: config.address,
        network 
      }
    ).sort({ timestamp: -1 });

    // Filter out already processed transactions
    const newTransactions = getNewNFTTransactions(latestTransactions, previousSnapshot);
    console.log(`✨ Found ${newTransactions.length} new NFT transactions to process`);

    if (newTransactions.length === 0) {
      console.log(`⏩ No new NFT transactions for ${config.name}, skipping...`);
      return null;
    }

    // Analyze movements cumulatively
    const movementMetrics = analyzeCumulativeNFTMovements(newTransactions, config, previousSnapshot);
    
    // Detect alerts
    const alerts = detectNFTAlerts(movementMetrics, config, previousSnapshot, newTransactions);
    
    // Calculate risk score
    const riskScore = calculateNFTRiskScore(movementMetrics, alerts);

    // Create and save snapshot
    const snapshot = new NFTSnapshot({
      tokenAddress: config.address,
      network,
      tokenInfo,
      timestamp: new Date(),
      movementMetrics,
      alerts,
      riskScore,
      analysisMetadata: {
        transactionsAnalyzed: latestTransactions.length,
        newTransactionsThisBatch: newTransactions.length,
        cumulativeTransactions: movementMetrics.totalTransfers,
        uniqueTokensTracked: Object.keys(movementMetrics.currentHolders).length,
        uniqueHoldersCount: movementMetrics.uniqueHolders.length,
        timeRange: 'cumulative',
        dataQuality: movementMetrics.totalTransfers > 100 ? 'COMPLETE' : 
                     movementMetrics.totalTransfers > 10 ? 'PARTIAL' : 'LIMITED',
        lastUpdated: new Date(),
        apiEndpoint
      }
    });

    await snapshot.save();

    console.log(`✅ Cumulative NFT snapshot saved for ${config.name}:`);
    console.log(`   🔄 Cumulative Transfers: ${movementMetrics.totalTransfers}`);
    console.log(`   🆕 New Transfers This Batch: ${newTransactions.length}`);
    console.log(`   🖼️  Unique Tokens Tracked: ${Object.keys(movementMetrics.currentHolders).length}`);
    console.log(`   👥 Unique Holders: ${movementMetrics.uniqueHolders.length}`);
    console.log(`   💎 Top Holder: ${movementMetrics.topHolders[0]?.tokenCount || 0} tokens`);
    console.log(`   💰 Total Fees Generated: ${movementMetrics.priceAnalysis.totalFeesGenerated}`);
    console.log(`   🚨 Alerts: ${alerts.length}`);
    console.log(`   ⚡ Risk Score: ${riskScore}/10`);

    if (alerts.length > 0) {
      console.log(`   🚨 Alerts generated:`);
      alerts.forEach(alert => 
        console.log(`     - ${alert.severity}: ${alert.message}`)
      );
    }

    return snapshot;

  } catch (error) {
    console.error(`Error analyzing NFT ${config.name}:`, error);
    throw error;
  }
}

// Export additional utility functions for advanced usage
export {
  fetchLatestNFTTransactions,
  getNewNFTTransactions,
  updateHolderMetrics,
  analyzeCumulativeNFTMovements,
  detectNFTAlerts,
  calculateNFTRiskScore,
  type NFTConfig,
  type AnalyzeNFTOptions,
  type NFTMovementMetrics,
  type NFTAlertData,
  type NFTTransaction,
  type NFTTokenInfo
};

export default analyzeNFTMovements;