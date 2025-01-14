import React, { useCallback, useMemo, useState } from 'react'
import { isMobile } from 'react-device-detect'
import { useSelector } from 'react-redux'
import type { RouteComponentProps } from 'react-router-dom'
import type { ActionTypes } from 'context/WalletProvider/actions'
import { WalletActions } from 'context/WalletProvider/actions'
import { KeyManager } from 'context/WalletProvider/KeyManager'
import { useLocalWallet } from 'context/WalletProvider/local-wallet'
import { useFeatureFlag } from 'hooks/useFeatureFlag/useFeatureFlag'
import {
  checkIsMetaMask,
  checkisMetaMaskMobileWebView,
  checkIsSnapInstalled,
} from 'hooks/useIsSnapInstalled/useIsSnapInstalled'
import { useWallet } from 'hooks/useWallet/useWallet'
import { getEthersProvider } from 'lib/ethersProviderSingleton'
import { selectShowSnapsModal } from 'state/slices/selectors'

import { ConnectModal } from '../../components/ConnectModal'
import { RedirectModal } from '../../components/RedirectModal'
import type { LocationState } from '../../NativeWallet/types'
import { MetaMaskConfig } from '../config'

export interface MetaMaskSetupProps
  extends RouteComponentProps<
    {},
    any, // history
    LocationState
  > {
  dispatch: React.Dispatch<ActionTypes>
}

export const MetaMaskConnect = ({ history }: MetaMaskSetupProps) => {
  const { dispatch, getAdapter, onProviderChange } = useWallet()
  const localWallet = useLocalWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const showSnapModal = useSelector(selectShowSnapsModal)

  const setErrorLoading = useCallback((e: string | null) => {
    setError(e)
    setLoading(false)
  }, [])

  const isSnapsEnabled = useFeatureFlag('Snaps')
  const isMetaMaskMobileWebView = useMemo(() => checkisMetaMaskMobileWebView(), [])

  const pairDevice = useCallback(async () => {
    setError(null)
    setLoading(true)

    const adapter = await getAdapter(KeyManager.MetaMask)
    if (adapter) {
      const ethersProvider = getEthersProvider()
      ethersProvider.removeAllListeners('accountsChanged')
      ethersProvider.removeAllListeners('chainChanged')

      const wallet = await adapter.pairDevice()
      if (!wallet) {
        setErrorLoading('walletProvider.errors.walletNotFound')
        throw new Error('Call to hdwallet-metamask::pairDevice returned null or undefined')
      }

      const { name, icon } = MetaMaskConfig
      try {
        const deviceId = await wallet.getDeviceID()

        const isLocked = await wallet.isLocked()

        await wallet.initialize()

        dispatch({
          type: WalletActions.SET_WALLET,
          payload: { wallet, name, icon, deviceId, connectedType: KeyManager.MetaMask },
        })
        dispatch({ type: WalletActions.SET_IS_CONNECTED, payload: true })
        dispatch({ type: WalletActions.SET_IS_LOCKED, payload: isLocked })
        localWallet.setLocalWalletTypeAndDeviceId(KeyManager.MetaMask, deviceId)

        const provider = await onProviderChange(KeyManager.MetaMask, wallet)

        if (!provider) {
          throw new Error('walletProvider.metaMask.errors.connectFailure')
        }

        await (async () => {
          const isMetaMask = await checkIsMetaMask(wallet)
          if (!isMetaMask) return dispatch({ type: WalletActions.SET_WALLET_MODAL, payload: false })
          const isSnapInstalled = await checkIsSnapInstalled()

          // We don't want to show the snaps modal on MM mobile browser, as snaps aren't supported on mobile
          if (isSnapsEnabled && !isMetaMaskMobileWebView && !isSnapInstalled && showSnapModal) {
            return history.push('/metamask/snap/install')
          }

          return dispatch({ type: WalletActions.SET_WALLET_MODAL, payload: false })
        })()
      } catch (e: any) {
        if (e?.message?.startsWith('walletProvider.')) {
          console.error(e)
          setErrorLoading(e?.message)
        } else {
          setErrorLoading('walletProvider.metaMask.errors.unknown')
          history.push('/metamask/failure')
        }
      }
    }
    setLoading(false)
  }, [
    getAdapter,
    setErrorLoading,
    dispatch,
    localWallet,
    onProviderChange,
    isMetaMaskMobileWebView,
    isSnapsEnabled,
    showSnapModal,
    history,
  ])

  const handleRedirect = useCallback((): void => {
    // This constructs the MetaMask deep-linking target from the currently-loaded
    // window.location. The port will be blank if not specified, in which case it
    // should be omitted.
    const mmDeeplinkTarget = [window.location.hostname, window.location.port]
      .filter(x => !!x)
      .join(':')

    return window.location.assign(`metamask://dapp//${mmDeeplinkTarget}`)
  }, [])

  return isMobile && !isMetaMaskMobileWebView ? (
    <RedirectModal
      headerText={'walletProvider.metaMask.redirect.header'}
      bodyText={'walletProvider.metaMask.redirect.body'}
      buttonText={'walletProvider.metaMask.redirect.button'}
      onClickAction={handleRedirect}
      loading={loading}
      error={error}
    />
  ) : (
    <ConnectModal
      headerText={'walletProvider.metaMask.connect.header'}
      bodyText={'walletProvider.metaMask.connect.body'}
      buttonText={'walletProvider.metaMask.connect.button'}
      onPairDeviceClick={pairDevice}
      loading={loading}
      error={error}
    />
  )
}
