# AVAX First-Come-First-Serve Contribution Script

This script automates the process of contributing AVAX to a smart contract as soon as a whitelist period opens. It's designed for first-come-first-serve opportunities where timing is critical.

## Features

- Automatically contributes AVAX to a contract at a specified time
- Polls the contract every few seconds to ensure your transaction gets in as soon as possible
- Configurable AVAX amount, gas price limits, and polling intervals
- Error handling for common issues (not whitelisted yet, insufficient funds, etc.)
- Multi-wallet support for maximum chance of success

## Prerequisites

- Node.js (v14 or higher recommended)
- npm (comes with Node.js)
- An Avalanche wallet with AVAX funds
- The private key for your wallet
- The contract address you want to interact with

## Quick Start (For Non-Technical Users)

### On Mac or Linux
1. Download this repository
2. Open Terminal
3. Navigate to the repository directory
4. Run the setup script:
   ```
   ./setup.sh
   ```
5. Follow the interactive prompts

### On Windows
1. Download this repository
2. Double-click on `setup.bat`
3. Follow the interactive prompts

The setup script will:
- Check if you have Node.js installed
- Install all necessary dependencies
- Help you configure your `.env` file
- Explain the different modes and help you choose the right one
- Start the script in your chosen mode

## Manual Installation

1. Clone this repository:
   ```
   git clone <repository-url>
   cd fcfs
   ```

2. Install dependencies:
   ```
   npm install
   
   ```

3. Set up your configuration:
   ```
   npm run setup
   ```
   This interactive setup will guide you through creating your `.env` file with all necessary settings.

   Alternatively, you can manually create a `.env` file based on the example:
   ```
   cp .env.example .env
   ```
   Then edit the `.env` file with your specific details.

## Usage

### Testing Your Setup

Before running the actual script, you can test your configuration with:

```
npm run test
```

This will:
- Verify your RPC connection to Avalanche
- Check your wallet balance
- Confirm the contract exists
- Validate your time and transaction settings
- Report any issues that need to be fixed

### Basic Script

Run the basic script with:

```
npm run start
```

The script will:
1. Wait until the specified start time (if it's in the future)
2. Begin polling the contract every 5 seconds (or your configured interval)
3. Attempt to contribute the specified AVAX amount
4. Continue trying until successful or until you stop the script

### Advanced Script

For more advanced features, use:

```
npm run advanced
```

The advanced script includes:
- Concurrent transaction sending to increase chances of success
- Dynamic gas price adjustment based on network conditions
- Automatic nonce management for multiple transactions
- Balance checking before attempting transactions
- Graceful shutdown handling

### Immediate Script

If you want to start contributing immediately and poll more frequently (every 1 second), use:

```
npm run immediate
```

This script is ideal when:
- You don't know exactly when the whitelist will open
- You want to manually start the script at the right moment
- You need faster polling (every 1 second) to maximize your chances
- You want to continuously test if you're whitelisted yet

The immediate script will:
1. Start attempting to contribute right away (no waiting for a specific time)
2. Poll every 1 second to maximize your chances
3. Continue indefinitely until successful or until you stop it with Ctrl+C
4. Show real-time statistics about your contribution attempts

### Multiwallet Script

For the absolute maximum chance of success, use the multiwallet script:

```
npm run multiwallet
```

The multiwallet script:
- Uses multiple wallets simultaneously to attempt contributions
- Significantly increases your chances in competitive markets
- Shows detailed statistics for each wallet
- Automatically stops all attempts once any wallet succeeds
- Continues with remaining wallets if one runs out of funds

To use this mode, you'll need to create a `wallets.json` file with your wallet details:

```json
[
  {
    "label": "Main Wallet",
    "privateKey": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  },
  {
    "label": "Secondary Wallet",
    "privateKey": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
  }
]
```

You can create this file:
- Automatically using the setup scripts (`setup.sh` or `setup.bat`)
- By copying and editing the `wallets.json.example` file

## Important Note on Failed Transactions

- If a transaction fails **after being included in a block** (e.g., because you're not whitelisted yet), you will still be charged gas fees.
- If a transaction fails **before being included in a block** (e.g., due to nonce issues or insufficient funds), no gas is consumed.
- The script will detect "not whitelisted" errors and continue retrying without you having to do anything.

## Which Mode Should I Use?

- **Use Basic or Advanced** when you know exactly when the whitelist will open and want to schedule the script to start at that time.
- **Use Immediate** when you don't know exactly when the whitelist will open. This is usually the best option for first-come-first-serve opportunities.
- **Use Multiwallet** for the absolute maximum chance of success, especially in highly competitive launches where milliseconds matter.

## Security Considerations

- **NEVER** share your `.env` file, private keys, or `wallets.json` file
- Run this script on a secure machine
- Consider using dedicated wallets with only the necessary funds for this contribution
- Test with small amounts first to ensure everything works correctly

## Customization

You can adjust the following parameters in the `.env` file:

### Basic Parameters
- `AVAX_AMOUNT`: The amount of AVAX to contribute
- `START_TIME`: When to start attempting contributions
- `POLL_INTERVAL`: How frequently to attempt contributions (in milliseconds)
- `MAX_GAS_PRICE`: Maximum gas price to pay (in nAVAX/Gwei)

### Advanced Parameters
- `GAS_MULTIPLIER`: Multiplier for the base gas price (e.g., 1.2 = 20% higher than base)
- `MAX_ATTEMPTS`: Maximum number of contribution attempts before stopping
- `CONCURRENT_TRANSACTIONS`: Number of transactions to send concurrently
- `PRIORITY_FEE`: Priority fee to add to base fee (in nAVAX/Gwei)

### Multiwallet Parameters
- `WALLETS_FILE`: Path to your wallets.json file (default: `./wallets.json`)

## Troubleshooting

- **"Insufficient funds"**: Ensure your wallet has enough AVAX for the contribution plus gas fees
- **"Not whitelisted"**: The whitelist period may not have started yet, or your address isn't on the whitelist
- **"Nonce too high"**: Your wallet may have pending transactions; wait for them to complete or reset your account nonce
