import { fromChainId } from '@shapeshiftoss/caip'
import type { Asset } from '@shapeshiftoss/types'
import { getConfig } from 'config'
import { bnOrZero } from 'lib/bignumber/bignumber'
import { convertBasisPointsToPercentage } from 'state/slices/tradeQuoteSlice/utils'

import { getTreasuryAddressFromChainId } from '../../utils/helpers/helpers'
import { getOneInchTokenAddress } from './helpers'
import { oneInchService } from './oneInchService'
import type { OneInchSwapApiInput, OneInchSwapResponse } from './types'

export type FetchOneInchSwapInput = {
  affiliateBps: string | undefined
  buyAsset: Asset
  receiveAddress: string
  sellAmountIncludingProtocolFeesCryptoBaseUnit: string
  sellAsset: Asset
  maximumSlippageDecimalPercentage: string
  sendAddress: string
}

export const fetchOneInchSwap = async ({
  affiliateBps,
  buyAsset,
  receiveAddress,
  sellAmountIncludingProtocolFeesCryptoBaseUnit,
  sellAsset,
  maximumSlippageDecimalPercentage,
  sendAddress,
}: FetchOneInchSwapInput) => {
  const apiUrl = getConfig().REACT_APP_ONE_INCH_API_URL

  // The maximum acceptable slippage percentage for the swap (e.g., 1 for 1%)
  // Note, we internally represent slippage as a decimal across the app (e.g., 0.01 for 1%)
  // so we need to multiply it by 100 when calling 1inch swap endpoint
  const maximumSlippagePercentage = bnOrZero(maximumSlippageDecimalPercentage).times(100).toNumber()

  const maybeTreasuryAddress = (() => {
    try {
      return getTreasuryAddressFromChainId(buyAsset.chainId)
    } catch (err) {}
  })()

  const buyTokenPercentageFee = affiliateBps
    ? convertBasisPointsToPercentage(affiliateBps).toNumber()
    : 0

  const params: OneInchSwapApiInput = {
    fromTokenAddress: getOneInchTokenAddress(sellAsset),
    toTokenAddress: getOneInchTokenAddress(buyAsset),
    receiver: receiveAddress,
    fromAddress: sendAddress,
    amount: sellAmountIncludingProtocolFeesCryptoBaseUnit,
    slippage: maximumSlippagePercentage,
    allowPartialFill: false,
    disableEstimate: false,
    ...(maybeTreasuryAddress && {
      referrerAddress: maybeTreasuryAddress,
      fee: buyTokenPercentageFee,
    }),
  }

  const { chainReference } = fromChainId(sellAsset.chainId)
  const maybeSwapResponse = await oneInchService.get<OneInchSwapResponse>(
    `${apiUrl}/${chainReference}/swap`,
    { params },
  )

  if (maybeSwapResponse.isErr()) throw maybeSwapResponse.unwrapErr()
  const { data: swap } = maybeSwapResponse.unwrap()

  return swap
}
