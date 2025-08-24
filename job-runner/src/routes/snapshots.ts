import { FastifyInstance } from "fastify";
import { WalletSnapshot } from "../models/WalletSnapshot";
import { NFTSnapshot } from "../models/NFTSnapshot";
import { MemeCoinSnapshot } from "../models/MemeCoinSnapshot";
import { createWalletSnapshot } from "../services/run";
import { analyzeCoinFlows } from "../services/token";
import { analyzeNFTMovements } from "../services/nft";
import { getNetworkConfig, DEFAULT_NETWORK, isValidNetwork } from "../config/networks";

export default async function snapshotRoutes(fastify: FastifyInstance) {
  
  // Get latest wallet snapshot
  fastify.get("/snapshots/wallet/:address", async (request, reply) => {
    const { address } = request.params as { address: string };
    const { network = DEFAULT_NETWORK } = request.query as { network?: string };
    
    // Validate network parameter
    if (!isValidNetwork(network)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid network: ${network}. Supported networks: ${Object.keys(getNetworkConfig('testnet')).join(', ')}`
      });
    }
    
    try {
      // Try to get the latest snapshot (same network)
      let snapshot = await WalletSnapshot.findOne({ 
        walletAddress: address,
        network 
      })
        .sort({ createdAt: -1 })
        .limit(1);

      // If no snapshot exists, generate one on the fly by calling the exact function
      if (!snapshot) {
        console.log(`📊 No snapshot found for wallet ${address}, calling createWalletSnapshot function...`);
        
        try {
          // Call the exact function that would be called in a job
          const result = await createWalletSnapshot(address, network);
          console.log(`✅ createWalletSnapshot function completed successfully for ${address}`);
          
          // Fetch the newly created snapshot (same network)
          snapshot = await WalletSnapshot.findOne({ 
            walletAddress: address,
            network 
          })
            .sort({ createdAt: -1 })
            .limit(1);
            
          if (!snapshot) {
            // Check if the function returned null (which means no new data to process)
            if (result === null) {
              return reply.status(200).send({
                success: true,
                message: "No new data to process for this wallet",
                data: null,
                generated: false
              });
            }
            
            // If result exists but no snapshot was created, it's an error
            return reply.status(500).send({
              success: false,
              error: "Function executed successfully but no snapshot was created",
              details: {
                message: "createWalletSnapshot function completed but snapshot not found in database",
                timestamp: new Date(),
                walletAddress: address,
                function: "createWalletSnapshot",
                result: result
              }
            });
          }
        } catch (functionError) {
          console.error(`❌ createWalletSnapshot function failed for ${address}:`, functionError);
          
          // Enhanced error details with more context
          const errorDetails = {
            message: functionError instanceof Error ? functionError.message : String(functionError),
            stack: functionError instanceof Error ? functionError.stack : undefined,
            timestamp: new Date(),
            walletAddress: address,
            function: "createWalletSnapshot",
            errorType: functionError instanceof Error ? functionError.constructor.name : typeof functionError,
            functionError: functionError instanceof Error ? {
              name: functionError.name,
              message: functionError.message,
              stack: functionError.stack,
              cause: (functionError as any).cause
            } : String(functionError),
            context: {
              operation: "wallet_snapshot_generation",
              stage: "service_function_execution",
              input: { walletAddress: address }
            },
            suggestions: [
              "Check if the wallet address is valid and accessible",
              "Verify blockchain RPC endpoints are working",
              "Check database connectivity and permissions",
              "Review service function logs for specific errors"
            ]
          };
          
          return reply.status(500).send({
            success: false,
            error: "Failed to generate wallet snapshot",
            details: errorDetails
          });
        }
      }

      if (!snapshot) {
        return reply.status(404).send({ 
          success: false,
          error: "Failed to generate wallet snapshot",
          walletAddress: address
        });
      }

      return {
        success: true,
        data: snapshot,
        generated: (snapshot as any).createdAt > new Date(Date.now() - 60000) // Generated in last minute
      };
    } catch (error) {
      console.error("❌ Error getting wallet snapshot:", error);
      
      // Enhanced error details for general errors
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date(),
        walletAddress: address,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        context: {
          operation: "wallet_snapshot_retrieval",
          stage: "database_query_or_general_processing"
        },
        suggestions: [
          "Check database connectivity and permissions",
          "Verify the wallet address format is correct",
          "Check if any snapshots exist for this wallet",
          "Review server logs for additional error details"
        ]
      };
      
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get wallet snapshot",
        details: errorDetails
      });
    }
  });

  // Get latest NFT snapshot for a collection
  fastify.get("/snapshots/nft/:collectionAddress", async (request, reply) => {
    const { collectionAddress } = request.params as { collectionAddress: string };
    const { network = DEFAULT_NETWORK } = request.query as { network?: string };
    
    // Validate network parameter
    if (!isValidNetwork(network)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid network: ${network}. Supported networks: ${Object.keys(getNetworkConfig('testnet')).join(', ')}`
      });
    }
    
    try {
      // Try to get the latest snapshot (same network)
      let snapshot = await NFTSnapshot.findOne({ 
        tokenAddress: collectionAddress,
        network 
      })
        .sort({ createdAt: -1 })
        .limit(1);

      // If no snapshot exists, generate one on the fly by calling the exact function
      if (!snapshot) {
        console.log(`🖼️ No NFT snapshot found for collection ${collectionAddress}, calling analyzeNFTMovements function...`);
        
        try {
          const config = {
            address: collectionAddress,
            name: "Unknown Collection",
            symbol: "UNKNOWN",
            thresholds: {
              massTransferCount: 10,
              whaleTokenCount: 100,
              suspiciousMintRate: 50,
              highActivitySpike: 300
            },
            watchedAddresses: []
          };
          
          // Call the exact function that would be called in a job
          const result = await analyzeNFTMovements(config, network, {});
          console.log(`✅ analyzeNFTMovements function completed successfully for ${collectionAddress}`);
          
          // Fetch the newly created snapshot (same network)
          snapshot = await NFTSnapshot.findOne({ 
            tokenAddress: collectionAddress,
            network 
          })
            .sort({ createdAt: -1 })
            .limit(1);
            
          if (!snapshot) {
            // Check if the function returned null (which means no new data to process)
            if (result === null) {
              return reply.status(200).send({
                success: true,
                message: "No new data to process for this NFT collection",
                data: null,
                generated: false
              });
            }
            
            // If result exists but no snapshot was created, it's an error
            return reply.status(500).send({
              success: false,
              error: "Function executed successfully but no snapshot was created",
              details: {
                message: "analyzeNFTMovements function completed but snapshot not found in database",
                timestamp: new Date(),
                collectionAddress,
                function: "analyzeNFTMovements",
                result: result
              }
            });
          }
        } catch (functionError) {
          console.error(`❌ analyzeNFTMovements function failed for ${collectionAddress}:`, functionError);
          
          // Enhanced error details with more context
          const errorDetails = {
            message: functionError instanceof Error ? functionError.message : String(functionError),
            stack: functionError instanceof Error ? functionError.stack : undefined,
            timestamp: new Date(),
            collectionAddress,
            function: "analyzeNFTMovements",
            errorType: functionError instanceof Error ? functionError.constructor.name : typeof functionError,
            functionError: functionError instanceof Error ? {
              name: functionError.name,
              message: functionError.message,
              stack: functionError.stack,
              cause: (functionError as any).cause
            } : String(functionError),
            context: {
              operation: "nft_snapshot_generation",
              stage: "service_function_execution",
              input: { collectionAddress }
            },
            suggestions: [
              "Check if the collection address is valid and accessible",
              "Verify blockchain RPC endpoints are working",
              "Check database connectivity and permissions",
              "Review service function logs for specific errors",
              "Ensure the NFT collection exists and is accessible"
            ]
          };
          
          return reply.status(500).send({
            success: false,
            error: "Failed to generate NFT snapshot",
            details: errorDetails
          });
        }
      }

      if (!snapshot) {
        return reply.status(404).send({ 
          success: false,
          error: "Failed to generate NFT snapshot",
          collectionAddress
        });
      }

      return {
        success: true,
        data: snapshot,
        generated: (snapshot as any).createdAt > new Date(Date.now() - 60000) // Generated in last minute
      };
    } catch (error) {
      console.error("❌ Error getting NFT snapshot:", error);
      
      // Enhanced error details for general errors
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date(),
        collectionAddress,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        context: {
          operation: "nft_snapshot_retrieval",
          stage: "database_query_or_general_processing"
        },
        suggestions: [
          "Check database connectivity and permissions",
          "Verify the collection address format is correct",
          "Check if any snapshots exist for this collection",
          "Review server logs for additional error details"
        ]
      };
      
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get NFT snapshot",
        details: errorDetails
      });
    }
  });

  // Get latest memecoin snapshot
  fastify.get("/snapshots/memecoin/:tokenAddress", async (request, reply) => {
    const { tokenAddress } = request.params as { tokenAddress: string };
    const { network = DEFAULT_NETWORK } = request.query as { network?: string };
    
    // Validate network parameter
    if (!isValidNetwork(network)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid network: ${network}. Supported networks: ${Object.keys(getNetworkConfig('testnet')).join(', ')}`
      });
    }
    
    try {
      // Try to get the latest snapshot (same network)
      let snapshot = await MemeCoinSnapshot.findOne({ 
        tokenAddress,
        network 
      })
        .sort({ createdAt: -1 })
        .limit(1);

      // If no snapshot exists, generate one on the fly by calling the exact function
      if (!snapshot) {
        console.log(`🪙 No memecoin snapshot found for token ${tokenAddress}, calling analyzeCoinFlows function...`);
        
        try {
          const config = {
            address: tokenAddress,
            name: "Unknown Token",
            symbol: "UNKNOWN",
            thresholds: {
              largeTransfer: 10000,
              whalePercentage: 5,
              volumeSpike: 200
            },
            watchedAddresses: []
          };
          
          // Call the exact function that would be called in a job
          const result = await analyzeCoinFlows(config, network, {});
          console.log(`✅ analyzeCoinFlows function completed successfully for ${tokenAddress}`);
          
          // Fetch the newly created snapshot (same network)
          snapshot = await MemeCoinSnapshot.findOne({ 
            tokenAddress,
            network 
          })
            .sort({ createdAt: -1 })
            .limit(1);
            
          if (!snapshot) {
            // Check if the function returned null (which means no new data to process)
            if (result === null) {
              return reply.status(200).send({
                success: true,
                message: "No new data to process for this token",
                data: null,
                generated: false
              });
            }
            
            // If result exists but no snapshot was created, it's an error
            return reply.status(500).send({
              success: false,
              error: "Function executed successfully but no snapshot was created",
              details: {
                message: "analyzeCoinFlows function completed but snapshot not found in database",
                timestamp: new Date(),
                tokenAddress,
                function: "analyzeCoinFlows",
                result: result
              }
            });
          }
        } catch (functionError) {
          console.error(`❌ analyzeCoinFlows function failed for ${tokenAddress}:`, functionError);
          
          // Enhanced error details with more context
          const errorDetails = {
            message: functionError instanceof Error ? functionError.message : String(functionError),
            stack: functionError instanceof Error ? functionError.stack : undefined,
            timestamp: new Date(),
            tokenAddress,
            function: "analyzeCoinFlows",
            errorType: functionError instanceof Error ? functionError.constructor.name : typeof functionError,
            functionError: functionError instanceof Error ? {
              name: functionError.name,
              message: functionError.message,
              stack: functionError.stack,
              cause: (functionError as any).cause
            } : String(functionError),
            context: {
              operation: "memecoin_snapshot_generation",
              stage: "service_function_execution",
              input: { tokenAddress }
            },
            suggestions: [
              "Check if the token address is valid and accessible",
              "Verify blockchain RPC endpoints are working",
              "Check database connectivity and permissions",
              "Review service function logs for specific errors",
              "Ensure the token contract exists and is accessible"
            ]
          };
          
          return reply.status(500).send({
            success: false,
            error: "Failed to generate memecoin snapshot",
            details: errorDetails
          });
        }
      }

      if (!snapshot) {
        return reply.status(404).send({ 
          success: false,
          error: "Failed to generate memecoin snapshot",
          tokenAddress
        });
      }

      return {
        success: true,
        data: snapshot,
        generated: (snapshot as any).createdAt > new Date(Date.now() - 60000) // Generated in last minute
      };
    } catch (error) {
      console.error("❌ Error getting memecoin snapshot:", error);
      
      // Enhanced error details for general errors
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date(),
        tokenAddress,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        context: {
          operation: "memecoin_snapshot_retrieval",
          stage: "database_query_or_general_processing"
        },
        suggestions: [
          "Check database connectivity and permissions",
          "Verify the token address format is correct",
          "Check if any snapshots exist for this token",
          "Review server logs for additional error details"
        ]
      };
      
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get memecoin snapshot",
        details: errorDetails
      });
    }
  });

  // Get all latest snapshots for a wallet (wallet + NFTs + memecoins)
  fastify.get("/snapshots/wallet/:address/all", async (request, reply) => {
    const { address } = request.params as { address: string };
    const { network = DEFAULT_NETWORK } = request.query as { network?: string };
    
    // Validate network parameter
    if (!isValidNetwork(network)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid network: ${network}. Supported networks: ${Object.keys(getNetworkConfig('testnet')).join(', ')}`
      });
    }
    
    try {
      // Get wallet snapshot (same network)
      let walletSnapshot = await WalletSnapshot.findOne({ 
        walletAddress: address,
        network 
      })
        .sort({ createdAt: -1 })
        .limit(1);

      if (!walletSnapshot) {
        console.log(`📊 Generating wallet snapshot for ${address}...`);
        try {
          // Call the exact function that would be called in a job
          const result = await createWalletSnapshot(address, network);
          console.log(`✅ createWalletSnapshot function completed successfully for ${address}`);
          
          walletSnapshot = await WalletSnapshot.findOne({ 
            walletAddress: address,
            network 
          })
            .sort({ createdAt: -1 })
            .limit(1);
            
          // Check if the function returned null (which means no new data to process)
          if (result === null) {
            return reply.status(200).send({
              success: true,
              message: "No new data to process for this wallet",
              data: {
                wallet: null,
                nfts: [],
                memecoins: []
              },
              generated: false
            });
          }
        } catch (functionError) {
          console.error(`❌ createWalletSnapshot function failed for ${address}:`, functionError);
          
          // Enhanced error details with more context
          const errorDetails = {
            message: functionError instanceof Error ? functionError.message : String(functionError),
            stack: functionError instanceof Error ? functionError.stack : undefined,
            timestamp: new Date(),
            walletAddress: address,
            function: "createWalletSnapshot",
            errorType: functionError instanceof Error ? functionError.constructor.name : typeof functionError,
            functionError: functionError instanceof Error ? {
              name: functionError.name,
              message: functionError.message,
              stack: functionError.stack,
              cause: (functionError as any).cause
            } : String(functionError),
            context: {
              operation: "wallet_snapshot_generation_all_endpoint",
              stage: "service_function_execution",
              input: { walletAddress: address }
            },
            suggestions: [
              "Check if the wallet address is valid and accessible",
              "Verify blockchain RPC endpoints are working",
              "Check database connectivity and permissions",
              "Review service function logs for specific errors"
            ]
          };
          
          return reply.status(500).send({
            success: false,
            error: "Failed to generate wallet snapshot",
            details: errorDetails
          });
        }
      }

      // Get NFT snapshots where this wallet is involved (same network)
      const nftSnapshots = await NFTSnapshot.find({
        network,
        $or: [
          { "transferHistory.from": address },
          { "transferHistory.to": address },
          { "currentHolders": address }
        ]
      }).sort({ createdAt: -1 }).limit(10);

      // Get memecoin snapshots where this wallet is involved (same network)
      const memecoinSnapshots = await MemeCoinSnapshot.find({
        network,
        $or: [
          { "transferHistory.from": address },
          { "transferHistory.to": address },
          { "topHolders.address": address }
        ]
      }).sort({ createdAt: -1 }).limit(10);

      return {
        success: true,
        data: {
          wallet: walletSnapshot,
          nfts: nftSnapshots,
          memecoins: memecoinSnapshots
        },
        generated: (walletSnapshot as any)?.createdAt > new Date(Date.now() - 60000)
      };
    } catch (error) {
      console.error("❌ Error getting all snapshots:", error);
      
      // Enhanced error details for general errors
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date(),
        walletAddress: address,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        context: {
          operation: "all_snapshots_retrieval",
          stage: "database_query_or_general_processing"
        },
        suggestions: [
          "Check database connectivity and permissions",
          "Verify the wallet address format is correct",
          "Check if any snapshots exist for this wallet",
          "Review server logs for additional error details"
        ]
      };
      
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get all snapshots",
        details: errorDetails
      });
    }
  });

  // Get snapshot statistics
  fastify.get("/snapshots/stats", async (request, reply) => {
    const { network = DEFAULT_NETWORK } = request.query as { network?: string };
    
    // Validate network parameter
    if (!isValidNetwork(network)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid network: ${network}. Supported networks: ${Object.keys(getNetworkConfig('testnet')).join(', ')}`
      });
    }
    
    try {
      const [walletCount, nftCount, memecoinCount] = await Promise.all([
        WalletSnapshot.countDocuments({ network }),
        NFTSnapshot.countDocuments({ network }),
        MemeCoinSnapshot.countDocuments({ network })
      ]);

      const [latestWallet, latestNFT, latestMemecoin] = await Promise.all([
        WalletSnapshot.findOne({ network }).sort({ createdAt: -1 }),
        NFTSnapshot.findOne({ network }).sort({ createdAt: -1 }),
        MemeCoinSnapshot.findOne({ network }).sort({ createdAt: -1 })
      ]);

      return {
        success: true,
        data: {
          counts: {
            wallets: walletCount,
            nfts: nftCount,
            memecoins: memecoinCount
          },
          latest: {
            wallet: (latestWallet as any)?.createdAt,
            nft: (latestNFT as any)?.createdAt,
            memecoin: (latestMemecoin as any)?.createdAt
          }
        }
      };
    } catch (error) {
      console.error("❌ Error getting snapshot stats:", error);
      return reply.status(500).send({ error: "Failed to get snapshot stats" });
    }
  });
} 