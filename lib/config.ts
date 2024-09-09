import { http, createConfig } from 'wagmi'
import { metaMask } from 'wagmi/connectors'
import { type Chain } from 'viem'
import { ChainIdToliman } from './const'

export const tolimanLocalDev = {
  id: 16813125,
  name: 'Toliman Devnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:9545'] },
  },
} as const satisfies Chain

export const toliman = {
  id: ChainIdToliman,
  name: 'Toliman',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.toliman.suave.flashbots.net'] },
  },
  blockExplorers: {
    default: { name: 'Suave', url: 'https://explorer.toliman.suave.flashbots.net/' },
  },
} as const satisfies Chain

export const config = createConfig({
  chains: [
    // tolimanLocalDev,
    toliman,
  ],
  connectors: [
    metaMask(),
  ],
  transports: {
    [tolimanLocalDev.id]: http(),
    [toliman.id]: http(),
  },
})
