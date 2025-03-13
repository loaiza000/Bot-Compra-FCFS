require('dotenv').config();
const { ethers } = require('ethers');

// Simple ABI for the contribute function
const ABI = [
    {
        "inputs": [],
        "name": "contribute",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    }
];

// Configuration from environment variables
const config = {
    rpcUrl: process.env.AVALANCHE_RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
    contractAddress: process.env.CONTRACT_ADDRESS,
    avaxAmount: ethers.utils.parseEther(process.env.AVAX_AMOUNT || '0.1'),
    startTime: process.env.START_TIME ? new Date(process.env.START_TIME) : null,
    pollInterval: parseInt(process.env.POLL_INTERVAL || '5000'),
    maxGasPrice: ethers.utils.parseUnits(process.env.MAX_GAS_PRICE || '100', 'gwei'),
    // Advanced options
    gasMultiplier: parseFloat(process.env.GAS_MULTIPLIER || '1.2'),
    maxAttempts: parseInt(process.env.MAX_ATTEMPTS || '0'), // 0 significa intentos ilimitados
    concurrentTransactions: parseInt(process.env.CONCURRENT_TRANSACTIONS || '3'),
    priorityFee: ethers.utils.parseUnits(process.env.PRIORITY_FEE || '2', 'gwei')
};

// Validate configuration
if (!config.privateKey || !config.contractAddress) {
    console.error('Error: PRIVATE_KEY and CONTRACT_ADDRESS must be set in .env file');
    process.exit(1);
}

// Setup provider and wallet
const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
const wallet = new ethers.Wallet(config.privateKey, provider);
const contract = new ethers.Contract(config.contractAddress, ABI, wallet);

// Track nonce to avoid nonce conflicts with concurrent transactions
let currentNonce = null;

// Track pending transactions
const pendingTransactions = new Set();

// Function to get the next nonce
async function getNextNonce() {
    if (currentNonce === null) {
        currentNonce = await wallet.getTransactionCount();
    } else {
        currentNonce++;
    }
    return currentNonce;
}

// Function to send the contribution with optimized gas settings
async function sendContribution(attemptNumber = 1) {
    // Skip if we've reached max concurrent transactions
    if (pendingTransactions.size >= config.concurrentTransactions) {
        console.log(`Maximum concurrent transactions (${config.concurrentTransactions}) reached. Waiting...`);
        return false;
    }

    try {
        console.log(`Attempt #${attemptNumber}: Contributing ${ethers.utils.formatEther(config.avaxAmount)} AVAX...`);

        // Get current gas price and calculate optimized gas price
        const feeData = await provider.getFeeData();
        const baseGasPrice = feeData.gasPrice;

        // For each attempt, increase the gas price slightly to improve chances
        const attemptMultiplier = 1 + (0.1 * (attemptNumber - 1));
        const gasPrice = baseGasPrice.mul(Math.floor(config.gasMultiplier * attemptMultiplier * 100)).div(100);

        // Check if gas price is acceptable
        if (gasPrice.gt(config.maxGasPrice)) {
            console.warn(`Calculated gas price (${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei) exceeds maximum (${ethers.utils.formatUnits(config.maxGasPrice, 'gwei')} gwei). Using max gas price.`);
        }

        // Use the lower of our calculated price or max price
        const finalGasPrice = gasPrice.gt(config.maxGasPrice) ? config.maxGasPrice : gasPrice;

        // Get next nonce
        const nonce = await getNextNonce();

        // Prepare transaction
        const txOptions = {
            value: config.avaxAmount,
            gasLimit: 300000,
            nonce: nonce
        };

        // Usar EIP-1559 si está disponible, sino usar gasPrice tradicional
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            // Transacción EIP-1559
            // Asegurar que maxFeePerGas siempre sea mayor que maxPriorityFeePerGas
            const priorityFee = config.priorityFee;
            const maxFeePerGas = finalGasPrice.lt(priorityFee) ? priorityFee.mul(2) : finalGasPrice;

            txOptions.maxFeePerGas = maxFeePerGas;
            txOptions.maxPriorityFeePerGas = priorityFee;
            console.log(`Sending EIP-1559 transaction with maxFeePerGas: ${ethers.utils.formatUnits(maxFeePerGas, 'gwei')} gwei, maxPriorityFeePerGas: ${ethers.utils.formatUnits(priorityFee, 'gwei')} gwei, nonce: ${nonce}`);
        } else {
            // Transacción legacy
            txOptions.gasPrice = finalGasPrice;
            console.log(`Sending legacy transaction with gas price: ${ethers.utils.formatUnits(finalGasPrice, 'gwei')} gwei, nonce: ${nonce}`);
        }

        // Send transaction
        const tx = await contract.contribute(txOptions);
        console.log(`Transaction sent! Hash: ${tx.hash}`);

        // Add to pending transactions
        pendingTransactions.add(tx.hash);

        // Wait for transaction in background
        tx.wait()
            .then(receipt => {
                console.log(`Transaction ${tx.hash} confirmed in block ${receipt.blockNumber}`);
                console.log(`Gas used: ${receipt.gasUsed.toString()}`);
                pendingTransactions.delete(tx.hash);

                // Si la transacción es exitosa, terminamos el script
                console.log('\n🎉 SUCCESS! Contribution successful! Stopping script.');
                process.exit(0);

                return true;
            })
            .catch(error => {
                console.error(`Transaction ${tx.hash} failed: ${error.message}`);
                pendingTransactions.delete(tx.hash);
                return false;
            });

        return true;
    } catch (error) {
        console.error(`Error sending contribution (attempt #${attemptNumber}): ${error.message}`);

        // Check for specific errors
        if (error.message && (
            error.message.includes('max priority fee per gas higher than max fee per gas') ||
            error.message.includes('maxPriorityFeePerGas cannot exceed maxFeePerGas')
        )) {
            console.warn('Gas price issue detected. Adjusting for next attempt...');
            return false;
        }

        // Check if error is due to not being whitelisted yet
        if (error.message.includes('not whitelisted') ||
            error.message.includes('not open') ||
            error.message.includes('revert')) {
            console.log('Contribution failed - likely not whitelisted yet or sale not open. Will retry...');
            return false;
        }

        // For other errors, we might want to stop
        if (error.message.includes('insufficient funds')) {
            console.error('Insufficient funds in wallet. Check your balance.');
            process.exit(1);
        }

        // If nonce error, reset nonce
        if (error.message.includes('nonce') || error.message.includes('already known')) {
            console.log('Nonce issue detected. Resetting nonce...');
            currentNonce = null;
        }

        return false;
    }
}

// Function to check wallet balance
async function checkBalance() {
    try {
        const balance = await wallet.getBalance();
        console.log(`Wallet balance: ${ethers.utils.formatEther(balance)} AVAX`);

        // Check if we have enough for at least one transaction
        const minRequired = config.avaxAmount.add(
            ethers.utils.parseEther('0.01') // Rough estimate for gas
        );

        if (balance.lt(minRequired)) {
            console.error(`Insufficient balance. You need at least ${ethers.utils.formatEther(minRequired)} AVAX`);
            return false;
        }

        return true;
    } catch (error) {
        console.error(`Error checking balance: ${error.message}`);
        return false;
    }
}

// Main function to start the polling process
async function main() {
    console.log(`Starting AVAX contribution script for contract: ${config.contractAddress}`);
    console.log(`Will contribute ${ethers.utils.formatEther(config.avaxAmount)} AVAX when whitelisted`);

    // Check balance first
    const balanceOk = await checkBalance();
    if (!balanceOk) {
        console.error('Balance check failed. Please add funds to your wallet.');
        process.exit(1);
    }

    const now = new Date();

    if (config.startTime && config.startTime > now) {
        const timeUntilStart = config.startTime - now;
        console.log(`Waiting until start time: ${config.startTime.toISOString()}`);
        console.log(`Time until start: ${Math.floor(timeUntilStart / 60000)} minutes and ${Math.floor((timeUntilStart % 60000) / 1000)} seconds`);

        // Wait until start time
        setTimeout(() => {
            console.log('Start time reached! Beginning contribution attempts...');
            startPolling();
        }, timeUntilStart);
    } else {
        console.log(config.startTime ? 'Start time has already passed.' : 'No specific start time set.');
        console.log('Beginning contribution attempts immediately...');
        startPolling();
    }
}

// Function to start polling the contract
function startPolling() {
    let attemptCount = 0;

    const interval = setInterval(async () => {
        attemptCount++;

        // Verificar si hemos alcanzado el número máximo de intentos configurado
        // Si maxAttempts = 0, significa intentos ilimitados
        if (config.maxAttempts > 0 && attemptCount > config.maxAttempts) {
            console.log(`Reached maximum number of attempts (${config.maxAttempts}). Stopping script.`);
            clearInterval(interval);
            process.exit(0);
        }

        // Try to send a contribution
        const sent = await sendContribution(attemptCount);

        // If we've sent all concurrent transactions, we can slow down polling
        if (pendingTransactions.size >= config.concurrentTransactions) {
            console.log(`All ${config.concurrentTransactions} concurrent transaction slots used. Waiting for confirmations...`);
        }
    }, config.pollInterval);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('Stopping script...');
        clearInterval(interval);
        console.log(`${pendingTransactions.size} transactions still pending. Script will exit when they complete.`);

        // If no pending transactions, exit immediately
        if (pendingTransactions.size === 0) {
            process.exit(0);
        }
    });
}

// Start the script
main().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
});