# Replicator

The `replicator` enables anyone to sell call options on FX pairs (e.g. USD/EUR).

The smart contract suite is forked from @primitivefinance's open source `rmm-core` repository with modifications to how the the invariant is calculated to ensure robustness for any two arbitrary ERC-20 tokens. 

Each FX pair for which a call option is sold has its own `Engine` contract and follows the standard naming conventions seen in traditional FX markets (`Base/Quote`).

Options underwriters earn on the premium, "theta decay" that is paid by call option buyers. In the context of decentralized finance, these buyers are swappers who swap on the underlying liquidity. To optimize the premium earned by option sellers, a batch auction can be used to match buyers and sellers in a future implementation.

## Setup

`forge install`

## Testing

`forge test -vvv`

## Coverage

`forge coverage --report lcov`

`cmd + shift + p -> Coverage Gutters: Display Coverage`

# Security

All audits are located in the `audits/` folder.

# Deployments

