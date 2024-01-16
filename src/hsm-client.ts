import password from '@inquirer/password';
import chalk from 'chalk';
import figlet from 'figlet';
import jwt from 'jsonwebtoken';
import ora from 'ora';
import { v4 as uuid } from 'uuid';
import deviceService, { DeviceData } from './services/device.service';
import fbServerApi from './services/fb-server.api';
import hsmAgent from './services/hsm-agent';
import logger from './services/logger';
import messageService from './services/messages.service';

async function main() {
  console.clear();
  console.log(chalk.blue(figlet.textSync('FIREBLOCKS', { horizontalLayout: 'full' })));
  console.log(chalk.blue('Welcome to the Fireblocks HSM Agent'));

  while (!deviceService.isPaired()) {
    await pairDevice();
  }
  runAgentMainLoop();
}

const runAgentMainLoop = async () => {
  const loopFunc = async () => {
    try {
      const start = Date.now();
      logger.info(`Waiting for a message`);
      const messages = await fbServerApi.getMessages();
      logger.info(`Got ${messages.length} messages after ${Date.now() - start}ms`);
      await messageService.handleMessages(messages);
    } catch (e) {
      logger.error(`Error in agent main loop ${e}`);
    }
    setTimeout(loopFunc);
  };
  setTimeout(loopFunc);
};

const pairDevice = async (): Promise<boolean> => {
  let spinner;
  try {
    const token = await promptPairDeviceFlow();
    spinner = ora('Pairing device with Fireblocks').start();
    await hsmAgent.pairDevice(token, uuid());
    spinner.succeed(chalk.green(`Great! your device is now paired!`));
    return true;
  } catch (e) {
    spinner.fail(chalk.red(`Couldn't pair device, got error ${e.message}`));
    logger.error(`Error in pair device ${e}`);
    return false;
  }
};

const promptPairDeviceFlow = async () => {
  const token = await password({
    message: 'Enter pairing token',
    mask: true,
    validate: (pairingToken) => {
      try {
        const { userId } = jwt.decode(pairingToken) as DeviceData;
        return userId.length > 0;
      } catch (e) {
        return 'Please enter a valid pairing token in JWT format.';
      }
    },
  });
  return token;
};

export const start = async () => {
  const spinner = ora('Fireblocks HSM Agent is loading please wait').start();
  const TIME_TO_LET_PM2_START_AND_ATTACH = 200;
  setTimeout(() => {
    spinner.stop();
    main();
  }, TIME_TO_LET_PM2_START_AND_ATTACH);
};
