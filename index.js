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
    maxAttempts: parseInt(process.env.MAX_ATTEMPTS || '0'), // 0 = intentos ilimitados
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

// Function to send the contribution
async function sendContribution() {
    try {
        console.log(`Attempting to contribute ${ethers.utils.formatEther(config.avaxAmount)} AVAX...`);

        // Get current gas price and fee data
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice;

        // Check if gas price is acceptable
        if (gasPrice.gt(config.maxGasPrice)) {
            console.warn(`Current gas price (${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei) exceeds maximum (${ethers.utils.formatUnits(config.maxGasPrice, 'gwei')} gwei). Waiting for lower gas price...`);
            return false;
        }

        // Prepare transaction
        const txOptions = {
            value: config.avaxAmount,
            gasLimit: 300000
        };

        // Usar EIP-1559 si está disponible, sino usar gasPrice tradicional
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            // Transacción EIP-1559
            // Asegurar que maxFeePerGas siempre sea mayor que maxPriorityFeePerGas
            const priorityFee = config.priorityFee;
            const maxFeePerGas = gasPrice.lt(priorityFee) ? priorityFee.mul(2) : gasPrice;

            txOptions.maxFeePerGas = maxFeePerGas;
            txOptions.maxPriorityFeePerGas = priorityFee;
            console.log(`Sending EIP-1559 transaction with maxFeePerGas: ${ethers.utils.formatUnits(maxFeePerGas, 'gwei')} gwei, maxPriorityFeePerGas: ${ethers.utils.formatUnits(priorityFee, 'gwei')} gwei`);
        } else {
            // Transacción legacy
            txOptions.gasPrice = gasPrice;
            console.log(`Sending legacy transaction with gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei`);
        }

        const tx = await contract.contribute(txOptions);

        console.log(`Transaction sent! Hash: ${tx.hash}`);

        // Wait for transaction to be mined
        const receipt = await tx.wait();
        console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);
        console.log(`\n🎉 SUCCESS! Contribution successful! Stopping script.`);

        return true;
    } catch (error) {
        console.error(`Error sending contribution: ${error.message}`);

        // Check for specific errors
        if (error.message && (
            error.message.includes('max priority fee per gas higher than max fee per gas') ||
            error.message.includes('maxPriorityFeePerGas cannot exceed maxFeePerGas')
        )) {
            console.warn('Gas price issue detected. Will retry...');
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

        return false;
    }
}

// Main function to start the polling process
async function main() {
    console.log(`Starting AVAX contribution script for contract: ${config.contractAddress}`);
    console.log(`Will contribute ${ethers.utils.formatEther(config.avaxAmount)} AVAX when whitelisted`);

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

        // Verificar si hemos alcanzado el máximo de intentos (si está configurado)
        if (config.maxAttempts > 0 && attemptCount > config.maxAttempts) {
            console.log(`Reached maximum number of attempts (${config.maxAttempts}). Stopping script.`);
            clearInterval(interval);
            process.exit(0);
        }

        const success = await sendContribution();

        if (success) {
            console.log('Contribution successful! Stopping script.');
            clearInterval(interval);
            process.exit(0);
        } else {
            console.log(`Contribution not successful. Retrying in ${config.pollInterval / 1000} seconds...`);
        }
    }, config.pollInterval);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nStopping script...');
        clearInterval(interval);
        process.exit(0);
    });
}

// Start the script
main().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
});