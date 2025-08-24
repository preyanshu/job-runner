'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { 
  Send, 
  Bot, 
  User, 
  Hammer, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Settings, 
  Wallet, 
  Coins, 
  Search,
  Play,
  Activity,
  DollarSign,
  TrendingUp,
  Globe,
  ChevronRight,
  AlertTriangle,
  Eye,
  Shield,
  Zap,
  BarChart3,
  Building,
  FileText,
  Linkedin,
  Trash2,
  CheckCircle,
  Link
} from 'lucide-react'

// Simple SVG Icons
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l8 8h-6v12h-4V10H4l8-8z"/>
  </svg>
)

const BotIcon = ({ isStreaming = false }: { isStreaming?: boolean }) => (
  <div className={`w-2 h-2 rounded-full ${isStreaming ? 'animate-red-blink' : 'bg-red-500'}`} />
)

const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
)

const ToolIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"/>
    <path d="M17.64 15 22 10.64"/>
    <path d="m20.91 11.7-1.25-1.25L22 8.11a2.12 2.12 0 0 0-3-3L16.66 7.41l-1.25-1.25"/>
  </svg>
)

const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6,9 12,15 18,9"></polyline>
  </svg>
)

const ChevronUpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="18,15 12,9 6,15"></polyline>
  </svg>
)

const ClockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12,6 12,12 16,14"></polyline>
  </svg>
)

interface ToolCall {
  name: string
  arguments: any
  tool_id?: string
  timestamp?: string
}

interface ToolOutput {
  tool_name: string
  tool_output: any
  raw_output: any
  tool_id?: string
  timestamp?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  tool_calls?: ToolCall[]
  tool_outputs?: ToolOutput[]
  isStreaming?: boolean
}

interface AvailableTool {
  name: string
  description: string
  icon: any
  quickAction?: string
  category: 'blockchain' | 'wallet' | 'search' | 'research' | 'analysis'
}

interface AlertType {
  type: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

interface JobData {
  _id: string
  action: string
  payload: any
  network: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  lastRunAt?: Date
  nextRunAt?: Date
  intervalMinutes?: number
  logs?: Array<{
    timestamp: Date
    level: 'INFO' | 'WARN' | 'ERROR'
    message: string
    function?: string
    duration?: number
    details?: any
  }>
  serviceLogs?: Array<{
    timestamp: Date
    level: 'INFO' | 'WARN' | 'ERROR'
    message: string
    function?: string
    details?: any
    duration?: number
  }>
  createdAt: Date
  updatedAt: Date
}

interface SnapshotData {
  data: any
  generated: boolean
  timestamp?: string
}

// Job Card Component with Modal
const JobCard = ({ job, snapshotData, isLoadingSnapshot, handleJobClick, renderSnapshotMetrics }: { 
  job: JobData, 
  snapshotData?: SnapshotData | null, 
  isLoadingSnapshot?: boolean,
  handleJobClick?: (job: JobData) => void,
  renderSnapshotMetrics: (snapshotData: any, jobAction: string) => React.ReactNode
}) => {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date))
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return ''
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatTimeUntil = (date: Date) => {
    const now = new Date()
    const diff = new Date(date).getTime() - now.getTime()
    
    if (diff <= 0) return 'Now'
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} left`
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} left`
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} left`
    return 'Less than 1 minute left'
  }

  const getEntityHeading = (action: string, payload: any) => {
    if (!payload) return action
    
    // Token monitoring
    if (action.includes('token') || action.includes('coin')) {
      if (payload.symbol) {
        return `${payload.symbol} Token`
      }
      if (payload.tokenAddress) {
        return `Token ${payload.tokenAddress.slice(0, 8)}...${payload.tokenAddress.slice(-6)}`
      }
    }
    
    // Wallet monitoring
    if (action.includes('wallet') || action.includes('address')) {
      if (payload.wallet) {
        return `Wallet ${payload.wallet.slice(0, 8)}...${payload.wallet.slice(-6)}`
      }
      if (payload.walletAddress) {
        return `Wallet ${payload.walletAddress.slice(0, 8)}...${payload.walletAddress.slice(-6)}`
      }
      if (payload.address) {
        return `Address ${payload.address.slice(0, 8)}...${payload.address.slice(-6)}`
      }
    }
    
    // NFT monitoring - expanded detection
    if (action.includes('nft') || action.includes('collection') || action.includes('movements')) {
      // For analyze_nft_movements with tokenAddress (NFT contract)
      if (payload.tokenAddress && action.includes('nft')) {
        return `NFT Contract ${payload.tokenAddress.slice(0, 8)}...${payload.tokenAddress.slice(-6)}`
      }
      if (payload.collectionAddress) {
        return `NFT Collection ${payload.collectionAddress.slice(0, 8)}...${payload.collectionAddress.slice(-6)}`
      }
      if (payload.nftAddress) {
        return `NFT ${payload.nftAddress.slice(0, 8)}...${payload.nftAddress.slice(-6)}`
      }
      if (payload.tokenId) {
        return `NFT #${payload.tokenId}`
      }
      if (payload.collectionId) {
        return `NFT Collection ${payload.collectionId}`
      }
      if (payload.nftContract) {
        return `NFT Contract ${payload.nftContract.slice(0, 8)}...${payload.nftContract.slice(-6)}`
      }
      // For analyze_nft_movements specifically
      if (payload.nftId || payload.nftIdentifier) {
        return `NFT ${payload.nftId || payload.nftIdentifier}`
      }
    }
    
    // Generic entity
    if (payload.entity) {
      return payload.entity
    }
    
    return action
  }

  // Function to get alert types being tracked for each job
  const getTrackedAlerts = (action: string): AlertType[] => {
    switch (action) {
      case 'analyze_nft_movements':
        return [
          { type: 'MASS_TRANSFER', label: 'Mass Transfer', description: 'Detects bulk NFT movements', icon: Zap },
          { type: 'WHALE_ACCUMULATION', label: 'Whale Activity', description: 'Monitors large holder movements', icon: DollarSign },
          { type: 'SUSPICIOUS_MINTING', label: 'Suspicious Minting', description: 'Tracks unusual minting patterns', icon: AlertTriangle },
          { type: 'HIGH_ACTIVITY_SPIKE', label: 'Activity Spike', description: 'Monitors volume spikes', icon: TrendingUp },
          { type: 'WASH_TRADING', label: 'Wash Trading', description: 'Detects artificial trading', icon: Shield },
          { type: 'WATCHED_WALLET_ACTIVITY', label: 'Watched Wallets', description: 'Tracks specific addresses', icon: Eye }
        ];
      case 'analyze_coin_flows':
        return [
          { type: 'LARGE_TRANSFER', label: 'Large Transfers', description: 'Monitors big token movements', icon: Zap },
          { type: 'BURN_DETECTED', label: 'Token Burns', description: 'Tracks token destruction', icon: AlertTriangle },
          { type: 'WHALE_MOVEMENT', label: 'Whale Movement', description: 'Monitors whale transactions', icon: DollarSign },
          { type: 'VOLUME_SPIKE', label: 'Volume Spikes', description: 'Detects unusual volume', icon: TrendingUp },
          { type: 'SUSPICIOUS_PATTERN', label: 'Suspicious Patterns', description: 'Tracks unusual behavior', icon: Shield },
          { type: 'WATCHED_WALLET_ACTIVITY', label: 'Watched Wallets', description: 'Tracks specific addresses', icon: Eye }
        ];
      case 'wallet_snapshot':
        return [
          { type: 'SUSPICIOUS_ACTIVITY', label: 'Suspicious Activity', description: 'Monitors wallet behavior', icon: AlertTriangle },
          { type: 'PORTFOLIO_VALUE_CHANGE', label: 'Portfolio Changes', description: 'Tracks value fluctuations', icon: TrendingUp },
          { type: 'LARGE_TRANSACTIONS', label: 'Large Transactions', description: 'Tracks big movements', icon: Zap },
          { type: 'UNUSUAL_PATTERNS', label: 'Unusual Patterns', description: 'Detects anomalies', icon: Shield }
        ];
      default:
        return [];
    }
  };

  const getEntityDescription = (action: string, payload: any) => {
    if (!payload) return ''
    
    // Token monitoring
    if (action.includes('token') || action.includes('coin')) {
      if (payload.tokenAddress) {
        return `Watching token: ${payload.tokenAddress.slice(0, 8)}...${payload.tokenAddress.slice(-6)}`
      }
      if (payload.symbol) {
        return `Watching ${payload.symbol} token`
      }
    }
    
    // Wallet monitoring
    if (action.includes('wallet') || action.includes('address')) {
      if (payload.wallet) {
        return `Watching wallet: ${payload.wallet.slice(0, 8)}...${payload.wallet.slice(-6)}`
      }
      if (payload.walletAddress) {
        return `Watching wallet: ${payload.walletAddress.slice(0, 8)}...${payload.walletAddress.slice(-6)}`
      }
      if (payload.address) {
        return `Watching address: ${payload.address.slice(0, 8)}...${payload.address.slice(-6)}`
      }
    }
    
    // NFT monitoring
    if (action.includes('nft') || action.includes('collection')) {
      if (payload.collectionAddress) {
        return `Watching NFT collection: ${payload.collectionAddress.slice(0, 8)}...${payload.collectionAddress.slice(-6)}`
      }
      if (payload.tokenId) {
        return `Watching NFT: ${payload.tokenId}`
      }
    }
    
    // Generic entity description
    if (payload.entity) {
      return `Watching: ${payload.entity}`
    }
    
    return ''
  }

  const formatPayload = (payload: any) => {
    if (!payload) return null;
    
    const formatValue = (value: any): string => {
      if (typeof value === 'string') {
        // Check if it's an address
        if (value.startsWith('0x') && value.length === 42) {
          return `${value.slice(0, 6)}...${value.slice(-4)}`;
        }
        return value;
      }
      if (typeof value === 'number') return value.toString();
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (Array.isArray(value)) return `${value.length} items`;
      if (typeof value === 'object') return Object.keys(value).length > 0 ? 'Configured' : 'None';
      return String(value);
    };

    // Flatten nested objects to show all fields at the same level
    const flattenPayload = (obj: any): Array<{key: string, value: any}> => {
      const result: Array<{key: string, value: any}> = [];
      
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Recursively flatten nested objects, but don't add parent prefix
          result.push(...flattenPayload(value));
        } else {
          // Add simple values directly
          result.push({ key, value });
        }
      }
      
      return result;
    };

    const flattenedItems = flattenPayload(payload);

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {flattenedItems.map(({ key, value }) => (
          <div 
            key={key} 
            className="flex items-center gap-2 p-3 rounded border-l-2" 
            style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}
          >
            <div>
              <div className="text-muted-foreground text-xs">{key}</div>
              <div className="text-card-foreground font-medium">{formatValue(value)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div 
          className="p-4 rounded-lg border cursor-pointer transition-all duration-200 hover:border-red/50"
          style={{backgroundColor: '#30302E', borderColor: '#444444'}}
          onClick={() => handleJobClick && handleJobClick(job)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-[80px] h-[50px] rounded-full flex items-center justify-center border" style={{backgroundColor: '#262624', borderColor: '#ef4444'}}>
                <Activity className="w-4 h-4 text-red" />
              </div>
                          <div>
              <h3 className="font-medium text-foreground text-lg mb-2 flex items-center gap-2">
                <span className="flex items-center gap-2">
                  {getEntityHeading(job.action, job.payload)}
                  {/* Copy Address Button for All Job Types */}
                  {job.payload && (
                    (job.action.includes('wallet') && job.payload.wallet) ||
                    (job.action.includes('nft') && (job.payload.collectionAddress || job.payload.tokenAddress || job.payload.nftAddress)) ||
                    (job.action.includes('token') && job.payload.tokenAddress)
                  ) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        let addressToCopy = '';
                        if (job.action.includes('wallet') && job.payload.wallet) {
                          addressToCopy = job.payload.wallet;
                        } else if (job.action.includes('nft')) {
                          addressToCopy = job.payload.collectionAddress || job.payload.tokenAddress || job.payload.nftAddress;
                        } else if (job.action.includes('token')) {
                          addressToCopy = job.payload.tokenAddress;
                        }
                        if (addressToCopy) {
                          navigator.clipboard.writeText(addressToCopy);
                        }
                      }}
                      className="w-4 h-4 text-red hover:text-red-bright transition-colors opacity-60 hover:opacity-100"
                      title="Copy address to clipboard"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                  )}
                </span>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-red/20 text-red border border-red/40">
                  {getTrackedAlerts(job.action).length}
                </span>
              </h3>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-1 rounded text-xs font-medium text-red border border-red/30">
                  {job.action}
                </span>
                <span className="px-2 py-1 rounded text-xs font-medium text-red border border-red/30">
                  {job.type}
                </span>
                <span className="px-2 py-1 rounded text-xs font-medium text-red border border-red/30">
                  {job.network}
                </span>
                <span className="px-2 py-1 rounded text-xs font-medium text-red border border-red/30">
                  {job.status}
                </span>
              </div>
              
              {/* Alert Monitoring Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground font-medium"></span>
                {getTrackedAlerts(job.action).map((alert, index) => {
                  const IconComponent = alert.icon;
                  return (
                    <span 
                      key={index}
                      className="px-2 py-1 rounded text-xs font-medium bg-red/20 text-red border border-red/40 hover:bg-red/30 transition-colors cursor-help flex items-center gap-1.5"
                      title={alert.description}
                      style={{ minWidth: 'fit-content' }}
                    >
                      <div className="w-3 h-3 flex-shrink-0 flex items-center justify-center">
                        <IconComponent className="w-[60px] h-[60px]" />
                      </div>
                      <span className="whitespace-nowrap">{alert.label}</span>
                    </span>
                  );
                })}
              </div>
              {job.nextRunAt && job.status !== 'failed' ? (
                <span className="text-muted-foreground text-sm">Next: {formatTimeUntil(job.nextRunAt)}</span>
              ) : (
                <span className="text-muted-foreground text-sm">{formatDate(job.createdAt)}</span>
              )}
            </div>
            </div>
            
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" style={{backgroundColor: '#30302E', borderColor: '#444444'}}>
        <DialogHeader>
          <DialogTitle className="text-red text-xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center border" style={{backgroundColor: '#262624', borderColor: '#ef4444'}}>
              <Activity className="w-4 h-4 text-red" />
            </div>
            <div className="flex items-center gap-3">
              <span>{job.action}</span>
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-red/20 text-red border border-red/40">
                {getTrackedAlerts(job.action).length} Alerts
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 mt-6">
          {/* Job Info */}
          <div>
            <h4 className="text-sm font-medium text-red mb-3 flex items-center gap-2">
              <div className="w-1 h-4 bg-red rounded-full"></div>
              Job Information
            </h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2 p-3 rounded border-l-2" style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}>
                <div>
                  <div className="text-muted-foreground text-xs">Network</div>
                  <div className="text-card-foreground font-medium">{job.network}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded border-l-2" style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}>
                <div>
                  <div className="text-muted-foreground text-xs">Status</div>
                  <div className="text-card-foreground font-medium">{job.status}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded border-l-2" style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}>
                <div>
                  <div className="text-muted-foreground text-xs">Type</div>
                  <div className="text-card-foreground font-medium">{job.type}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded border-l-2" style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}>
                <div>
                  <div className="text-muted-foreground text-xs">Created</div>
                  <div className="text-card-foreground font-medium">{formatDate(job.createdAt)}</div>
                </div>
              </div>
              {job.nextRunAt && job.status !== 'failed' && (
                <div className="flex items-center gap-2 p-3 rounded border-l-2" style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}>
                  <div>
                    <div className="text-muted-foreground text-xs">Next Run</div>
                    <div className="text-card-foreground font-medium">{formatTimeUntil(job.nextRunAt)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Configuration */}
          {job.payload && (
            <div>
              <h4 className="text-sm font-medium text-red mb-3 flex items-center gap-2">
                <div className="w-1 h-4 bg-red rounded-full"></div>
                Configuration
              </h4>
              {formatPayload(job.payload)}
            </div>
          )}

          {/* Alert Monitoring */}
          <div>
            <h4 className="text-sm font-medium text-red mb-3 flex items-center gap-2">
              <div className="w-1 h-4 bg-red rounded-full"></div>
              Alert Monitoring
            </h4>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground mb-3">
                This job is actively monitoring for the following alert types:
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {getTrackedAlerts(job.action).map((alert, index) => {
                  const IconComponent = alert.icon;
                  return (
                    <div 
                      key={index}
                      className="p-3 rounded border-l-2 flex flex-col gap-2" 
                      style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}
                    >
                                          <div className="flex items-center gap-2">
                      <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                        <IconComponent className="w-full h-full text-red" />
                      </div>
                      <span className="text-sm font-medium text-red whitespace-nowrap">{alert.label}</span>
                    </div>
                      <div className="text-xs text-muted-foreground">{alert.description}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Latest Snapshot */}
          {(job.action === 'wallet_snapshot' || job.action === 'analyze_nft_movements' || job.action === 'analyze_coin_flows') && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-red flex items-center gap-2">
                  <div className="w-1 h-4 bg-red rounded-full"></div>
                  Latest Snapshot
                  {isLoadingSnapshot && (
                    <div className="ml-2 w-4 h-4 border-2 border-red border-t-transparent rounded-full animate-spin"></div>
                  )}
                </h4>
                {/* {snapshotData && (
                  <button
                    onClick={() => {
                      const query = `Please analyze this ${job.action.replace('_', ' ')} snapshot data and provide insights: ${JSON.stringify(snapshotData.data, null, 2)}`;
                      // Find the chat input and set the value
                      const chatInput = document.querySelector('textarea[name="input"], input[name="input"], [role="textbox"]') as HTMLInputElement | HTMLTextAreaElement;
                      if (chatInput) {
                        chatInput.value = query;
                        chatInput.focus();
                        // Trigger input event to update any React state
                        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                      }
                    }}
                    className="px-3 py-1 text-xs font-medium text-red border border-red/30 rounded hover:bg-red/10 transition-colors"
                  >
                    Ask Vincent
                  </button>
                )} */}
              </div>
              
              {isLoadingSnapshot ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  Loading latest snapshot...
                </div>
              ) : snapshotData ? (
                <div className="space-y-3">
                  {/* Snapshot Status */}
                  <div className="flex items-center gap-2 p-3 rounded border-l-2" style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}>
                    <div>
                      <div className="text-muted-foreground text-xs">Status</div>
                      <div className="text-card-foreground font-medium">
                        {snapshotData.generated ? 'Freshly Generated' : 'From Database'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Snapshot Timestamp */}
                  {snapshotData.timestamp && (
                    <div className="flex items-center gap-2 p-3 rounded border-l-2" style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}>
                      <div>
                        <div className="text-muted-foreground text-xs">Last Updated</div>
                        <div className="text-card-foreground font-medium">
                          {formatDate(new Date(snapshotData.timestamp))}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Key Metrics Cards */}
                  {renderSnapshotMetrics(snapshotData.data, job.action)}
                  
                  {/* Advanced Snapshot Data */}
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-red hover:text-red-bright flex items-center gap-2">
                      <div className="w-1 h-4 bg-red rounded-full"></div>
                      Advanced
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-3 p-3 rounded border text-xs overflow-x-auto" style={{backgroundColor: '#1a1a18', borderColor: '#444444'}}>
                      <pre className="text-muted-foreground whitespace-pre-wrap break-words">
                        {JSON.stringify(snapshotData.data, null, 2)}
              </pre>
                    </div>
                  </details>
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No snapshot data available
                </div>
              )}
            </div>
          )}

          {/* Schedule Info */}
          {(job.intervalMinutes || job.lastRunAt) && (
            <div>
              <h4 className="text-sm font-medium text-red mb-3 flex items-center gap-2">
                <div className="w-1 h-4 bg-red rounded-full"></div>
                Schedule
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {job.intervalMinutes && (
                  <div className="flex items-center gap-2 p-3 rounded border-l-2" style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}>
                    <Clock className="w-4 h-4 text-red" />
                    <div>
                      <div className="text-muted-foreground text-xs">Interval</div>
                      <div className="text-card-foreground font-medium">{job.intervalMinutes}m</div>
                    </div>
                  </div>
                )}
                {job.lastRunAt && (
                  <div className="flex items-center gap-2 p-3 rounded border-l-2" style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}>
                    <Activity className="w-4 h-4 text-red" />
                    <div>
                      <div className="text-muted-foreground text-xs">Last Run</div>
                      <div className="text-card-foreground font-medium">{formatDate(job.lastRunAt)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Service Logs */}
          {job.serviceLogs && job.serviceLogs.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-red mb-3 flex items-center gap-2">
                <div className="w-1 h-4 bg-red rounded-full"></div>
                Service Logs ({job.serviceLogs.length})
              </h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {job.serviceLogs.map((log, index) => (
                  <div 
                    key={index} 
                    className="p-3 rounded text-sm border-l-2"
                    style={{
                      backgroundColor: '#262624',
                      borderLeftColor: '#ef4444'
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-card-foreground font-medium">
                        {log.message}
                      </span>
                      {log.duration && (
                        <span className="text-xs px-2 py-1 rounded text-red border border-red/30">
                          {formatDuration(log.duration)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(log.timestamp)}</span>
                      {log.function && (
                        <>
                          <span>•</span>
                          <span className="text-red">{log.function}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className="text-red">
                        {log.level}
                      </span>
                    </div>
                    {log.details && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-red hover:text-red-bright">
                          Details
                        </summary>
                        <pre className="mt-1 text-xs text-muted-foreground overflow-x-auto p-2 rounded" style={{backgroundColor: '#30302E'}}>
{JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Job Logs */}
          {job.logs && job.logs.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-red mb-3 flex items-center gap-2">
                <div className="w-1 h-4 bg-red rounded-full"></div>
                Job Logs ({job.logs.length})
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {job.logs.slice(-10).map((log, index) => (
                  <div 
                    key={index} 
                    className="p-3 rounded text-sm border-l-2"
                    style={{
                      backgroundColor: '#262624',
                      borderLeftColor: '#ef4444'
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-card-foreground font-medium">
                        {log.message}
                      </span>
                      {log.duration && (
                        <span className="text-xs px-2 py-1 rounded text-red border border-red/30">
                          {formatDuration(log.duration)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(log.timestamp)}</span>
                      {log.function && (
                        <>
                          <span>•</span>
                          <span className="text-red">{log.function}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className="text-red">
                        {log.level}
                      </span>
                    </div>
                    {log.details && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-red hover:text-red-bright">
                          Details
                        </summary>
                        <pre className="mt-1 text-xs text-muted-foreground overflow-x-auto p-2 rounded" style={{backgroundColor: '#30302E'}}>
{JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latest Snapshot */}
          {snapshotData && (
            <div>
              <h4 className="text-sm font-medium text-red mb-3 flex items-center gap-2">
                <div className="w-1 h-4 bg-red rounded-full"></div>
                Latest Snapshot
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 p-3 rounded border-l-2" style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}>
                  <DollarSign className="w-4 h-4 text-red" />
                  <div>
                    <div className="text-muted-foreground text-xs">Generated</div>
                    <div className="text-card-foreground font-medium">{formatDate(new Date(snapshotData.timestamp || snapshotData.data.createdAt))}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded border-l-2" style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}>
                  <Activity className="w-4 h-4 text-red" />
                  <div>
                    <div className="text-muted-foreground text-xs">Data</div>
                    <div className="text-card-foreground font-medium">{snapshotData.data.type}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Job Status Card Component
const JobsSection = () => {
  const [jobs, setJobs] = useState<JobData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null)
  const [snapshotData, setSnapshotData] = useState<SnapshotData | null>(null)
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false)

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date))
  }

  const renderSnapshotMetrics = (snapshotData: any, jobAction: string) => {
    if (!snapshotData) return null;

    const metrics = [];

    // Common metrics for all snapshot types
    if (snapshotData.createdAt) {
      metrics.push({
        key: 'Created',
        value: formatDate(new Date(snapshotData.createdAt)),
        icon: '📅'
      });
    }

    // Wallet snapshot specific metrics
    if (jobAction === 'wallet_snapshot') {
      if (snapshotData.balance) {
        metrics.push({
          key: 'Balance',
          value: `${snapshotData.balance} SEI`,
          icon: '💰'
        });
      }
      if (snapshotData.transactionCount) {
        metrics.push({
          key: 'Transactions',
          value: snapshotData.transactionCount.toString(),
          icon: '📊'
        });
      }
      if (snapshotData.tokenHoldings && snapshotData.tokenHoldings.length > 0) {
        metrics.push({
          key: 'Token Holdings',
          value: `${snapshotData.tokenHoldings.length} tokens`,
          icon: '🪙'
        });
      }
      if (snapshotData.nftHoldings && snapshotData.nftHoldings.length > 0) {
        metrics.push({
          key: 'NFT Holdings',
          value: `${snapshotData.nftHoldings.length} NFTs`,
          icon: '🖼️'
        });
      }
      // Additional wallet metrics
      if (snapshotData.totalValue) {
        metrics.push({
          key: 'Total Value',
          value: `${snapshotData.totalValue} SEI`,
          icon: '💎'
        });
      }
      if (snapshotData.lastActivity) {
        metrics.push({
          key: 'Last Activity',
          value: formatDate(new Date(snapshotData.lastActivity)),
          icon: '⏰'
        });
      }
    }

    // NFT analysis specific metrics
    if (jobAction === 'analyze_nft_movements') {
      if (snapshotData.totalTransactions) {
        metrics.push({
          key: 'Total Transactions',
          value: snapshotData.totalTransactions.toString(),
          icon: '📈'
        });
      }
      if (snapshotData.uniqueAddresses && snapshotData.uniqueAddresses.length > 0) {
        metrics.push({
          key: 'Unique Addresses',
          value: snapshotData.uniqueAddresses.length.toString(),
          icon: '👥'
        });
      }
      if (snapshotData.alerts && snapshotData.alerts.length > 0) {
        metrics.push({
          key: 'Alerts',
          value: `${snapshotData.alerts.length} detected`,
          icon: '🚨'
        });
      }
      if (snapshotData.whaleMovements && snapshotData.whaleMovements.length > 0) {
        metrics.push({
          key: 'Whale Movements',
          value: `${snapshotData.whaleMovements.length} detected`,
          icon: '🐋'
        });
      }
      // Additional NFT metrics
      if (snapshotData.totalVolume) {
        metrics.push({
          key: 'Total Volume',
          value: `${snapshotData.totalVolume} SEI`,
          icon: '📊'
        });
      }
      if (snapshotData.floorPrice) {
        metrics.push({
          key: 'Floor Price',
          value: `${snapshotData.floorPrice} SEI`,
          icon: '🏷️'
        });
      }
      if (snapshotData.uniqueOwners) {
        metrics.push({
          key: 'Unique Owners',
          value: snapshotData.uniqueOwners.toString(),
          icon: '👤'
        });
      }
    }

    // Memecoin analysis specific metrics
    if (jobAction === 'analyze_coin_flows') {
      if (snapshotData.totalVolume) {
        metrics.push({
          key: 'Total Volume',
          value: `${snapshotData.totalVolume} SEI`,
          icon: '📊'
        });
      }
      if (snapshotData.transferCount) {
        metrics.push({
          key: 'Transfer Count',
          value: snapshotData.transferCount.toString(),
          icon: '🔄'
        });
      }
      if (snapshotData.uniqueSenders && snapshotData.uniqueSenders.length > 0) {
        metrics.push({
          key: 'Unique Senders',
          value: snapshotData.uniqueSenders.length.toString(),
          icon: '📤'
        });
      }
      if (snapshotData.uniqueReceivers && snapshotData.uniqueReceivers.length > 0) {
        metrics.push({
          key: 'Unique Receivers',
          value: snapshotData.uniqueReceivers.length.toString(),
          icon: '📥'
        });
      }
      if (snapshotData.alerts && snapshotData.alerts.length > 0) {
        metrics.push({
          key: 'Alerts',
          value: `${snapshotData.alerts.length} detected`,
          icon: '🚨'
        });
      }
      if (snapshotData.whaleMovements && snapshotData.whaleMovements.length > 0) {
        metrics.push({
          key: 'Whale Movements',
          value: `${snapshotData.whaleMovements.length} detected`,
          icon: '🐋'
        });
      }
      // Additional memecoin metrics
      if (snapshotData.marketCap) {
        metrics.push({
          key: 'Market Cap',
          value: `${snapshotData.marketCap} SEI`,
          icon: '💹'
        });
      }
      if (snapshotData.circulatingSupply) {
        metrics.push({
          key: 'Circulating Supply',
          value: snapshotData.circulatingSupply.toString(),
          icon: '🪙'
        });
      }
      if (snapshotData.largeTransfers && snapshotData.largeTransfers.length > 0) {
        metrics.push({
          key: 'Large Transfers',
          value: `${snapshotData.largeTransfers.length} detected`,
          icon: '💸'
        });
      }
    }

    // If no specific metrics found, show some general data
    if (metrics.length === 0) {
      if (snapshotData.type) {
        metrics.push({
          key: 'Type',
          value: snapshotData.type,
          icon: '🏷️'
        });
      }
      if (snapshotData.network) {
        metrics.push({
          key: 'Network',
          value: snapshotData.network,
          icon: '🌐'
        });
      }
      // Try to extract any numeric or array data as fallback
      Object.entries(snapshotData).forEach(([key, value]) => {
        if (typeof value === 'number' && value > 0) {
          metrics.push({
            key: key.charAt(0).toUpperCase() + key.slice(1),
            value: value.toString(),
            icon: '📊'
          });
        } else if (Array.isArray(value) && value.length > 0) {
          metrics.push({
            key: key.charAt(0).toUpperCase() + key.slice(1),
            value: `${value.length} items`,
            icon: '📋'
          });
        }
      });
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metrics.map((metric, index) => (
          <div 
            key={index}
            className="flex items-center gap-2 p-3 rounded border-l-2" 
            style={{backgroundColor: '#262624', borderLeftColor: '#ef4444'}}
          >
            <div>
              <div className="text-muted-foreground text-xs">{metric.icon} {metric.key}</div>
              <div className="text-card-foreground font-medium">{metric.value}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const fetchJobs = async () => {
    // setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3000/jobs')
      if (response.ok) {
        const jobsData = await response.json()
        setJobs(jobsData.slice(0, 10)) // Show latest 10 jobs since we have more space
        // Set isFirstLoad to false after first successful fetch
        if (isFirstLoad) {
          setIsFirstLoad(false);
        }
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchLatestSnapshot = async (job: JobData) => {
    if (!job.payload) return;
    
    console.log('🔍 Fetching snapshot for job:', job.action, 'Payload:', job.payload);
    
    setIsLoadingSnapshot(true);
    try {
      let endpoint = '';
      let address = '';
      
      // Determine endpoint and address based on job action
      if (job.action === 'wallet_snapshot' && job.payload.wallet) {
        endpoint = `http://localhost:3000/snapshots/wallet/${job.payload.wallet}`;
        address = job.payload.wallet;
        console.log('📊 Wallet snapshot endpoint:', endpoint);
      } else if (job.action === 'analyze_nft_movements') {
        // Check multiple possible field names for NFT contract address
        const nftAddress = job.payload.collectionAddress || job.payload.tokenAddress || job.payload.nftAddress || job.payload.address;
        if (nftAddress) {
          endpoint = `http://localhost:3000/snapshots/nft/${nftAddress}`;
          address = nftAddress;
          console.log('🖼️ NFT snapshot endpoint:', endpoint, 'Address:', address);
        } else {
          console.log('❌ No NFT address found in payload:', job.payload);
          setIsLoadingSnapshot(false);
          return;
        }
      } else if (job.action === 'analyze_coin_flows' && job.payload.tokenAddress) {
        endpoint = `http://localhost:3000/snapshots/memecoin/${job.payload.tokenAddress}`;
        address = job.payload.tokenAddress;
        console.log('🪙 Memecoin snapshot endpoint:', endpoint);
      } else {
        console.log('❌ No valid endpoint for job action:', job.action, 'Payload:', job.payload);
        setIsLoadingSnapshot(false);
        return;
      }
      
      console.log('🚀 Making request to:', endpoint, 'Network:', job.network);
      const response = await fetch(`${endpoint}?network=${job.network}`);
      const result = await response.json();
      
      console.log('📡 Snapshot response:', result);
      
      if (result.success && result.data) {
        setSnapshotData({
          data: result.data,
          generated: result.generated,
          timestamp: result.data.createdAt || result.data.timestamp
        });
      } else {
        setSnapshotData(null);
      }
    } catch (error) {
      console.error('❌ Error fetching snapshot:', error);
      setSnapshotData(null);
    } finally {
      setIsLoadingSnapshot(false);
    }
  };

  const handleJobClick = (job: JobData) => {
    setSelectedJob(job);
    setSnapshotData(null); // Reset snapshot data
    // Fetch snapshot when job modal opens
    fetchLatestSnapshot(job);
  };

  // Auto-refresh jobs every 5 seconds
  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [])



  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  return (
    <div className="h-full rounded-xl border shadow-lg text-card-foreground border-border flex flex-col" style={{backgroundColor: '#30302E'}}>
      <div className="p-6 flex-shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Jobs running by</h3>
            <p className="text-sm text-muted-foreground">AI agent</p>
          </div>
          {isLoading && isFirstLoad && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-red border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm text-muted-foreground">Loading jobs...</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex-1 px-6 pb-6 overflow-y-auto scrollbar-thin scrollbar-thumb-red/30 scrollbar-track-transparent hover:scrollbar-thumb-red/50">

      {jobs.length === 0 ? (
        <div className="text-center py-12">
          {isLoading && isFirstLoad ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-red border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground text-sm">Loading jobs...</p>
            </div>
          ) : (
            <>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{backgroundColor: '#30302E'}}>
            <Activity className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm mb-2">No jobs running</p>
          <p className="text-xs text-muted-foreground opacity-75">
            Ask the agent to monitor wallets or track memecoins
          </p>
            </>
          )}
        </div>
              ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <JobCard 
                key={job._id} 
                job={job} 
                snapshotData={selectedJob?._id === job._id ? snapshotData : null}
                isLoadingSnapshot={selectedJob?._id === job._id ? isLoadingSnapshot : false}
                handleJobClick={handleJobClick}
                renderSnapshotMetrics={renderSnapshotMetrics}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCall[]>([])
  const [currentToolOutputs, setCurrentToolOutputs] = useState<ToolOutput[]>([])
  const [expandedTools, setExpandedTools] = useState<{ [key: string]: boolean }>({})
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash')
  const [showModelPopover, setShowModelPopover] = useState(false)
  const [showToolsPopover, setShowToolsPopover] = useState(false)
  const [showMobileJobs, setShowMobileJobs] = useState(false)
  const [viewMode, setViewMode] = useState<'ai-agent' | 'dashboard'>('ai-agent')
  const [dashboardStats, setDashboardStats] = useState({
    totalJobs: 0,
    runningJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    recentJobs: [] as JobData[],
    snapshotStats: {
      wallets: 0,
      nfts: 0,
      memecoins: 0
    }
  })
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [conversationId] = useState(() => `conv_${Date.now()}`)
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null)
  const [snapshotData, setSnapshotData] = useState<SnapshotData | null>(null)
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false)

  const fetchDashboardData = async () => {
    if (viewMode !== 'dashboard') return;
    
    // setIsLoadingDashboard(true);
    try {
      // Fetch jobs data
      const jobsResponse = await fetch('http://localhost:3000/jobs');
      if (jobsResponse.ok) {
        const jobsData = await jobsResponse.json();
        
        // Calculate stats
        const running = jobsData.filter((job: JobData) => job.status === 'running').length;
        const completed = jobsData.filter((job: JobData) => job.status === 'completed').length;
        const failed = jobsData.filter((job: JobData) => job.status === 'failed').length;
        
        setDashboardStats(prev => ({
          ...prev,
          totalJobs: jobsData.length,
          runningJobs: running,
          completedJobs: completed,
          failedJobs: failed,
          recentJobs: jobsData.slice(0, 5)
        }));
      }
      
      // Fetch snapshot stats
      const snapshotsResponse = await fetch('http://localhost:3000/snapshots/stats');
      if (snapshotsResponse.ok) {
        const snapshotsData = await snapshotsResponse.json();
        if (snapshotsData.success) {
          setDashboardStats(prev => ({
            ...prev,
            snapshotStats: {
              wallets: snapshotsData.data.counts.wallets,
              nfts: snapshotsData.data.counts.nfts,
              memecoins: snapshotsData.data.counts.memecoins
            }
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  // Available tools with quick actions
  const availableTools: AvailableTool[] = [
    // NETWORK INFORMATION TOOLS
    {
      name: "get_chain_info",
      description: "Get information about Sei network",
      icon: Activity,
      quickAction: "Get chain information for Sei network",
      category: "blockchain"
    },
    {
      name: "get_supported_networks",
      description: "Get a list of supported EVM networks",
      icon: Globe,
      quickAction: "Show all supported Sei networks",
      category: "blockchain"
    },
    
    // BLOCK TOOLS
    {
      name: "get_block_by_number",
      description: "Get a block by its block number",
      icon: Activity,
      quickAction: "Get block information for block number: 12345",
      category: "blockchain"
    },
    {
      name: "get_latest_block",
      description: "Get the latest block from the EVM",
      icon: Clock,
      quickAction: "Get the latest block information",
      category: "blockchain"
    },
    
    // BALANCE TOOLS
    {
      name: "get_balance",
      description: "Get the native token balance (Sei) for an address",
      icon: Wallet,
      quickAction: "Check balance for address: 0x37035490ccb95225FC7cf99e9dbC7eD35890887f",
      category: "wallet"
    },
    {
      name: "get_erc20_balance",
      description: "Get the ERC20 token balance of an EVM address",
      icon: Coins,
      quickAction: "Check ERC20 balance for address: 0x37035490ccb95225FC7cf99e9dbC7eD35890887f",
      category: "wallet"
    },
    {
      name: "get_token_balance",
      description: "Get the balance of an ERC20 token for an address",
      icon: Coins,
      quickAction: "Check token balance for address: 0x37035490ccb95225FC7cf99e9dbC7eD35890887f",
      category: "wallet"
    },
    
    // TRANSACTION TOOLS
    {
      name: "get_transaction",
      description: "Get detailed information about a specific transaction by its hash",
      icon: Clock,
      quickAction: "Get transaction details for hash: 0x1234...",
      category: "blockchain"
    },
    {
      name: "get_transaction_receipt",
      description: "Get a transaction receipt by its hash",
      icon: Clock,
      quickAction: "Get transaction receipt for hash: 0x1234...",
      category: "blockchain"
    },
    {
      name: "estimate_gas",
      description: "Estimate the gas cost for a transaction",
      icon: Zap,
      quickAction: "Estimate gas for a transaction",
      category: "blockchain"
    },
    
    // TRANSFER TOOLS
    {
      name: "transfer_sei",
      description: "Transfer native tokens (Sei) to an address",
      icon: Send,
      quickAction: "Transfer 0.1 SEI to address: 0x1234...",
      category: "wallet"
    },
    {
      name: "transfer_erc20",
      description: "Transfer ERC20 tokens to another address",
      icon: Send,
      quickAction: "Transfer 100 tokens to address: 0x1234...",
      category: "wallet"
    },
    {
      name: "approve_token_spending",
      description: "Approve another address to spend your ERC20 tokens",
      icon: Shield,
      quickAction: "Approve token spending for address: 0x1234...",
      category: "wallet"
    },
    {
      name: "transfer_nft",
      description: "Transfer an NFT (ERC721 token) from one address to another",
      icon: Send,
      quickAction: "Transfer NFT to address: 0x1234...",
      category: "wallet"
    },
    {
      name: "transfer_erc1155",
      description: "Transfer ERC1155 tokens to another address",
      icon: Send,
      quickAction: "Transfer ERC1155 tokens to address: 0x1234...",
      category: "wallet"
    },
    {
      name: "transfer_token",
      description: "Transfer ERC20 tokens to an address",
      icon: Send,
      quickAction: "Transfer tokens to address: 0x1234...",
      category: "wallet"
    },
    
    // CONTRACT TOOLS
    {
      name: "read_contract",
      description: "Read data from a smart contract by calling a view/pure function",
      icon: FileText,
      quickAction: "Read data from contract: 0x1234...",
      category: "blockchain"
    },
    {
      name: "write_contract",
      description: "Write data to a smart contract by calling a state-changing function",
      icon: Hammer,
      quickAction: "Write to contract: 0x1234...",
      category: "blockchain"
    },
    {
      name: "deploy_contract",
      description: "Deploy a new smart contract to the blockchain",
      icon: Hammer,
      quickAction: "Deploy a new smart contract",
      category: "blockchain"
    },
    {
      name: "is_contract",
      description: "Check if an address is a smart contract or an externally owned account",
      icon: Building,
      quickAction: "Check if address is a contract: 0x1234...",
      category: "blockchain"
    },
    
    // TOKEN & NFT TOOLS
    {
      name: "get_token_info",
      description: "Get comprehensive information about an ERC20 token",
      icon: Coins,
      quickAction: "Get token info for: 0x1234...",
      category: "analysis"
    },
    {
      name: "get_nft_info",
      description: "Get detailed information about a specific NFT (ERC721 token)",
      icon: Building,
      quickAction: "Get NFT info for token ID: 1234",
      category: "analysis"
    },
    {
      name: "check_nft_ownership",
      description: "Check if an address owns a specific NFT",
      icon: Eye,
      quickAction: "Check NFT ownership for address: 0x1234...",
      category: "analysis"
    },
    {
      name: "get_erc1155_token_uri",
      description: "Get the metadata URI for an ERC1155 token",
      icon: FileText,
      quickAction: "Get ERC1155 token URI for ID: 1234",
      category: "analysis"
    },
    {
      name: "get_nft_balance",
      description: "Get the total number of NFTs owned by an address from a specific collection",
      icon: Building,
      quickAction: "Get NFT balance for address: 0x1234...",
      category: "analysis"
    },
    {
      name: "get_erc1155_balance",
      description: "Get the balance of a specific ERC1155 token ID owned by an address",
      icon: Building,
      quickAction: "Get ERC1155 balance for address: 0x1234...",
      category: "analysis"
    },
    
    // WALLET TOOLS
    {
      name: "get_address_from_private_key",
      description: "Get the EVM address derived from a private key",
      icon: Wallet,
      quickAction: "Get address from private key",
      category: "wallet"
    },
    
    // JOB RUNNER TOOLS
    {
      name: "create_wallet_watch_job",
      description: "Set up continuous monitoring of a specific wallet address",
      icon: Eye,
      quickAction: "Start monitoring wallet: 0x1234...",
      category: "analysis"
    },
    {
      name: "create_nft_watch_job",
      description: "Monitor an NFT collection for activity patterns and trading behavior",
      icon: Building,
      quickAction: "Start monitoring NFT collection: 0x1234...",
      category: "analysis"
    },
    {
      name: "create_memecoin_watch_job",
      description: "Monitor a memecoin or token for trading activity and whale movements",
      icon: TrendingUp,
      quickAction: "Start monitoring memecoin: 0x1234...",
      category: "analysis"
    },
    {
      name: "get_wallet_analysis",
      description: "Get complete analysis of a wallet's financial position and trading activity",
      icon: BarChart3,
      quickAction: "Analyze wallet: 0x1234...",
      category: "analysis"
    },
    {
      name: "get_memecoin_analysis",
      description: "Get deep insights into a cryptocurrency token's market behavior",
      icon: TrendingUp,
      quickAction: "Analyze memecoin: 0x1234...",
      category: "analysis"
    },
    {
      name: "get_nft_analysis",
      description: "Get deep insights into an NFT collection's market behavior and trading patterns",
      icon: Building,
      quickAction: "Analyze NFT collection: 0x1234...",
      category: "analysis"
    },
    {
      name: "get_comprehensive_wallet_snapshots",
      description: "Get complete financial portfolio analysis across all asset types",
      icon: BarChart3,
      quickAction: "Get comprehensive wallet analysis for: 0x1234...",
      category: "analysis"
    },
    {
      name: "get_snapshot_statistics",
      description: "Get comprehensive overview of the entire blockchain analytics system",
      icon: BarChart3,
      quickAction: "Get system-wide analytics and statistics",
      category: "analysis"
    },
    {
      name: "get_wallet_latest_transactions_lightweight",
      description: "Get the most recent transaction data for a wallet address directly from blockchain",
      icon: Clock,
      quickAction: "Get latest transactions for wallet: 0x1234...",
      category: "blockchain"
    },
    {
      name: "get_nft_latest_transactions_lightweight",
      description: "Get the most recent transfer data for an NFT collection directly from blockchain",
      icon: Clock,
      quickAction: "Get latest NFT transfers for collection: 0x1234...",
      category: "blockchain"
    },
    {
      name: "get_memecoin_latest_transactions_lightweight",
      description: "Get the most recent transfer data for a memecoin directly from blockchain",
      icon: Clock,
      quickAction: "Get latest memecoin transfers for: 0x1234...",
      category: "blockchain"
    },
    {
      name: "get_all_jobs",
      description: "Retrieve a list of all jobs in the system",
      icon: Clock,
      quickAction: "Show all jobs in the system",
      category: "analysis"
    },
    {
      name: "get_job_details",
      description: "Get detailed information about a specific job including logs and execution history",
      icon: FileText,
      quickAction: "Get details for job ID: abc123",
      category: "analysis"
    },
    {
      name: "get_job_logs",
      description: "Retrieve logs for a specific job for debugging and monitoring",
      icon: FileText,
      quickAction: "Get logs for job ID: abc123",
      category: "analysis"
    },
    {
      name: "get_job_service_logs",
      description: "Retrieve service-specific logs for a job during execution",
      icon: FileText,
      quickAction: "Get service logs for job ID: abc123",
      category: "analysis"
    },
    {
      name: "get_failed_jobs",
      description: "Retrieve a list of jobs that have failed execution",
      icon: AlertTriangle,
      quickAction: "Show failed jobs",
      category: "analysis"
    },
    {
      name: "delete_job",
      description: "Remove a job from the system",
      icon: Trash2,
      quickAction: "Delete job ID: abc123",
      category: "analysis"
    },
    {
      name: "deep_researcher_start",
      description: "Start a smart AI researcher for complex questions. The AI will search the web, read many sources, and think deeply about your question to create a detailed research report",
      icon: Search,
      quickAction: "Start deep research on topic",
      category: "research"
    },
    {
      name: "deep_researcher_check",
      description: "Check if your research is ready and get the results. Use this after starting a research task to see if it's done and get your comprehensive report",
      icon: CheckCircle,
      quickAction: "Check research status",
      category: "research"
    },
    {
      name: "web_search_exa",
      description: "Performs real-time web searches with optimized results and content extraction",
      icon: Globe,
      quickAction: "Search the web with Exa",
      category: "research"
    },
    {
      name: "company_research",
      description: "Comprehensive company research tool that crawls company websites to gather detailed information about businesses",
      icon: Building,
      quickAction: "Research company details",
      category: "research"
    },
    {
      name: "crawling",
      description: "Extracts content from specific URLs, useful for reading articles, PDFs, or any web page when you have the exact URL",
      icon: Link,
      quickAction: "Extract content from URL",
      category: "research"
    },
    {
      name: "linkedin_search",
      description: "Search LinkedIn for companies and people using Exa AI. Simply include company names, person names, or specific LinkedIn URLs in your query",
      icon: Linkedin,
      quickAction: "Search LinkedIn profiles",
      category: "research"
    }
    
    
  ]

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, currentToolCalls, currentToolOutputs])

  // Additional scroll when content changes during streaming
  useEffect(() => {
    if (streamingContent || currentToolCalls.length > 0) {
      scrollToBottom()
    }
  }, [streamingContent, currentToolCalls, currentToolOutputs])

  // Fetch dashboard data when view mode changes
  useEffect(() => {
    if (viewMode === 'dashboard') {
      fetchDashboardData();
    }
  }, [viewMode]);

  // Auto-refresh dashboard data every 10 seconds when in dashboard mode
  useEffect(() => {
    if (viewMode !== 'dashboard') return;
    
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, [viewMode]);

  const toggleToolExpansion = (toolIndex: string) => {
    setExpandedTools(prev => ({
      ...prev,
      [toolIndex]: !prev[toolIndex]
    }))
    // Scroll after expansion to keep content visible
    setTimeout(scrollToBottom, 200)
  }

  const formatToolArguments = (args: any) => {
    if (typeof args === 'object') {
      return JSON.stringify(args, null, 2)
    }
    return String(args)
  }

  const formatToolOutput = (output: any) => {
    if (typeof output === 'object') {
      return JSON.stringify(output, null, 2)
    }
    return String(output)
  }

  const ToolCallCard = ({ toolCall, toolOutput, index }: { 
    toolCall: ToolCall, 
    toolOutput?: ToolOutput, 
    index: number 
  }) => {
    const isExpanded = expandedTools[`${index}`]
    const hasOutput = !!toolOutput

    return (
      <div className="mb-2 rounded-lg overflow-hidden max-w-full" style={{backgroundColor: '#30302E', border: '1px solid #3a3a38'}}>
        <div
          className="flex items-center justify-between p-3 cursor-pointer transition-colors min-w-0 hover:opacity-80"
          onClick={() => toggleToolExpansion(`${index}`)}
        >
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <ToolIcon />
            <span className="font-medium text-white truncate">{toolCall.name}</span>
            {hasOutput && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-900 text-green-300 flex-shrink-0">
                ✓ Completed
              </span>
            )}
            {!hasOutput && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-900 text-yellow-300 flex-shrink-0">
                ⏳ Running
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            {toolCall.timestamp && (
              <span className="text-xs text-gray-400 flex items-center">
                <ClockIcon />
                <span className="ml-1">
                  {new Date(toolCall.timestamp).toLocaleTimeString()}
                </span>
              </span>
            )}
            {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </div>
        </div>

        {isExpanded && (
          <div className="border-t p-0" style={{borderColor: '#3a3a38', backgroundColor: '#262624'}}>
            <div className="p-3">
              <h4 className="font-medium text-white mb-2">Arguments:</h4>
              <pre className="p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words max-w-full text-gray-300" style={{backgroundColor: '#1a1a18'}}>
                {formatToolArguments(toolCall.arguments)}
              </pre>
            </div>

            {hasOutput && (
              <div className="border-t p-3" style={{borderColor: '#3a3a38'}}>
                <h4 className="font-medium text-white mb-2">Response:</h4>
                <pre className="p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-40 max-w-full text-gray-300" style={{backgroundColor: '#1a1a18'}}>
                  {formatToolOutput(toolOutput.tool_output)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const handleQuickAction = (tool: AvailableTool) => {
    if (tool.quickAction && !isLoading) {
      setInput(tool.quickAction)
      setShowToolsPopover(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setStreamingContent('')
    setCurrentToolCalls([])
    setCurrentToolOutputs([])

    // Create streaming assistant message
    const assistantMessage: Message = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      tool_calls: [],
      tool_outputs: [],
    }

    setMessages(prev => [...prev, assistantMessage])

    try {
      const response = await fetch('http://localhost:8000/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversation_id: conversationId,
          include_history: true,
          model: selectedModel,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader available')

      let finalContent = ''
      let finalToolCalls: ToolCall[] = []
      let finalToolOutputs: ToolOutput[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              switch (data.type) {
                case 'delta':
                  finalContent += data.content
                  setStreamingContent(finalContent)
                  break

                case 'tool_call_start':
                  const newToolCall: ToolCall = {
                    name: data.tool_name || data.content?.split('tool: ')[1] || 'Unknown Tool',
                    arguments: data.tool_arguments || data.tool_info?.arguments || {},
                    tool_id: data.tool_id || `tool_${Date.now()}`,
                    timestamp: data.timestamp || new Date().toISOString(),
                  }
                  finalToolCalls.push(newToolCall)
                  setCurrentToolCalls([...finalToolCalls])
                  console.log('Tool call added:', newToolCall)
                  break

                case 'tool_call':
                  // Handle the old format for backward compatibility
                  const toolCallCompat: ToolCall = {
                    name: data.tool_info?.name || data.content?.split('tool: ')[1] || 'Unknown Tool',
                    arguments: data.tool_info?.arguments || {},
                    tool_id: data.tool_info?.tool_id || `tool_${Date.now()}`,
                    timestamp: new Date().toISOString(),
                  }
                  finalToolCalls.push(toolCallCompat)
                  setCurrentToolCalls([...finalToolCalls])
                  console.log('Tool call (compat) added:', toolCallCompat)
                  break

                case 'tool_call_output':
                case 'tool_output':
                  const newToolOutput: ToolOutput = {
                    tool_name: data.tool_name || 'Unknown Tool',
                    tool_output: data.tool_output || data.output || data.content,
                    raw_output: data.raw_output || data.output || data.content,
                    tool_id: data.tool_id || finalToolCalls[finalToolCalls.length - 1]?.tool_id,
                    timestamp: data.timestamp || new Date().toISOString(),
                  }
                  finalToolOutputs.push(newToolOutput)
                  setCurrentToolOutputs([...finalToolOutputs])
                  console.log('Tool output added:', newToolOutput)
                  break

                case 'error':
                  // Handle error responses
                  console.error('Streaming error:', data.content)
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          content: `❌ Error: ${data.content}`,
                          isStreaming: false,
                        }
                      : msg
                  ))
                  setStreamingContent('')
                  setCurrentToolCalls([])
                  setCurrentToolOutputs([])
                  setIsLoading(false)
                  return // Exit early on error
                  
                case 'complete':
                  // Update final message
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          content: finalContent,
                          tool_calls: finalToolCalls,
                          tool_outputs: finalToolOutputs,
                          isStreaming: false,
                        }
                      : msg
                  ))
                  setStreamingContent('')
                  setCurrentToolCalls([])
                  setCurrentToolOutputs([])
                  break

                case 'error':
                  console.error('Stream error:', data.content)
                  break
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessage.id
          ? { ...msg, content: 'Sorry, there was an error processing your request.', isStreaming: false }
          : msg
      ))
    } finally {
      setIsLoading(false)
    }
  }

  const fetchLatestSnapshot = async (job: JobData) => {
    if (!job.payload) return;
    
    setIsLoadingSnapshot(true);
    try {
      let endpoint = '';
      let address = '';
      
      // Determine endpoint and address based on job action
      if (job.action === 'wallet_snapshot' && job.payload.wallet) {
        endpoint = `http://localhost:3000/snapshots/wallet/${job.payload.wallet}`;
        address = job.payload.wallet;
      } else if (job.action === 'analyze_nft_movements') {
        // Check multiple possible field names for NFT contract address
        const nftAddress = job.payload.collectionAddress || job.payload.tokenAddress || job.payload.nftAddress || job.payload.address;
        if (nftAddress) {
          endpoint = `http://localhost:3000/snapshots/nft/${nftAddress}`;
          address = nftAddress;
          console.log('🖼️ NFT snapshot endpoint:', endpoint, 'Address:', address);
        } else {
          console.log('❌ No NFT address found in payload:', job.payload);
          setIsLoadingSnapshot(false);
          return;
        }
      } else if (job.action === 'analyze_coin_flows' && job.payload.tokenAddress) {
        endpoint = `http://localhost:3000/snapshots/memecoin/${job.payload.tokenAddress}`;
        address = job.payload.tokenAddress;
        console.log('🪙 Memecoin snapshot endpoint:', endpoint);
      } else {
        console.log('❌ No valid endpoint for job action:', job.action, 'Payload:', job.payload);
        setIsLoadingSnapshot(false);
        return;
      }
      
      console.log('🚀 Making request to:', endpoint, 'Network:', job.network);
      const response = await fetch(`${endpoint}?network=${job.network}`);
      const result = await response.json();
      
      console.log('📡 Snapshot response:', result);
      
      if (result.success && result.data) {
        setSnapshotData({
          data: result.data,
          generated: result.generated,
          timestamp: result.data.createdAt || result.data.timestamp
        });
      } else {
        setSnapshotData(null);
      }
    } catch (error) {
      console.error('❌ Error fetching snapshot:', error);
      setSnapshotData(null);
    } finally {
      setIsLoadingSnapshot(false);
    }
  };

  const handleJobClick = (job: JobData) => {
    setSelectedJob(job);
    setSnapshotData(null); // Reset snapshot data
    // Fetch snapshot when job modal opens
    fetchLatestSnapshot(job);
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row" style={{backgroundColor: '#262624'}}>
      {/* View Toggle Switch */}
      <div className="fixed top-4 left-4 z-50">
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{backgroundColor: 'rgba(48, 48, 46, 0.95)'}}>
          <span className={`text-sm font-medium ${viewMode === 'ai-agent' ? 'text-red' : 'text-muted-foreground'}`}>Agent Mode</span>
          <button
            onClick={() => setViewMode(viewMode === 'ai-agent' ? 'dashboard' : 'ai-agent')}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              viewMode === 'ai-agent' ? 'bg-red' : 'bg-gray-600'
            }`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
              viewMode === 'ai-agent' ? 'translate-x-0.5' : 'translate-x-6'
            }`} />
          </button>
          <span className={`text-sm font-medium ${viewMode === 'dashboard' ? 'text-red' : 'text-muted-foreground'}`}>Dashboard</span>
        </div>
      </div>

      {/* Left Side - AI Agent (60%) */}
      <div className={`flex-1 lg:w-3/5 flex flex-col overflow-hidden ${viewMode === 'dashboard' ? 'hidden' : 'block'}`}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto mt-4">
          <div className="px-12 py-4 pt-12">
            <div className="max-w-4xl lg:max-w-none mx-auto lg:mx-0 space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{backgroundColor: '#b91c1c'}}>
                <BotIcon />
              </div>
              <h2 className="text-2xl font-semibold text-white mb-3">
                Vincent AI
              </h2>
              <p className="text-gray-400 text-lg">
                Your blockchain intelligence assistant
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Ask me anything about wallets, tokens, NFTs, blockchain analysis, job monitoring, or comprehensive analytics
              </p>
              {selectedModel === 'qwen-3-235b' && (
                <div className="mt-3 px-3 py-2 rounded-lg inline-block" style={{backgroundColor: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)'}}>
                  <span className="text-xs text-yellow-500 font-medium">
                    ⚠️ Experimental: This model may have compatibility issues
                  </span>
                </div>
              )}
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className="animate-fadeIn">
              <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex space-x-3 max-w-[95%] ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white ${
                    message.role === 'user' 
                      ? '' 
                      : ''
                  }`} style={message.role === 'user' ? {backgroundColor: '#4a4a48'} : {backgroundColor: '#b91c1c'}}>
                    {message.role === 'user' ? <UserIcon /> : <BotIcon isStreaming={message.isStreaming || (isLoading && !!streamingContent)} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`p-4 rounded-2xl break-words overflow-hidden ${message.role === 'user' ? 'max-w-fit ml-auto' : 'w-full'} ${
                      message.role === 'user'
                        ? 'text-white'
                        : 'text-white'
                    }`} style={message.role === 'user' ? {backgroundColor: '#30302E'} : {}}>
                      {message.role === 'assistant' && (
                        <div>
                          {/* Tool calls section - show both completed and in-progress tools */}
                          {((message.tool_calls && message.tool_calls.length > 0) || 
                            (message.isStreaming && currentToolCalls.length > 0)) && (
                            <div className="mb-4 max-w-full overflow-hidden">
                              {(message.isStreaming ? currentToolCalls : message.tool_calls || []).map((toolCall, index) => {
                                const correspondingOutput = (message.isStreaming ? currentToolOutputs : message.tool_outputs || []).find(
                                  output => output.tool_id === toolCall.tool_id
                                )
                                return (
                                  <ToolCallCard
                                    key={`${toolCall.tool_id || index}`}
                                    toolCall={toolCall}
                                    toolOutput={correspondingOutput}
                                    index={index}
                                  />
                                )
                              })}
                            </div>
                          )}

                          {/* Show typing dots when waiting for initial response */}
                          {message.isStreaming && !streamingContent && currentToolCalls.length === 0 && (
                            <div className="typing-dots">
                              <span></span>
                              <span></span>
                              <span></span>
                            </div>
                          )}

                          {/* Message content */}
                          {(streamingContent || !message.isStreaming) && (
                            <div className="prose prose-sm max-w-none break-words overflow-hidden">
                              {message.isStreaming ? (
                                <div className="max-w-full overflow-hidden">
                                  {streamingContent && (
                                    <div className="break-words overflow-hidden">
                                      <ReactMarkdown 
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeHighlight]}
                                                                components={{
                          pre: ({children}) => <pre className="p-3 rounded-lg overflow-x-auto text-sm text-gray-300" style={{backgroundColor: '#1a1a18'}}>{children}</pre>,
                          code: ({children, ...props}) => {
                            const isInline = !props.className
                            return isInline ? 
                              <code className="px-1 py-0.5 rounded text-sm" style={{backgroundColor: '#1a1a18', color: '#dc2626'}}>{children}</code> :
                              <code {...props}>{children}</code>
                          }
                        }}
                                      >
                                        {streamingContent}
                                      </ReactMarkdown>
                                    </div>
                                  )}
                                  {(streamingContent || currentToolCalls.length > 0) && (
                                    <div className="typing-dots mt-2">
                                      <span></span>
                                      <span></span>
                                      <span></span>
                                    </div>
                                  )}
                                </div>
                            ) : (
                              <div className="break-words overflow-hidden">
                                <ReactMarkdown 
                                  remarkPlugins={[remarkGfm]}
                                  rehypePlugins={[rehypeHighlight]}
                                  components={{
                                    pre: ({children}) => <pre className="p-3 rounded-lg overflow-x-auto text-sm text-gray-300" style={{backgroundColor: '#1a1a18'}}>{children}</pre>,
                                    code: ({children, ...props}) => {
                                      const isInline = !props.className
                                      return isInline ? 
                                        <code className="px-1 py-0.5 rounded text-sm" style={{backgroundColor: '#1a1a18', color: '#dc2626'}}>{children}</code> :
                                        <code {...props}>{children}</code>
                                    },
                                    table: ({children}) => <div className="overflow-x-auto"><table className="min-w-full border-collapse border" style={{borderColor: '#3a3a38'}}>{children}</table></div>,
                                    th: ({children}) => <th className="border px-4 py-2 text-white" style={{borderColor: '#3a3a38', backgroundColor: '#30302E'}}>{children}</th>,
                                    td: ({children}) => <td className="border px-4 py-2 text-gray-300" style={{borderColor: '#3a3a38'}}>{children}</td>
                                  }}
                                >
                                  {message.content}
                                </ReactMarkdown>
                              </div>
                            )}
                          </div>
                          )}
                        </div>
                      )}
                      {message.role === 'user' && (
                        <div className="break-words overflow-hidden">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              pre: ({children}) => <pre className="p-3 rounded-lg overflow-x-auto text-sm text-gray-300" style={{backgroundColor: '#1a1a18'}}>{children}</pre>,
                              code: ({children, ...props}) => {
                                const isInline = !props.className
                                return isInline ? 
                                  <code className="px-1 py-0.5 rounded text-sm" style={{backgroundColor: '#1a1a18', color: '#dc2626'}}>{children}</code> :
                                  <code {...props}>{children}</code>
                              }
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="px-12 py-6 flex-shrink-0">
          <div className="rounded-2xl p-6 shadow-2xl backdrop-blur-sm" style={{backgroundColor: 'rgba(48, 48, 46, 0.95)'}}>
            <div className="space-y-4">
          {/* Model Selector Row */}
          <div className="flex items-center justify-between">
            <Popover open={showModelPopover} onOpenChange={setShowModelPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-3 text-sm text-white hover:text-white hover:opacity-80" style={{backgroundColor: 'transparent', borderColor: '#4a4a48'}}>
                  <Settings className="w-4 h-4 mr-2" />
                  {selectedModel === 'gemini-2.5-flash' && 'Gemini 2.5 Flash'}
                  {selectedModel === 'gemini-1.5-flash' && 'Gemini 1.5 Flash'}
                  {selectedModel === 'gemini-2.5-pro' && 'Gemini 2.5 Pro'}
                  {selectedModel === 'qwen-3-235b' && 'Qwen 3 235B'}
                  <ChevronDown className="w-3 h-3 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" style={{backgroundColor: '#30302E', borderColor: '#3a3a38'}} align="start">
                <div className="space-y-1">
                  <div className="px-2 py-1.5 text-sm font-medium text-white">Select Model</div>
                  {[
                    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Balanced performance' },
                    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', desc: 'Fast responses' },
                    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Advanced reasoning' },
                    { value: 'qwen-3-235b', label: 'Qwen 3 235B', desc: 'Advanced reasoning & thinking' }
                  ].map((model) => (
                    <Button
                      key={model.value}
                      variant={selectedModel === model.value ? "default" : "ghost"}
                      className={`w-full justify-start h-auto p-2 ${
                        selectedModel === model.value 
                          ? 'text-white' 
                          : 'text-white hover:text-white hover:opacity-80'
                      }`}
                      style={selectedModel === model.value ? {backgroundColor: '#b91c1c'} : {backgroundColor: 'transparent'}}
                      onClick={() => {
                        setSelectedModel(model.value)
                        setShowModelPopover(false)
                      }}
                    >
                      <div className="text-left">
                        <div className="font-medium">{model.label}</div>
                        <div className="text-xs text-gray-400">{model.desc}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover open={showToolsPopover} onOpenChange={setShowToolsPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-3 text-sm text-white hover:text-white hover:opacity-80" style={{backgroundColor: 'transparent', borderColor: '#4a4a48'}}>
                  <Hammer className="w-4 h-4 mr-2" />
                  Tools
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" style={{backgroundColor: '#30302E', borderColor: '#3a3a38'}} align="end">
                <div className="p-4">
                  <div className="text-sm font-medium text-white mb-3">Available Tools</div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {['blockchain', 'wallet', 'research', 'analysis'].map((category) => (
                      <div key={category}>
                        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 capitalize">
                          {category}
                        </div>
                        <div className="space-y-1 mb-4">
                          {availableTools
                            .filter(tool => tool.category === category)
                            .map((tool) => {
                              const IconComponent = tool.icon
                              return (
                                <div
                                  key={tool.name}
                                  className="flex items-start space-x-3 p-2 rounded-lg hover:opacity-80 cursor-pointer group"
                                  style={{backgroundColor: 'transparent'}}
                                  onClick={() => handleQuickAction(tool)}
                                >
                                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{backgroundColor: '#1a1a18'}}>
                                    <IconComponent className="w-4 h-4" style={{color: '#dc2626'}} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-white">{tool.name}</div>
                                    <div className="text-xs text-gray-400 truncate">{tool.description}</div>
                                  </div>
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2 text-gray-400 hover:text-white"
                                    style={{backgroundColor: 'transparent'}}
                                  >
                                    <Play className="w-3 h-3" />
                                  </Button>
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Input Field */}
          <div className="relative">
            <Input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                              placeholder="Ask Vincent about blockchain analysis, job monitoring, or any topic..."
              disabled={isLoading}
              className="w-full h-14 px-6 pr-16 text-base border-0 focus:ring-0 rounded-2xl transition-all duration-200 placeholder:text-gray-400 text-white"
              style={{backgroundColor: 'transparent'}}
            />
            
            {/* Send Button */}
            <Button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className={`absolute right-3 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 rounded-full transition-all duration-200 ${isLoading || !input.trim() ? 'bg-[#30302E]' : 'bg-[#b91c1c] hover:bg-[#991b1b]'}`}
            >
              {isLoading ? (
                <BotIcon isStreaming={true} />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard View */}
      <div className={`flex-1 lg:w-3/5 flex flex-col overflow-hidden ${viewMode === 'ai-agent' ? 'hidden' : 'block'}`}>
        <div className="h-full p-6 pt-20">
          <div className="h-full rounded-xl border shadow-lg text-card-foreground border-border" style={{backgroundColor: '#30302E'}}>
            <div className="p-6 border-b" style={{borderColor: '#444444'}}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-foreground">System Overview</h3>
                  <p className="text-sm text-muted-foreground mt-1">Real-time monitoring & analytics</p>
                </div>
                {isLoadingDashboard && (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-red border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-muted-foreground">Loading...</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="p-5 rounded-lg text-center border" style={{backgroundColor: 'transparent', borderColor: '#444444'}}>
                  <div className="text-3xl font-bold text-foreground mb-1">{dashboardStats.totalJobs}</div>
                  <div className="text-sm text-muted-foreground">Total Jobs</div>
                </div>
                
                <div className="p-5 rounded-lg text-center border" style={{backgroundColor: 'transparent', borderColor: '#444444'}}>
                  <div className="text-3xl font-bold text-green mb-1">{dashboardStats.runningJobs}</div>
                  <div className="text-sm text-muted-foreground">Running</div>
                </div>
                
                <div className="p-5 rounded-lg text-center border" style={{backgroundColor: 'transparent', borderColor: '#444444'}}>
                  <div className="text-3xl font-bold text-blue mb-1">{dashboardStats.completedJobs}</div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
                
                <div className="p-5 rounded-lg text-center border" style={{backgroundColor: 'transparent', borderColor: '#444444'}}>
                  <div className="text-3xl font-bold text-red mb-1">{dashboardStats.failedJobs}</div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
              </div>

              {/* System Status */}
              <div className="mb-8">
                <h4 className="text-sm font-medium text-foreground mb-4">System Status</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border" style={{backgroundColor: 'transparent', borderColor: '#444444'}}>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green"></div>
                      <div>
                        <div className="text-sm font-medium text-foreground">Network</div>
                        <div className="text-xs text-muted-foreground">All systems operational</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 rounded-lg border" style={{backgroundColor: 'transparent', borderColor: '#444444'}}>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green"></div>
                      <div>
                        <div className="text-sm font-medium text-foreground">Database</div>
                        <div className="text-xs text-muted-foreground">Connected & healthy</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>




              {/* Snapshot Stats */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-4">Snapshot Statistics</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg text-center border" style={{backgroundColor: 'transparent', borderColor: '#444444'}}>
                    <div className="text-2xl font-bold text-foreground mb-1">{dashboardStats.snapshotStats.wallets}</div>
                    <div className="text-xs text-muted-foreground">Wallet Snapshots</div>
                  </div>
                  
                  <div className="p-4 rounded-lg text-center border" style={{backgroundColor: 'transparent', borderColor: '#444444'}}>
                    <div className="text-2xl font-bold text-foreground mb-1">{dashboardStats.snapshotStats.nfts}</div>
                    <div className="text-xs text-muted-foreground">NFT Snapshots</div>
                  </div>
                  
                  <div className="p-4 rounded-lg text-center border" style={{backgroundColor: 'transparent', borderColor: '#444444'}}>
                    <div className="text-2xl font-bold text-foreground mb-1">{dashboardStats.snapshotStats.memecoins}</div>
                    <div className="text-xs text-muted-foreground">Token Snapshots</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Active Jobs (40%) */}
      <div className="hidden lg:block lg:w-2/5 p-6 h-screen">
        <div className="h-full">
          <JobsSection />
        </div>
      </div>

      {/* Mobile Job Toggle Button */}
      <button
        onClick={() => setShowMobileJobs(!showMobileJobs)}
        className="lg:hidden fixed top-4 right-4 w-12 h-12 rounded-full flex items-center justify-center shadow-lg z-50"
        style={{backgroundColor: '#b91c1c'}}
      >
        <Activity className="w-5 h-5 text-white" />
      </button>

      {/* Mobile Job Modal */}
      {showMobileJobs && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setShowMobileJobs(false)}>
          <div 
            className="absolute top-16 right-4 left-4 max-h-96 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <JobsSection />
          </div>
        </div>
      )}
    </div>
  )
}
