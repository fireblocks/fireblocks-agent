import password from '@inquirer/password';
import chalk from 'chalk';
import figlet from 'figlet';
import ora from 'ora';
import { v4 as uuid } from 'uuid';
import { CUSTOMER_SERVER_URL, MOBILE_GATEWAY_URL, SSL_CERT_PATH } from './constants';
import deviceService from './services/device.service';
import fbAgent from './services/fireblocks-agent';
import logger from './services/logger';
import https from 'https';
import { AGENT_VERSION } from './version';

async function main(httpsAgent: https.Agent) {
  console.log(chalk.blue(figlet.textSync('FIREBLOCKS', { horizontalLayout: 'full' })));
  console.log(chalk.blue('Welcome to the Fireblocks Agent'));

  while (!deviceService.isPaired()) {
    await pairDevice();
  }

  const { userId, deviceId } = deviceService.getDeviceData();
  console.log(
    `Fireblocks Agent info:\n\tversion: ${AGENT_VERSION}\n\tuserId: ${userId}\n\tdeviceId: ${deviceId}\n\tFireblocks URL: ${MOBILE_GATEWAY_URL}\n\tCustomer server URL: ${CUSTOMER_SERVER_URL}\n\tSSL Cert Path: ${SSL_CERT_PATH}`,
  );
  fbAgent.runAgentMainLoop(httpsAgent);
}

const pairDevice = async (): Promise<boolean> => {
  let spinner;
  try {
    const token = await promptPairingToken();
    spinner = ora('Pairing device with Fireblocks').start();
    await fbAgent.pairDevice(token);
    spinner.succeed(chalk.green(`Great! your device is now paired!`));
    return true;
  } catch (e) {
    spinner.fail(chalk.red(`Couldn't pair device, got error: "${e.message}"`));
    logger.error(`Error in pair device ${e}`);
    return false;
  }
};

const promptPairingToken = async () => {
  const token = await password({
    message: 'Enter pairing token',
    mask: true,
    validate: (pairingToken) => {
      if (!fbAgent.isValidPairingToken(pairingToken)) {
        return 'Please enter a valid pairing token in JWT format.';
      }
      return true;
    },
  });
  return token;
};

export const start = async (httpsAgent: https.Agent) => {
  const spinner = ora('Fireblocks HSM Agent is loading please wait\n').start();
  const TIME_TO_LET_PM2_START_AND_ATTACH = process.env.NODE_ENV === 'prod' ? 2000 : 0;
  setTimeout(() => {
    spinner.stop();
    main(httpsAgent);
  }, TIME_TO_LET_PM2_START_AND_ATTACH);
};
