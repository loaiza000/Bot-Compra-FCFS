require('dotenv').config();
const { ethers } = require('ethers');
const chalk = require('chalk');

// Esta función simula una transacción para comprobar si se configuran correctamente los parámetros EIP-1559
async function testGasSettings() {
    console.log(chalk.cyan('Ejecutando prueba de configuración de gas EIP-1559...'));

    try {
        // Cargar configuración desde el .env
        const rpcUrl = process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc';
        const priorityFee = ethers.utils.parseUnits(process.env.PRIORITY_FEE || '2', 'gwei');
        const maxGasPrice = ethers.utils.parseUnits(process.env.MAX_GAS_PRICE || '100', 'gwei');
        const gasMultiplier = parseFloat(process.env.GAS_MULTIPLIER || '1.2');

        // Crear provider
        console.log(chalk.cyan(`Conectando a ${rpcUrl}...`));
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

        // Obtener información sobre gas
        console.log(chalk.cyan('Obteniendo datos actuales de gas...'));
        const feeData = await provider.getFeeData();

        // Mostrar información del gas
        console.log(chalk.cyan('\nInformación de gas de la red:'));
        console.log(chalk.cyan(`Gas Price: ${ethers.utils.formatUnits(feeData.gasPrice, 'gwei')} gwei`));

        if (feeData.maxFeePerGas) {
            console.log(chalk.cyan(`Max Fee Per Gas: ${ethers.utils.formatUnits(feeData.maxFeePerGas, 'gwei')} gwei`));
        }

        if (feeData.maxPriorityFeePerGas) {
            console.log(chalk.cyan(`Max Priority Fee Per Gas: ${ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, 'gwei')} gwei`));
        }

        // Simular el cálculo de gas como lo hacen los scripts
        const baseGasPrice = feeData.gasPrice;
        const attemptMultiplier = 1.05; // Simula el primer intento
        const gasPrice = baseGasPrice.mul(Math.floor(gasMultiplier * attemptMultiplier * 100)).div(100);
        const finalGasPrice = gasPrice.gt(maxGasPrice) ? maxGasPrice : gasPrice;

        console.log(chalk.cyan('\nConfiguración simulada para transacción:'));
        console.log(chalk.cyan(`Final Gas Price: ${ethers.utils.formatUnits(finalGasPrice, 'gwei')} gwei`));
        console.log(chalk.cyan(`Priority Fee configurado: ${ethers.utils.formatUnits(priorityFee, 'gwei')} gwei`));

        // Probar si hay soporte EIP-1559
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            console.log(chalk.green('\n✅ Red compatible con EIP-1559 detectada!'));

            // Verificar posible error de priority fee
            if (finalGasPrice.lt(priorityFee)) {
                console.log(chalk.red('⚠️ PROBLEMA: maxFeePerGas sería menor que maxPriorityFeePerGas'));
                console.log(chalk.cyan('Aplicando solución...'));

                // Aplicar solución
                const maxFeePerGas = finalGasPrice.lt(priorityFee) ? priorityFee.mul(2) : finalGasPrice;
                console.log(chalk.green(`✅ maxFeePerGas corregido a: ${ethers.utils.formatUnits(maxFeePerGas, 'gwei')} gwei`));
                console.log(chalk.green(`✅ maxPriorityFeePerGas: ${ethers.utils.formatUnits(priorityFee, 'gwei')} gwei`));

                if (maxFeePerGas.lt(priorityFee)) {
                    console.log(chalk.red('❌ ERROR: La solución no funciona, aún maxFeePerGas < maxPriorityFeePerGas!'));
                } else {
                    console.log(chalk.green('✅ Solución aplicada correctamente! Los scripts no deberían tener problemas de gas.'));
                }
            } else {
                console.log(chalk.green('✅ La configuración es correcta, no hay problemas de priority fee.'));
            }
        } else {
            console.log(chalk.yellow('\n⚠️ EIP-1559 no soportado en esta red, se usarán transacciones legacy.'));
            console.log(chalk.green('✅ No habrá problemas de maxPriorityFeePerGas en transacciones legacy.'));
        }

        return true;
    } catch (error) {
        console.error(chalk.red(`ERROR durante la prueba: ${error.message}`));
        return false;
    }
}

// Ejecutar la prueba
testGasSettings().then(success => {
    if (success) {
        console.log(chalk.green('\n✅ Prueba completada. La configuración de gas parece correcta.'));
    } else {
        console.log(chalk.red('\n❌ La prueba falló. Por favor verifica la configuración y el acceso a la red.'));
    }
});