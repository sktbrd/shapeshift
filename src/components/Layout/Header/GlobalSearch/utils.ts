import { fromAssetId } from '@shapeshiftoss/caip'
import type { AssetsByIdPartial } from '@shapeshiftoss/types'
import type { DefiAction } from 'features/defi/contexts/DefiManagerProvider/DefiCommon'
import type { Location } from 'history'
import qs from 'qs'
import { trackOpportunityEvent } from 'lib/mixpanel/helpers'
import { MixPanelEvent } from 'lib/mixpanel/types'
import type {
  LpEarnOpportunityType,
  OpportunityId,
  StakingEarnOpportunityType,
} from 'state/slices/opportunitiesSlice/types'
import { DefiType } from 'state/slices/opportunitiesSlice/types'

type MakeOpportunityRouteDetailsProps = {
  stakingOpportunities: StakingEarnOpportunityType[]
  lpOpportunities: LpEarnOpportunityType[]
  opportunityId: OpportunityId
  opportunityType: DefiType
  action: DefiAction
  location: Location
  assets: AssetsByIdPartial
}
export const makeOpportunityRouteDetails = ({
  stakingOpportunities,
  lpOpportunities,
  opportunityId,
  action,
  opportunityType,
  location,
  assets,
}: MakeOpportunityRouteDetailsProps) => {
  const lpOpportunity = lpOpportunities.find(lpOpportunity => lpOpportunity.id === opportunityId)
  const stakingOpportunity = stakingOpportunities.find(
    stakingOpportunity => stakingOpportunity.id === opportunityId,
  )
  const opportunity =
    opportunityType === DefiType.LiquidityPool ? lpOpportunity : stakingOpportunity

  if (!opportunity) return null

  const {
    type,
    provider,
    contractAddress,
    chainId,
    rewardAddress,
    assetId,
    highestBalanceAccountAddress,
  } = opportunity
  const { assetReference, assetNamespace } = fromAssetId(assetId)

  trackOpportunityEvent(
    MixPanelEvent.ClickOpportunity,
    {
      opportunity,
      element: 'Search Row',
    },
    assets,
  )

  return {
    pathname: location.pathname,
    search: qs.stringify({
      type,
      provider,
      chainId,
      contractAddress,
      assetNamespace,
      assetReference,
      highestBalanceAccountAddress,
      rewardId: rewardAddress,
      modal: action,
    }),
    state: { background: location },
  }
}
