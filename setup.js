const fs = require('fs');
const readline = require('readline');
const { ethers } = require('ethers');

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to prompt for input
function prompt(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

// Function to validate private key
function isValidPrivateKey(key) {
    try {
        if (!key.startsWith('0x')) {
            key = '0x' + key;
        }
        new ethers.Wallet(key);
        return true;
    } catch (error) {
        return false;
    }
}

// Function to validate contract address
function isValidAddress(address) {
    return ethers.utils.isAddress(address);
}

// Function to validate AVAX amount
function isValidAvaxAmount(amount) {
    try {
        ethers.utils.parseEther(amount);
        return true;
    } catch (error) {
        return false;
    }
}

// Function to validate date
function isValidDate(dateString) {
    if (!dateString) return true; // Permitir vacío
    const date = new Date(dateString);
    return !isNaN(date.getTime());
}

// Function to get local timezone info
function getLocalTimezoneInfo() {
    const now = new Date();
    const timeZoneOffset = -now.getTimezoneOffset() / 60;
    const sign = timeZoneOffset >= 0 ? '+' : '-';
    const absOffset = Math.abs(timeZoneOffset);
    const timezone = `UTC${sign}${absOffset}`;
    const isoNow = now.toISOString();
    return { timezone, isoNow };
}

// Main function
async function main() {
    console.log('🚀 AVAX First-Come-First-Serve Contribution Script Setup\n');
    console.log('This script will help you set up your .env file with the necessary configuration.\n');

    // Check if .env already exists
    if (fs.existsSync('.env')) {
        const overwrite = await prompt('An .env file already exists. Do you want to overwrite it? (y/n): ');
        if (overwrite.toLowerCase() !== 'y') {
            console.log('Setup cancelled. Your existing .env file was not modified.');

            // Offer to run tests
            const runTest = await prompt('Would you like to run a test to verify your configuration? (y/n): ');
            if (runTest.toLowerCase() === 'y') {
                console.log('\nRunning test script...');
                require('child_process').execSync('node test.js', {stdio: 'inherit'});
            }

            rl.close();
            return;
        }
    }

    // Collect information
    const config = {};

    // RPC URL
    console.log("Note: The RPC URL determines how you connect to the Avalanche blockchain.");
    console.log("The official public RPC works fine, but for critical transactions where");
    console.log("time is important, consider using a private RPC service like");
    console.log("Infura, Alchemy, or QuickNode for better reliability and speed.");
    config.AVALANCHE_RPC_URL = await prompt('Enter Avalanche RPC URL [https://api.avax.network/ext/bc/C/rpc]: ');
    if (!config.AVALANCHE_RPC_URL) {
        config.AVALANCHE_RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';
    }

    // Private Key
    let privateKey = '';
    while (!privateKey) {
        // Use a different approach to hide the input
        console.log('Enter your wallet private key (input will be hidden): ');
        privateKey = await new Promise((resolve) => {
            const stdin = process.stdin;
            const old = stdin.isRaw;
            stdin.setRawMode(true);
            let input = '';

            const listener = (buffer) => {
                const byte = buffer[0];
                // Enter key
                if (byte === 13) {
                    stdin.removeListener('data', listener);
                    stdin.setRawMode(old);
                    console.log(''); // New line after input
                    resolve(input);
                }
                // Backspace or delete
                else if (byte === 8 || byte === 127) {
                    if (input.length > 0) {
                        input = input.slice(0, -1);
                        process.stdout.write("\b \b"); // Remove last char
                    }
                }
                // Regular character
                else if (byte >= 32 && byte <= 126) {
                    input += buffer.toString();
                    process.stdout.write('*'); // Show * for each character
                }
                // Ctrl+C
                else if (byte === 3) {
                    process.exit(1);
                }
            };

            stdin.on('data', listener);
        });

        if (isValidPrivateKey(privateKey)) {
            if (!privateKey.startsWith('0x')) {
                privateKey = '0x' + privateKey;
            }
        } else {
            console.log('Invalid private key. Please try again.');
            privateKey = '';
        }
    }
    config.PRIVATE_KEY = privateKey;

    // Contract Address
    let contractAddress = '';
    while (!contractAddress) {
        const input = await prompt('Enter the contract address: ');
        if (isValidAddress(input)) {
            contractAddress = input;
        } else {
            console.log('Invalid contract address. Please try again.');
        }
    }
    config.CONTRACT_ADDRESS = contractAddress;

    // AVAX Amount
    let avaxAmount = '';
    while (!avaxAmount) {
        const input = await prompt('Enter the AVAX amount to contribute [0.1]: ');
        if (!input) {
            avaxAmount = '0.1';
        } else if (isValidAvaxAmount(input)) {
            avaxAmount = input;
        } else {
            console.log('Invalid AVAX amount. Please try again.');
        }
    }
    config.AVAX_AMOUNT = avaxAmount;

    // Start Time - mejorado con información de zona horaria
    const { timezone, isoNow } = getLocalTimezoneInfo();
    console.log("\n=== TIMEZONE INFORMATION ===");
    console.log(`Your local timezone appears to be: ${timezone}`);
    console.log(`Current time in ISO format: ${isoNow}`);
    console.log("Tip: ISO format is: YYYY-MM-DDTHH:MM:SSZ (e.g., 2023-06-04T10:00:00Z)");
    console.log("The 'Z' indicates UTC time. If you want to use your local time, omit the 'Z'");
    console.log("and add your timezone offset (e.g., 2023-06-04T10:00:00+03:00)");
    console.log("You can leave this empty if you plan to use the immediate mode.");
    console.log("=== TIMEZONE INFORMATION ===\n");

    const startTime = await prompt('Enter the start time in ISO format (leave empty for immediate mode): ');
    if (isValidDate(startTime)) {
        config.START_TIME = startTime || new Date(Date.now() + 60000).toISOString(); // Default to 1 minute from now if empty
    } else {
        console.log('Invalid date format. Using current time.');
        config.START_TIME = new Date().toISOString();
    }

    // Poll Interval
    const pollInterval = await prompt('Enter the poll interval in milliseconds [5000]: ');
    config.POLL_INTERVAL = pollInterval || '5000';

    // Max Gas Price
    const maxGasPrice = await prompt('Enter the maximum gas price in nAVAX/Gwei [100]: ');
    config.MAX_GAS_PRICE = maxGasPrice || '100';

    // Advanced options
    console.log('\nAdvanced Options (press Enter to use defaults):');

    const gasMultiplier = await prompt('Enter gas price multiplier [1.2]: ');
    config.GAS_MULTIPLIER = gasMultiplier || '1.2';

    const maxAttempts = await prompt('Enter maximum number of attempts (0 for unlimited) [10]: ');
    config.MAX_ATTEMPTS = maxAttempts || '10';

    const concurrentTransactions = await prompt('Enter number of concurrent transactions [3]: ');
    config.CONCURRENT_TRANSACTIONS = concurrentTransactions || '3';

    const priorityFee = await prompt('Enter priority fee in nAVAX/Gwei [2]: ');
    config.PRIORITY_FEE = priorityFee || '2';

    // Generate .env file content
    let envContent = '';
    envContent += '# Avalanche Network Configuration\n';
    envContent += `AVALANCHE_RPC_URL=${config.AVALANCHE_RPC_URL}\n\n`;

    envContent += '# Wallet Configuration\n';
    envContent += `PRIVATE_KEY=${config.PRIVATE_KEY}\n\n`;

    envContent += '# Contract Configuration\n';
    envContent += `CONTRACT_ADDRESS=${config.CONTRACT_ADDRESS}\n\n`;

    envContent += '# Transaction Configuration\n';
    envContent += `AVAX_AMOUNT=${config.AVAX_AMOUNT}  # Amount in AVAX to contribute\n`;
    envContent += `START_TIME=${config.START_TIME}  # ISO format time when the whitelist opens\n`;
    envContent += `POLL_INTERVAL=${config.POLL_INTERVAL}  # Milliseconds between attempts\n`;
    envContent += `MAX_GAS_PRICE=${config.MAX_GAS_PRICE}  # Maximum gas price in nAVAX (Gwei)\n\n`;

    envContent += '# Advanced Options\n';
    envContent += `GAS_MULTIPLIER=${config.GAS_MULTIPLIER}  # Multiplier for the base gas price\n`;
    envContent += `MAX_ATTEMPTS=${config.MAX_ATTEMPTS}  # Maximum number of attempts (0 = unlimited)\n`;
    envContent += `CONCURRENT_TRANSACTIONS=${config.CONCURRENT_TRANSACTIONS}  # Number of transactions to send concurrently\n`;
    envContent += `PRIORITY_FEE=${config.PRIORITY_FEE}  # Priority fee in nAVAX (Gwei) to add to base fee\n`;

    // Write to .env file
    fs.writeFileSync('.env', envContent);

    console.log('\n✅ .env file created successfully!');

    // Offer to run tests
    const runTest = await prompt('\nWould you like to run a test to verify your configuration? (y/n): ');
    if (runTest.toLowerCase() === 'y') {
        console.log('\nRunning test script...');
        require('child_process').execSync('node test.js', {stdio: 'inherit'});
    }

    console.log('\nNext steps:');
    console.log('1. Run "npm run test" to test your configuration');
    console.log('2. Run "npm run start" to start the basic script');
    console.log('3. Run "npm run advanced" to start the advanced script');
    console.log('4. Run "npm run immediate" to start the immediate script');

    rl.close();
}

// Run the script
main().catch(error => {
    console.error(`Error: ${error.message}`);
    rl.close();
    process.exit(1);
});