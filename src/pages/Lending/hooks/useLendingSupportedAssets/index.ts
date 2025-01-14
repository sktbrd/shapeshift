import { fromAssetId, thorchainAssetId, thorchainChainId } from '@shapeshiftoss/caip'
import { supportsThorchain } from '@shapeshiftoss/hdwallet-core'
import { KnownChainIds } from '@shapeshiftoss/types'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { useIsSnapInstalled } from 'hooks/useIsSnapInstalled/useIsSnapInstalled'
import { useWallet } from 'hooks/useWallet/useWallet'
import { walletSupportsChain } from 'hooks/useWalletSupportsChain/useWalletSupportsChain'
import { bnOrZero } from 'lib/bignumber/bignumber'
import type { ThornodePoolResponse } from 'lib/swapper/swappers/ThorchainSwapper/types'
import { poolAssetIdToAssetId } from 'lib/swapper/swappers/ThorchainSwapper/utils/poolAssetHelpers/poolAssetHelpers'
import { isSome } from 'lib/utils'
import { getThorchainAvailablePools } from 'lib/utils/thorchain'
import { selectAssetById, selectWalletChainIds } from 'state/slices/selectors'
import { store } from 'state/store'

const queryKey = ['lendingSupportedAssets']

export const useLendingSupportedAssets = ({ type }: { type: 'collateral' | 'borrow' }) => {
  const wallet = useWallet().state.wallet
  const isSnapInstalled = useIsSnapInstalled()

  const { data: availablePools } = useQuery({
    // Mark pools data as stale after 60 seconds to handle the case of going from halted to available and vice versa
    staleTime: 60_000,
    queryKey: ['thorchainAvailablePools'],
    queryFn: getThorchainAvailablePools,
  })

  const walletSupportChains = useMemo(
    () =>
      Object.values(KnownChainIds).filter(chainId =>
        walletSupportsChain({ chainId, wallet, isSnapInstalled }),
      ),
    [isSnapInstalled, wallet],
  )

  const walletChainIds = useSelector(selectWalletChainIds)

  const selectSupportedAssets = useCallback(
    (data: ThornodePoolResponse[] | undefined) => {
      if (!data) return []
      const pools = (availablePools ?? []).filter(
        pool => type === 'borrow' || bnOrZero(pool.loan_collateral).gt(0),
      )

      const supportedAssets = pools
        .map(pool => {
          const assetId = poolAssetIdToAssetId(pool.asset)
          const chainId = assetId ? (fromAssetId(assetId).chainId as KnownChainIds) : undefined

          if (!chainId || !walletSupportChains.includes(chainId)) return undefined
          // Chain supported by the wallet, but no actual account for it.
          // This can happen with Ledger, when the chain's accounts haven't been connected
          if (type === 'borrow' && !walletChainIds.includes(chainId)) {
            return undefined
          }

          const asset = selectAssetById(store.getState(), assetId ?? '')
          return asset
        })
        .filter(isSome)

      if (
        type === 'borrow' &&
        wallet &&
        supportsThorchain(wallet) &&
        walletChainIds.includes(thorchainChainId)
      ) {
        const runeAsset = selectAssetById(store.getState(), thorchainAssetId)
        if (!runeAsset) return
        supportedAssets.push(runeAsset)
      }
      return supportedAssets
    },
    [availablePools, type, wallet, walletChainIds, walletSupportChains],
  )

  const lendingSupportedAssetsQuery = useQuery({
    staleTime: 60_000,
    queryKey,
    queryFn: () => availablePools,
    select: selectSupportedAssets,
    enabled: Boolean(availablePools?.length),
  })

  return lendingSupportedAssetsQuery
}
