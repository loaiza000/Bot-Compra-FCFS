require('dotenv').config();
const { ethers } = require('ethers');
const chalk = require('chalk');

// Constantes
const AVALANCHE_MAINNET_RPC = 'https://api.avax.network/ext/bc/C/rpc';

async function testConfiguration() {
  console.log(chalk.cyan('\n===== TEST DE CONFIGURACIÓN ====='));

  // Verificar variables de entorno
  console.log(chalk.yellow('\n1. Verificando variables de entorno:'));

  const requiredEnvVars = [
    'PRIVATE_KEY',
    'CONTRACT_ADDRESS',
    'AVAX_AMOUNT',
    'MAX_GAS_PRICE'
  ];

  let hasErrors = false;

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.log(chalk.red(`❌ ERROR: ${envVar} no está configurado en el archivo .env`));
      hasErrors = true;
    } else {
      console.log(chalk.green(`✅ ${envVar}: Configurado correctamente`));
    }
  }

  // Verificar valor opcional
  if (!process.env.START_TIME) {
    console.log(chalk.yellow(`ℹ️ START_TIME: No configurado (se usará ejecución inmediata)`));
  } else {
    const startTime = new Date(process.env.START_TIME);
    const now = new Date();
    if (isNaN(startTime.getTime())) {
      console.log(chalk.red(`❌ ERROR: START_TIME tiene un formato inválido. Usa ISO 8601 (ejemplo: 2023-12-31T23:59:59)`));
      hasErrors = true;
    } else if (startTime < now) {
      console.log(chalk.yellow(`⚠️ START_TIME: ${startTime.toISOString()} (ADVERTENCIA: Esta fecha ya ha pasado)`));
    } else {
      const diffMs = startTime - now;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMins / 60);
      const remainingMins = diffMins % 60;

      console.log(chalk.green(`✅ START_TIME: ${startTime.toISOString()} (${diffHrs}h ${remainingMins}m en el futuro)`));
    }
  }

  // Verificar RPC URL
  console.log(chalk.yellow('\n2. Verificando conexión a la red Avalanche:'));

  const rpcUrl = process.env.AVALANCHE_RPC_URL || AVALANCHE_MAINNET_RPC;
  console.log(`   Usando RPC: ${rpcUrl}`);

  try {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    console.log(chalk.green(`✅ Conexión exitosa a la red: ${network.name} (chainId: ${network.chainId})`));

    // Verificar si estamos en la red correcta (Avalanche C-Chain tiene chainId 43114)
    if (network.chainId !== 43114) {
      console.log(chalk.yellow(`⚠️ ADVERTENCIA: No estás conectado a Avalanche C-Chain (esperado: 43114, actual: ${network.chainId})`));
    }

    // Verificar saldo
    if (process.env.PRIVATE_KEY) {
      const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
      const balance = await provider.getBalance(wallet.address);
      const balanceInAvax = ethers.utils.formatEther(balance);

      console.log(chalk.yellow('\n3. Verificando información de la wallet:'));
      console.log(`   Dirección: ${wallet.address}`);
      console.log(`   Saldo: ${balanceInAvax} AVAX`);

      if (balance.eq(0)) {
        console.log(chalk.red(`❌ ERROR: Tu wallet no tiene saldo de AVAX para pagar el gas`));
        hasErrors = true;
      } else if (ethers.utils.parseEther(balanceInAvax).lt(ethers.utils.parseEther('0.1'))) {
        console.log(chalk.yellow(`⚠️ ADVERTENCIA: Saldo bajo de AVAX (< 0.1 AVAX), podrías necesitar más para gas`));
      } else {
        console.log(chalk.green(`✅ Saldo suficiente para transacciones`));
      }

      // Verificar importe de contribución
      if (process.env.AVAX_AMOUNT) {
        const contributionAmount = ethers.utils.parseEther(process.env.AVAX_AMOUNT);
        if (contributionAmount.gt(balance)) {
          console.log(chalk.red(`❌ ERROR: Tu saldo (${balanceInAvax} AVAX) es menor que el importe de contribución (${process.env.AVAX_AMOUNT} AVAX)`));
          hasErrors = true;
        } else {
          console.log(chalk.green(`✅ Importe de contribución válido: ${process.env.AVAX_AMOUNT} AVAX`));
        }
      }
    }

    // Verificar contrato
    if (process.env.CONTRACT_ADDRESS) {
      console.log(chalk.yellow('\n4. Verificando contrato:'));
      try {
        const code = await provider.getCode(process.env.CONTRACT_ADDRESS);
        if (code === '0x') {
          console.log(chalk.red(`❌ ERROR: No se encontró código en la dirección del contrato. Verifica la dirección.`));
          hasErrors = true;
        } else {
          console.log(chalk.green(`✅ Contrato encontrado en la dirección proporcionada`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ ERROR: No se pudo verificar el contrato: ${error.message}`));
        hasErrors = true;
      }
    }

  } catch (error) {
    console.log(chalk.red(`❌ ERROR: No se pudo conectar a la red Avalanche: ${error.message}`));
    hasErrors = true;
  }

  // Información sobre zona horaria
  console.log(chalk.yellow('\n5. Información de zona horaria:'));
  const now = new Date();
  console.log(`   Hora actual del sistema: ${now.toISOString()}`);
  console.log(`   Zona horaria local: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  console.log(`   Offset UTC: UTC${now.getTimezoneOffset() <= 0 ? '+' : '-'}${Math.abs(now.getTimezoneOffset()/60)}`);

  // Resultado final
  console.log(chalk.cyan('\n===== RESULTADO DE LA PRUEBA ====='));
  if (hasErrors) {
    console.log(chalk.red('❌ Se encontraron errores en tu configuración. Por favor, corrige los problemas señalados arriba.'));
  } else {
    console.log(chalk.green('✅ ¡Configuración válida! Tu script está listo para ejecutarse.'));
  }

  console.log(chalk.cyan('\n===== PRÓXIMOS PASOS ====='));
  console.log('Para ejecutar el script, elige uno de los siguientes comandos:');
  console.log(chalk.yellow('• Modo Básico:     ') + 'npm run start');
  console.log(chalk.yellow('• Modo Avanzado:   ') + 'npm run advanced');
  console.log(chalk.yellow('• Modo Inmediato:  ') + 'npm run immediate');
  console.log();
}

// Ejecutar prueba
testConfiguration().catch(console.error);