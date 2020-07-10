import 'core-js/stable'
import 'regenerator-runtime/runtime'
import Aragon, { events } from '@aragon/api'
import ERC20Abi from './abi/ERC20.json'
import TokenManagerAbi from './abi/TokenManager.json'
import { correctFormat } from './utils/number-utils'

const app = new Aragon()

// TODO: check that tokens (miniMe and deposit) have the same decimals

app.store(
  async (state, { event, returnValues }) => {
    const nextState = {
      ...state,
    }

    try {
      switch (event) {
        case events.ACCOUNTS_TRIGGER:
          return handleAccountChange(nextState, returnValues)
        case events.SYNC_STATUS_SYNCING:
          return { ...nextState, isSyncing: true }
        case events.SYNC_STATUS_SYNCED:
          return { ...nextState, isSyncing: false }
        case 'Staked':
          return handleEvent(nextState)
        case 'Unstaked':
          return handleEvent(nextState, returnValues)
        default:
          return state
      }
    } catch (_err) {
      console.log(_err)
    }
  },
  {
    init: initializeState(),
  }
)

function initializeState() {
  return async (cachedState) => {
    try {
      const tokenManagerAddress = await app.call('tokenManager').toPromise()
      const tokenManagerContract = app.external(
        tokenManagerAddress,
        TokenManagerAbi
      )

      const miniMeTokenAddress = await tokenManagerContract.token().toPromise()
      const miniMeToken = await getTokenData(miniMeTokenAddress)

      const depositTokenAddress = await app.call('depositToken').toPromise()
      const depositToken = await getTokenData(depositTokenAddress)

      const minLockTime = parseInt(await app.call('minLockTime').toPromise())

      return {
        ...cachedState,
        miniMeToken,
        depositToken,
        minLockTime,
      }
    } catch (_err) {
      console.log(_err)
    }
  }
}

const handleEvent = async (_nextState, _returnValues) => {
  try {
    const { miniMeTokenBalance, depositTokenBalance } = await getTokenBalances(
      _nextState.miniMeToken.address,
      _nextState.miniMeToken.decimals,
      _nextState.depositToken.address,
      _nextState.depositToken.decimals,
      _nextState.account
    )

    const stakedLocks = await getStakedLocks(_nextState.account)

    return {
      ..._nextState,
      miniMeTokenBalance,
      depositTokenBalance,
      stakedLocks,
    }
  } catch (_err) {
    return _nextState
  }
}

const handleAccountChange = async (_nextState, { account }) => {
  try {
    if (account) {
      const {
        miniMeTokenBalance,
        depositTokenBalance,
      } = await getTokenBalances(
        _nextState.miniMeToken.address,
        _nextState.miniMeToken.decimals,
        _nextState.depositToken.address,
        _nextState.depositToken.decimals,
        account
      )

      const stakedLocks = await getStakedLocks(account)

      return {
        ..._nextState,
        miniMeTokenBalance,
        depositTokenBalance,
        account,
        stakedLocks,
      }
    }

    return _nextState
  } catch (_err) {
    return _nextState
  }
}

const getStakedLocks = async (_tokenAddress) => {
  try {
    const stakedLocks = await app
      .call('getStakedLocks', _tokenAddress)
      .toPromise()
    return stakedLocks.map((_lock) => {
      return {
        amount: parseInt(_lock.amount),
        lockDate: parseInt(_lock.lockDate),
        lockTime: parseInt(_lock.lockTime),
      }
    })
  } catch (_err) {
    return []
  }
}

const getTokenData = async (_tokenAddress) => {
  try {
    const token = app.external(_tokenAddress, ERC20Abi)
    const decimals = await token.decimals().toPromise()
    const name = await token.name().toPromise()
    const symbol = await token.symbol().toPromise()

    return {
      decimals,
      name,
      symbol,
      address: _tokenAddress,
    }
  } catch (err) {
    // TODO find a way to get a fallback
    throw new Error(_err.message)
  }
}

const getTokenBalances = async (
  _miniMeTokenAddress,
  _miniMeTokenDecimals,
  _depositTokenAddress,
  _depositTokenDecimals,
  _account
) => {
  try {
    const miniMeTokenBalance = await getTokenBalance(
      _miniMeTokenAddress,
      _miniMeTokenDecimals,
      _account
    )
    const depositTokenBalance = await getTokenBalance(
      _depositTokenAddress,
      _depositTokenDecimals,
      _account
    )

    return {
      miniMeTokenBalance,
      depositTokenBalance,
    }
  } catch (_err) {
    throw new Error(_err.message)
  }
}

const getTokenBalance = async (_tokenAddress, _tokenDecimals, _address) => {
  try {
    const token = app.external(_tokenAddress, ERC20Abi)
    const balance = await token.balanceOf(_address).toPromise()
    return correctFormat(balance, _tokenDecimals, '/')
  } catch (_err) {
    throw new Error(_err.message)
  }
}
