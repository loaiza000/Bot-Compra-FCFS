require('dotenv').config();
const { ethers } = require('ethers');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

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
    rpcUrl: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
    contractAddress: process.env.CONTRACT_ADDRESS,
    avaxAmount: process.env.AVAX_AMOUNT ? ethers.utils.parseEther(process.env.AVAX_AMOUNT) : ethers.utils.parseEther('0.1'),
    startTime: process.env.START_TIME ? new Date(process.env.START_TIME) : null,
    pollInterval: parseInt(process.env.POLL_INTERVAL || '1000'),
    maxGasPrice: ethers.utils.parseUnits(process.env.MAX_GAS_PRICE || '100', 'gwei'),
    // Advanced options
    gasMultiplier: parseFloat(process.env.GAS_MULTIPLIER || '1.2'),
    priorityFee: ethers.utils.parseUnits(process.env.PRIORITY_FEE || '2', 'gwei'),
    // Modificado para respetar MAX_ATTEMPTS (0 = intentos ilimitados)
    maxAttempts: parseInt(process.env.MAX_ATTEMPTS || '0'),
    concurrentTransactions: parseInt(process.env.CONCURRENT_TRANSACTIONS || '3'),
    // Ruta al archivo de carteras
    walletsFile: process.env.WALLETS_FILE || './wallets.json',
};

// Estadísticas globales
const stats = {
    attempts: 0,
    successfulTxs: 0,
    failedTxs: 0,
    startTime: null,
    walletsActive: 0,
    walletStats: {}
};

// Validate configuration
if (!config.contractAddress) {
    console.error(chalk.red('Error: CONTRACT_ADDRESS debe estar configurado en el archivo .env'));
    process.exit(1);
}

// Cargar información de carteras desde el archivo
function loadWallets() {
    try {
        if (fs.existsSync(config.walletsFile)) {
            const walletsData = JSON.parse(fs.readFileSync(config.walletsFile, 'utf8'));

            // Validar formato
            if (!Array.isArray(walletsData) || walletsData.length === 0) {
                throw new Error('El archivo de carteras debe contener un array de carteras');
            }

            return walletsData;
        } else {
            // Si el archivo no existe, intentamos cargar del .env
            if (!process.env.PRIVATE_KEY) {
                throw new Error('No se encontró el archivo de carteras ni PRIVATE_KEY en .env');
            }

            // Crear una cartera a partir de PRIVATE_KEY
            return [{ privateKey: process.env.PRIVATE_KEY, label: 'Wallet principal' }];
        }
    } catch (error) {
        console.error(chalk.red(`Error al cargar las carteras: ${error.message}`));
        process.exit(1);
    }
}

// Inicializar proveedores con carteras
function initializeWallets(walletsData) {
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const wallets = [];

    for (const walletData of walletsData) {
        try {
            // Verificar y formatear clave privada
            let privateKey = walletData.privateKey;
            if (!privateKey.startsWith('0x')) {
                privateKey = '0x' + privateKey;
            }

            // Crear wallet
            const wallet = new ethers.Wallet(privateKey, provider);
            const contract = new ethers.Contract(config.contractAddress, ABI, wallet);

            wallets.push({
                wallet,
                contract,
                label: walletData.label || `Wallet ${wallets.length + 1}`,
                currentNonce: null,
                pendingTxs: new Set(),
                attempts: 0,
                success: 0,
                failed: 0
            });

            // Inicializar estadísticas
            stats.walletStats[wallet.address] = {
                label: walletData.label || `Wallet ${wallets.length}`,
                attempts: 0,
                success: 0,
                failed: 0,
                balance: '0'
            };
        } catch (error) {
            console.error(chalk.red(`Error al inicializar wallet ${walletData.label || ''}: ${error.message}`));
        }
    }

    if (wallets.length === 0) {
        console.error(chalk.red('No se pudo inicializar ninguna wallet válida. Verifica las claves privadas.'));
        process.exit(1);
    }

    stats.walletsActive = wallets.length;
    console.log(chalk.green(`Se han inicializado ${wallets.length} carteras.`));
    return wallets;
}

// Función para obtener el siguiente nonce para una wallet
async function getNextNonce(walletInfo) {
    if (walletInfo.currentNonce === null) {
        walletInfo.currentNonce = await walletInfo.wallet.getTransactionCount();
    } else {
        walletInfo.currentNonce++;
    }
    return walletInfo.currentNonce;
}

// Función para enviar la contribución
async function sendContribution(walletInfo) {
    // Skip if this wallet has too many pending transactions
    if (walletInfo.pendingTxs.size >= config.concurrentTransactions) {
        return false;
    }

    stats.attempts++;
    walletInfo.attempts++;
    stats.walletStats[walletInfo.wallet.address].attempts++;

    try {
        console.log(chalk.cyan(`[${walletInfo.label}] Intento #${walletInfo.attempts}: Contribuyendo ${ethers.utils.formatEther(config.avaxAmount)} AVAX...`));

        // Get current gas price and calculate optimized gas price
        const feeData = await walletInfo.wallet.provider.getFeeData();
        const baseGasPrice = feeData.gasPrice;

        // Calculate gas price with a slight increase for each attempt
        const attemptMultiplier = 1 + (0.05 * (walletInfo.attempts % 10)); // Aumenta hasta un 50% y luego vuelve a empezar
        const gasPrice = baseGasPrice.mul(Math.floor(config.gasMultiplier * attemptMultiplier * 100)).div(100);

        // Check if gas price is acceptable
        const finalGasPrice = gasPrice.gt(config.maxGasPrice) ? config.maxGasPrice : gasPrice;

        // Get next nonce
        const nonce = await getNextNonce(walletInfo);

        // Prepare transaction with EIP-1559 fields
        const txOptions = {
            value: config.avaxAmount,
            gasLimit: 300000,
            nonce: nonce
        };

        // Usa EIP-1559 si está disponible, de lo contrario usa el gasPrice clásico
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            // EIP-1559 transaction
            // Asegurarse de que maxFeePerGas siempre sea mayor que maxPriorityFeePerGas
            const priorityFee = config.priorityFee;
            const maxFeePerGas = finalGasPrice.lt(priorityFee) ? priorityFee.mul(2) : finalGasPrice;

            txOptions.maxFeePerGas = maxFeePerGas;
            txOptions.maxPriorityFeePerGas = priorityFee;
            console.log(chalk.cyan(`[${walletInfo.label}] Enviando tx EIP-1559 con maxFeePerGas: ${ethers.utils.formatUnits(maxFeePerGas, 'gwei')} gwei, maxPriorityFeePerGas: ${ethers.utils.formatUnits(priorityFee, 'gwei')} gwei, nonce: ${nonce}`));
        } else {
            // Legacy transaction
            txOptions.gasPrice = finalGasPrice;
            console.log(chalk.cyan(`[${walletInfo.label}] Enviando tx legacy con gasPrice: ${ethers.utils.formatUnits(finalGasPrice, 'gwei')} gwei, nonce: ${nonce}`));
        }

        // Send transaction
        const tx = await walletInfo.contract.connect(walletInfo.wallet).contribute(txOptions);
        console.log(chalk.green(`[${walletInfo.label}] ¡Transacción enviada! Hash: ${tx.hash}`));

        // Add to pending transactions
        walletInfo.pendingTxs.add(tx.hash);

        // Wait for transaction in background
        tx.wait()
            .then(receipt => {
                console.log(chalk.green(`[${walletInfo.label}] Transacción ${tx.hash} confirmada en bloque ${receipt.blockNumber}`));
                console.log(chalk.green(`[${walletInfo.label}] Gas usado: ${receipt.gasUsed.toString()}`));
                walletInfo.pendingTxs.delete(tx.hash);

                // Si alguna wallet tiene éxito, salimos del script
                console.log(chalk.bgGreen.black('\n¡ÉXITO! Se ha realizado una contribución exitosa. Deteniendo intentos...\n'));

                // Finalizar script con éxito
                process.exit(0);
            })
            .catch(error => {
                console.error(chalk.red(`[${walletInfo.label}] Transacción ${tx.hash} falló: ${error.message}`));
                walletInfo.pendingTxs.delete(tx.hash);
                stats.failedTxs++;
                walletInfo.failed++;
            });

        stats.successfulTxs++;
        walletInfo.success++;
        return 'success';
    } catch (error) {
        stats.failedTxs++;
        walletInfo.failed++;

        // Detectar errores específicos
        if (error.message && error.message.includes('insufficient funds')) {
            console.error(chalk.red(`[${walletInfo.label}] Error: Fondos insuficientes. Esta wallet será deshabilitada.`));
            return 'insufficient_funds';
        } else if (error.message && (
            error.message.includes('max priority fee per gas higher than max fee per gas') ||
            error.message.includes('maxPriorityFeePerGas cannot exceed maxFeePerGas')
        )) {
            console.error(chalk.yellow(`[${walletInfo.label}] Error con los parámetros de gas. Se ajustará para el próximo intento.`));
            return 'gas_error';
        } else if (error.message && error.message.includes('not whitelisted')) {
            console.error(chalk.yellow(`[${walletInfo.label}] La dirección no está en la whitelist: ${walletInfo.wallet.address}`));
        } else if (error.message && error.message.includes('nonce')) {
            console.error(chalk.yellow(`[${walletInfo.label}] Error de nonce. Se ajustará para el próximo intento.`));
        } else {
            // Mostrar solo los primeros 200 caracteres del error si es muy largo
            const errorMsg = error.message || error.toString();
            const shortError = errorMsg.length > 200 ? errorMsg.substring(0, 200) + '...' : errorMsg;
            console.error(chalk.red(`[${walletInfo.label}] Error enviando contribución: ${shortError}`));
        }
        return 'error';
    }
}

// Función para comprobar el saldo de todas las wallets
async function checkWalletsBalance(wallets) {
    console.log(chalk.cyan('\nVerificando saldos de todas las wallets...'));
    let allBalancesOk = true;

    for (const walletInfo of wallets) {
        try {
            const balance = await walletInfo.wallet.getBalance();
            const balanceInAvax = ethers.utils.formatEther(balance);
            stats.walletStats[walletInfo.wallet.address].balance = balanceInAvax;

            // Check if we have enough for at least one transaction
            const minRequired = config.avaxAmount.add(
                ethers.utils.parseEther('0.01') // Rough estimate for gas
            );

            if (balance.lt(minRequired)) {
                console.error(chalk.red(`[${walletInfo.label}] Saldo insuficiente: ${balanceInAvax} AVAX. Necesitas al menos ${ethers.utils.formatEther(minRequired)} AVAX.`));
                allBalancesOk = false;
            } else {
                console.log(chalk.green(`[${walletInfo.label}] Saldo: ${balanceInAvax} AVAX - OK para enviar transacciones.`));
            }
        } catch (error) {
            console.error(chalk.red(`[${walletInfo.label}] Error al verificar saldo: ${error.message}`));
            allBalancesOk = false;
        }
    }

    return allBalancesOk;
}

// Mostrar estadísticas
function showStats() {
    const elapsedTime = stats.startTime ? Math.floor((Date.now() - stats.startTime) / 1000) : 0;
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;

    console.clear();
    console.log(chalk.cyan('===== ESTADÍSTICAS DE CONTRIBUCIÓN MULTIWALLET =====\n'));
    console.log(chalk.cyan(`Tiempo transcurrido: ${minutes}m ${seconds}s`));
    console.log(chalk.cyan(`Intentos totales: ${stats.attempts}`));
    console.log(chalk.cyan(`Transacciones exitosas: ${stats.successfulTxs}`));
    console.log(chalk.cyan(`Transacciones fallidas: ${stats.failedTxs}`));
    console.log(chalk.cyan(`Wallets activas: ${stats.walletsActive}`));

    // Añadir información sobre MAX_ATTEMPTS
    if (config.maxAttempts > 0) {
        console.log(chalk.cyan(`Configuración de intentos: ${config.maxAttempts} por wallet`));
    } else {
        console.log(chalk.cyan(`Configuración de intentos: ILIMITADOS (MAX_ATTEMPTS=0)`));
    }

    console.log(chalk.cyan('\nEstadísticas por wallet:'));
    for (const [address, walletStat] of Object.entries(stats.walletStats)) {
        const shortAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
        console.log(chalk.cyan(`${walletStat.label} (${shortAddress}):`));
        console.log(chalk.cyan(`  Saldo: ${walletStat.balance} AVAX`));
        console.log(chalk.cyan(`  Intentos: ${walletStat.attempts}`));

        // Mostrar intentos restantes si hay límite
        if (config.maxAttempts > 0) {
            const remaining = Math.max(0, config.maxAttempts - walletStat.attempts);
            console.log(chalk.cyan(`  Intentos restantes: ${remaining}`));
        }

        console.log(chalk.cyan(`  Exitosos: ${walletStat.success}`));
        console.log(chalk.cyan(`  Fallidos: ${walletStat.failed}`));
        console.log();
    }

    console.log(chalk.yellow('Presiona Ctrl+C para detener el script\n'));
}

// Main function to start the polling process
async function main() {
    console.log(chalk.cyan('===== SCRIPT DE CONTRIBUCIÓN MULTIWALLET ====='));
    console.log(chalk.cyan(`Contrato objetivo: ${config.contractAddress}`));
    console.log(chalk.cyan(`Contribución por wallet: ${ethers.utils.formatEther(config.avaxAmount)} AVAX`));
    console.log(chalk.cyan(`Intervalo de polling: ${config.pollInterval}ms`));
    console.log(chalk.cyan(`Transacciones concurrentes por wallet: ${config.concurrentTransactions}`));

    // Añadir información sobre MAX_ATTEMPTS
    if (config.maxAttempts > 0) {
        console.log(chalk.cyan(`Intentos máximos por wallet: ${config.maxAttempts}`));
    } else {
        console.log(chalk.cyan(`Intentos máximos: ILIMITADOS (MAX_ATTEMPTS=0)`));
    }

    // Cargar carteras
    const walletsData = loadWallets();
    console.log(chalk.cyan(`Se han cargado ${walletsData.length} carteras.`));

    // Inicializar carteras
    const wallets = initializeWallets(walletsData);

    // Verificar saldos
    const balancesOk = await checkWalletsBalance(wallets);
    if (!balancesOk) {
        console.warn(chalk.yellow('\nAdvertencia: Algunas wallets tienen saldo insuficiente, pero el script continuará con las que tienen fondos.'));
    }

    stats.startTime = Date.now();

    // Comprobar tiempo de inicio
    const now = new Date();
    if (config.startTime && config.startTime > now) {
        const timeUntilStart = config.startTime - now;
        console.log(chalk.cyan(`\nEsperando hasta la hora de inicio: ${config.startTime.toISOString()}`));
        console.log(chalk.cyan(`Tiempo hasta inicio: ${Math.floor(timeUntilStart / 60000)} minutos y ${Math.floor((timeUntilStart % 60000) / 1000)} segundos`));

        // Esperar hasta la hora de inicio
        setTimeout(() => {
            console.log(chalk.green('\n¡Hora de inicio alcanzada! Comenzando intentos de contribución...'));
            startPolling(wallets);
        }, timeUntilStart);
    } else {
        console.log(chalk.cyan(config.startTime ? '\nLa hora de inicio ya ha pasado.' : '\nNo se ha configurado hora de inicio específica.'));
        console.log(chalk.green('Comenzando intentos de contribución inmediatamente...'));
        startPolling(wallets);
    }
}

// Función para iniciar el polling
function startPolling(wallets) {
    // Set para llevar un registro de wallets deshabilitadas
    const disabledWallets = new Set();

    // Inicializar contador de wallets activas con el total de wallets
    stats.walletsActive = wallets.length;

    // Función para limpiar los intervalos
    function clearIntervals() {
        intervals.forEach(interval => clearInterval(interval));
        if (statsIntervalId) clearInterval(statsIntervalId);
    }

    let statsIntervalId = null;

    // Mostrar estadísticas cada 5 segundos
    statsIntervalId = setInterval(showStats, 5000);

    // Array de intervalos para cada wallet
    const intervals = wallets.map((walletInfo, index) => {
        // Añadir un pequeño retraso entre cada wallet para evitar congestión
        const delay = index * 50;

        return setInterval(async () => {
            // Si la wallet está deshabilitada, no hacer nada
            if (disabledWallets.has(walletInfo.wallet.address)) {
                return;
            }

            // Verificar si se ha alcanzado el número máximo de intentos
            if (config.maxAttempts > 0 && walletInfo.attempts >= config.maxAttempts) {
                console.log(chalk.yellow(`[${walletInfo.label}] Alcanzado el número máximo de intentos (${config.maxAttempts}). Deshabilitando wallet.`));
                disabledWallets.add(walletInfo.wallet.address);
                // Asegurar que walletsActive nunca sea negativo
                stats.walletsActive = Math.max(0, stats.walletsActive - 1);

                // Si todas las wallets están deshabilitadas, detener el script
                if (disabledWallets.size === wallets.length) {
                    console.error(chalk.red('\nTodas las wallets han alcanzado el máximo de intentos. Deteniendo script.'));
                    clearIntervals();
                    process.exit(1);
                }
                return;
            }

            // Enviar contribución
            const result = await sendContribution(walletInfo);

            // Si hay error de fondos insuficientes, deshabilitar esta wallet
            if (result === 'insufficient_funds') {
                disabledWallets.add(walletInfo.wallet.address);
                // Asegurar que walletsActive nunca sea negativo
                stats.walletsActive = Math.max(0, stats.walletsActive - 1);

                // Si todas las wallets están deshabilitadas, detener el script
                if (disabledWallets.size === wallets.length) {
                    console.error(chalk.red('\nTodas las wallets están deshabilitadas. Deteniendo script.'));
                    clearIntervals();
                    process.exit(1);
                }
            }
        }, config.pollInterval + delay);
    });

    // Manejo de cierre controlado
    process.on('SIGINT', () => {
        console.log(chalk.yellow('\nDeteniendo script...'));
        clearIntervals();

        // Mostrar estadísticas finales
        showStats();

        // Verificar si hay transacciones pendientes
        let pendingTxs = 0;
        wallets.forEach(walletInfo => {
            pendingTxs += walletInfo.pendingTxs.size;
        });

        if (pendingTxs > 0) {
            console.log(chalk.yellow(`Aún hay ${pendingTxs} transacciones pendientes. Espera a que se completen o cierra manualmente.`));
        } else {
            process.exit(0);
        }
    });
}

// Start the script
main().catch(error => {
    console.error(chalk.red(`Error fatal: ${error.message}`));
    process.exit(1);
});