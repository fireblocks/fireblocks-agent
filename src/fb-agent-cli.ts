import password from '@inquirer/password';
import chalk from 'chalk';
import figlet from 'figlet';
import ora from 'ora';
import { v4 as uuid } from 'uuid';
import { CUSTOMER_SERVER_URL, MOBILE_GATEWAY_URL } from './constants';
import deviceService from './services/device.service';
import fbAgent from './services/fireblocks-agent';
import logger from './services/logger';

async function main() {
  console.clear();
  console.log(chalk.blue(figlet.textSync('FIREBLOCKS', { horizontalLayout: 'full' })));
  console.log(chalk.blue('Welcome to the Fireblocks Agent'));

  while (!deviceService.isPaired()) {
    await pairDevice();
  }

  const { userId, deviceId } = deviceService.getDeviceData();
  console.log(`Fireblocks Agent info:\n\tuserId: ${userId}\n\tdeviceId: ${deviceId}\n\tFireblocks URL: ${MOBILE_GATEWAY_URL}\n\tCustomer server URL: ${CUSTOMER_SERVER_URL}`);
  fbAgent.runAgentMainLoop();
}

const pairDevice = async (): Promise<boolean> => {
  let spinner;
  try {
    const token = await promptPairingToken();
    spinner = ora('Pairing device with Fireblocks').start();
    const deviceId = uuid();
    await fbAgent.pairDevice(token, deviceId);
    spinner.succeed(chalk.green(`Great! your device is now paired!`));
    return true;
  } catch (e) {
    spinner.fail(chalk.red(`Couldn't pair device, got error ${e.message}`));
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

export const start = async () => {
  const spinner = ora('Fireblocks HSM Agent is loading please wait').start();
  const TIME_TO_LET_PM2_START_AND_ATTACH = process.env.NODE_ENV === 'prod' ? 2000 : 0;
  setTimeout(() => {
    spinner.stop();
    main();
  }, TIME_TO_LET_PM2_START_AND_ATTACH);
};
