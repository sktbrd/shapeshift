import { CheckCircleIcon } from '@chakra-ui/icons'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Flex,
  Heading,
  Skeleton,
  Spinner,
  Stack,
} from '@chakra-ui/react'
import { CHAIN_NAMESPACE, fromAccountId, fromChainId } from '@shapeshiftoss/caip'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslate } from 'react-polyglot'
import { useHistory } from 'react-router'
import { AssetIcon } from 'components/AssetIcon'
import { useAccountIds } from 'components/MultiHopTrade/hooks/useAccountIds'
import { checkApprovalNeeded } from 'components/MultiHopTrade/hooks/useAllowanceApproval/helpers'
import { getReceiveAddress } from 'components/MultiHopTrade/hooks/useReceiveAddress'
import { TradeRoutePaths } from 'components/MultiHopTrade/types'
import { SlideTransition } from 'components/SlideTransition'
import { RawText, Text } from 'components/Text'
import type { TextPropTypes } from 'components/Text/Text'
import { getChainAdapterManager } from 'context/PluginProvider/chainAdapterSingleton'
import { useWallet } from 'hooks/useWallet/useWallet'
import { walletSupportsChain } from 'hooks/useWalletSupportsChain/useWalletSupportsChain'
import {
  selectBuyAsset,
  selectManualReceiveAddress,
  selectPortfolioAccountMetadataByAccountId,
  selectSellAsset,
} from 'state/slices/selectors'
import { selectFirstHop } from 'state/slices/tradeQuoteSlice/selectors'
import { useAppSelector } from 'state/store'

import { WithBackButton } from '../WithBackButton'

export const VerifyAddresses = () => {
  const wallet = useWallet().state.wallet
  const history = useHistory()
  const translate = useTranslate()

  const [sellAddress, setSellAddress] = useState<string | undefined>()
  const [buyAddress, setBuyAddress] = useState<string | undefined>()
  const [isSellVerifying, setIsSellVerifying] = useState(false)
  const [isBuyVerifying, setIsBuyVerifying] = useState(false)

  const [verifiedAddresses, setVerifiedAddresses] = useState(new Set<string>())

  const buyAsset = useAppSelector(selectBuyAsset)
  const sellAsset = useAppSelector(selectSellAsset)
  const tradeQuoteStep = useAppSelector(selectFirstHop)

  const { sellAssetAccountId, buyAssetAccountId } = useAccountIds()

  const sellAccountFilter = useMemo(
    () => ({ accountId: sellAssetAccountId ?? '' }),
    [sellAssetAccountId],
  )
  const sellAccountMetadata = useAppSelector(state =>
    selectPortfolioAccountMetadataByAccountId(state, sellAccountFilter),
  )
  const buyAccountFilter = useMemo(
    () => ({ accountId: buyAssetAccountId ?? '' }),
    [buyAssetAccountId],
  )
  const buyAccountMetadata = useAppSelector(state =>
    selectPortfolioAccountMetadataByAccountId(state, buyAccountFilter),
  )

  const shouldVerifyBuyAddress = useMemo(
    () =>
      buyAssetAccountId &&
      buyAccountMetadata &&
      walletSupportsChain({ chainId: buyAsset.chainId, wallet, isSnapInstalled: false }),
    [buyAssetAccountId, buyAccountMetadata, buyAsset.chainId, wallet],
  )

  const isAddressVerified = useCallback(
    (address: string) => verifiedAddresses.has(address.toLowerCase()),
    [verifiedAddresses],
  )
  const sellVerified = useMemo(
    () => isAddressVerified(sellAddress ?? ''),
    [isAddressVerified, sellAddress],
  )
  const buyVerified = useMemo(
    () => isAddressVerified(buyAddress ?? ''),
    [buyAddress, isAddressVerified],
  )

  const handleContinue = useCallback(async () => {
    if (!tradeQuoteStep) throw Error('missing tradeQuoteStep')
    if (!wallet) throw Error('missing wallet')

    const isApprovalNeeded = await checkApprovalNeeded(
      tradeQuoteStep,
      wallet,
      sellAssetAccountId ?? '',
    )
    if (isApprovalNeeded) {
      history.push({ pathname: TradeRoutePaths.Approval })
      return
    }

    history.push({ pathname: TradeRoutePaths.Confirm })
  }, [history, sellAssetAccountId, tradeQuoteStep, wallet])

  const maybeManualReceiveAddress = useAppSelector(selectManualReceiveAddress)
  const fetchAddresses = useCallback(async () => {
    if (!wallet || !sellAssetAccountId || !sellAccountMetadata) return

    const deviceId = await wallet.getDeviceID()

    const fetchedSellAddress = await getReceiveAddress({
      asset: sellAsset,
      wallet,
      deviceId,
      accountMetadata: sellAccountMetadata,
      pubKey: fromAccountId(sellAssetAccountId).account,
    })
    const fetchedOrManualBuyAddress = shouldVerifyBuyAddress
      ? await getReceiveAddress({
          asset: buyAsset,
          wallet,
          deviceId,
          accountMetadata: buyAccountMetadata!,
          pubKey: fromAccountId(buyAssetAccountId!).account,
        })
      : maybeManualReceiveAddress

    setSellAddress(fetchedSellAddress)
    setBuyAddress(fetchedOrManualBuyAddress)
  }, [
    wallet,
    sellAssetAccountId,
    sellAccountMetadata,
    sellAsset,
    shouldVerifyBuyAddress,
    buyAsset,
    buyAccountMetadata,
    buyAssetAccountId,
    maybeManualReceiveAddress,
  ])

  useEffect(() => {
    fetchAddresses()
  }, [fetchAddresses])

  const handleVerify = useCallback(
    async (type: 'sell' | 'buy') => {
      if (type === 'sell') {
        setIsSellVerifying(true)
      } else if (type === 'buy') {
        if (!shouldVerifyBuyAddress) {
          return (
            maybeManualReceiveAddress &&
            setVerifiedAddresses(
              new Set([...verifiedAddresses, maybeManualReceiveAddress.toLowerCase() ?? '']),
            )
          )
        }

        setIsBuyVerifying(true)
      }

      try {
        const asset = type === 'sell' ? sellAsset : buyAsset
        const accountMetadata = type === 'sell' ? sellAccountMetadata : buyAccountMetadata
        const _address = type === 'sell' ? sellAddress : buyAddress

        if (!asset || !accountMetadata || !_address || !wallet) return

        const { chainId } = asset
        const adapter = getChainAdapterManager().get(chainId)

        if (!adapter) return

        const { bip44Params } = accountMetadata

        const { chainNamespace } = fromChainId(asset.chainId)
        if (CHAIN_NAMESPACE.Utxo === chainNamespace && !accountMetadata.accountType) return

        const deviceAddress = await adapter.getAddress({
          wallet,
          showOnDevice: true,
          accountType: accountMetadata.accountType,
          accountNumber: bip44Params.accountNumber,
        })

        if (deviceAddress && deviceAddress.toLowerCase() === _address.toLowerCase()) {
          setVerifiedAddresses(new Set([...verifiedAddresses, _address.toLowerCase()]))
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (type === 'sell') {
          setIsSellVerifying(false)
        } else if (type === 'buy') {
          setIsBuyVerifying(false)
        }
      }
    },
    [
      shouldVerifyBuyAddress,
      maybeManualReceiveAddress,
      verifiedAddresses,
      sellAsset,
      buyAsset,
      sellAccountMetadata,
      buyAccountMetadata,
      sellAddress,
      buyAddress,
      wallet,
    ],
  )

  const handleBuyVerify = useCallback(() => handleVerify('buy'), [handleVerify])
  const handleSellVerify = useCallback(() => handleVerify('sell'), [handleVerify])

  const verifyBuyAssetTranslation: TextPropTypes['translation'] = useMemo(
    () => ['trade.verifyAsset', { asset: buyAsset.symbol }],
    [buyAsset.symbol],
  )

  const verifySellAssetTranslation: TextPropTypes['translation'] = useMemo(
    () => ['trade.verifyAsset', { asset: sellAsset.symbol }],
    [sellAsset.symbol],
  )

  const buyAssetAddressTranslation: TextPropTypes['translation'] = useMemo(
    () => ['trade.assetAddress', { asset: buyAsset.symbol }],
    [buyAsset.symbol],
  )
  const sellAssetAddressTranslation: TextPropTypes['translation'] = useMemo(
    () => ['trade.assetAddress', { asset: sellAsset.symbol }],
    [sellAsset.symbol],
  )

  const renderButton = useMemo(() => {
    if (!buyVerified) {
      return (
        <Button
          size='lg'
          colorScheme='blue'
          onClick={handleBuyVerify}
          isLoading={isBuyVerifying}
          loadingText={translate('walletProvider.ledger.verify.confirmOnDevice')}
        >
          <Text translation={verifyBuyAssetTranslation} />
        </Button>
      )
    }

    if (!sellVerified) {
      return (
        <Button
          size='lg'
          colorScheme='blue'
          onClick={handleSellVerify}
          isLoading={isSellVerifying}
          loadingText={translate('walletProvider.ledger.verify.confirmOnDevice')}
        >
          <Text translation={verifySellAssetTranslation} />
        </Button>
      )
    }
    return (
      <Button
        onClick={handleContinue}
        size='lg'
        colorScheme='blue'
        isDisabled={Boolean(!sellVerified || (shouldVerifyBuyAddress && !buyVerified))}
        width='full'
      >
        <Text translation='common.continue' />
      </Button>
    )
  }, [
    buyVerified,
    handleBuyVerify,
    handleContinue,
    handleSellVerify,
    isBuyVerifying,
    isSellVerifying,
    sellVerified,
    shouldVerifyBuyAddress,
    translate,
    verifyBuyAssetTranslation,
    verifySellAssetTranslation,
  ])

  const handleBack = useCallback(() => {
    history.push(TradeRoutePaths.Input)
  }, [history])

  return (
    <SlideTransition>
      <CardHeader>
        <WithBackButton handleBack={handleBack}>
          <Heading as='h5' textAlign='center'>
            <Text translation='trade.verifyAddresses' />
          </Heading>
        </WithBackButton>
      </CardHeader>

      <CardBody display='flex' flexDir='column' gap={4}>
        <Card overflow='hidden'>
          <CardHeader display='flex' alignItems='center' gap={2}>
            <AssetIcon size='xs' assetId={buyAsset.assetId} />
            <Text translation={buyAssetAddressTranslation} />
          </CardHeader>
          <CardBody bg='background.surface.raised.base'>
            <Stack>
              <Flex alignItems='center' gap={2} justifyContent='space-between'>
                <Flex alignItems='center' gap={2}>
                  <Skeleton isLoaded={!!buyAddress}>
                    <RawText>{buyAddress}</RawText>
                  </Skeleton>
                </Flex>
                {isBuyVerifying && <Spinner boxSize={5} />}
                {buyVerified && <CheckCircleIcon ml='auto' boxSize={5} color='text.success' />}
              </Flex>
            </Stack>
          </CardBody>
        </Card>
        <Card overflow='hidden'>
          <CardHeader display='flex' alignItems='center' gap={2}>
            <AssetIcon size='xs' assetId={sellAsset.assetId} />
            <Text translation={sellAssetAddressTranslation} />
          </CardHeader>
          <CardBody bg='background.surface.raised.base'>
            <Stack>
              <Flex alignItems='center' gap={2} justifyContent='space-between'>
                <Flex alignItems='center' gap={2}>
                  <Skeleton isLoaded={!!sellAddress}>
                    <RawText>{sellAddress}</RawText>
                  </Skeleton>
                </Flex>
                {isSellVerifying && <Spinner boxSize={5} />}
                {sellVerified && <CheckCircleIcon ml='auto' boxSize={5} color='text.success' />}
              </Flex>
            </Stack>
          </CardBody>
        </Card>
      </CardBody>
      <CardFooter flexDir='column' gap={4}>
        <Alert status='warning'>
          <AlertIcon />
          <AlertDescription>
            <Text translation='trade.verifyAddressMessage' />
          </AlertDescription>
        </Alert>
        {renderButton}
      </CardFooter>
    </SlideTransition>
  )
}
