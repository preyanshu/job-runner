export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  apiEndpoint: string;
  isTestnet: boolean;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const NETWORKS: { [key: string]: NetworkConfig } = {
  testnet: {
    name: 'SEI Testnet',
    chainId: 713715,
    rpcUrl: 'https://rpc.testnet.sei.io',
    explorerUrl: 'https://testnet.sei.io',
    apiEndpoint: 'https://api.testnet.seistream.app',
    isTestnet: true,
    nativeCurrency: {
      name: 'SEI',
      symbol: 'SEI',
      decimals: 18
    }
  },
  devnet: {
    name: 'SEI Devnet',
    chainId: 713716,
    rpcUrl: 'https://rpc.devnet.sei.io',
    explorerUrl: 'https://devnet.sei.io',
    apiEndpoint: 'https://api.devnet.seistream.app',
    isTestnet: true,
    nativeCurrency: {
      name: 'SEI',
      symbol: 'SEI',
      decimals: 18
    }
  },
  mainnet: {
    name: 'SEI Mainnet',
    chainId: 713715,
    rpcUrl: 'https://rpc.sei.io',
    explorerUrl: 'https://sei.io',
    apiEndpoint: 'https://api.seistream.app',
    isTestnet: false,
    nativeCurrency: {
      name: 'SEI',
      symbol: 'SEI',
      decimals: 18
    }
  }
};

export const DEFAULT_NETWORK = 'testnet';

export function getNetworkConfig(network: string): NetworkConfig {
  const config = NETWORKS[network.toLowerCase()];
  if (!config) {
    throw new Error(`Unsupported network: ${network}. Supported networks: ${Object.keys(NETWORKS).join(', ')}`);
  }
  return config;
}

export function isValidNetwork(network: string): boolean {
  return Object.keys(NETWORKS).includes(network.toLowerCase());
}

export function getSupportedNetworks(): string[] {
  return Object.keys(NETWORKS);
}

export function getNetworkByChainId(chainId: number): NetworkConfig | null {
  return Object.values(NETWORKS).find(network => network.chainId === chainId) || null;
}

export function getDefaultNetworkConfig(): NetworkConfig {
  return NETWORKS[DEFAULT_NETWORK];
} 