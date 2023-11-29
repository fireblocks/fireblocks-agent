import password from '@inquirer/password';
import chalk from 'chalk';
import figlet from 'figlet';
import jwt from 'jsonwebtoken';
import ora from 'ora';
import { v4 as uuid } from 'uuid';
import deviceService from './services/device.service';
import hsmAgent from './services/hsm-agent';
import logger from './services/logger';
import serverApi from './services/server.api';

async function main() {
  console.clear();
  console.log(
    chalk.blue(figlet.textSync('FIREBLOCKS', { horizontalLayout: 'full' })),
  );
  console.log(chalk.blue('Welcome to the Fireblocks HSM Agent'));

  if (!deviceService.isPaired()) {
    const didPair = await pairDevice();
    if (!didPair) {
      pairDevice();
    }
  }
  runAgentMainLoop();
}

const runAgentMainLoop = async () => {
  const ONE_MIN = 60 * 1000;
  const loopFunc = async () => {
    const accessToken = await serverApi.getAccessToken(
      deviceService.getDeviceData(),
    );

    console.log(`${new Date().toLocaleString()}: Got access token`);
  };
  loopFunc();
  setInterval(loopFunc, ONE_MIN);
};

const pairDevice = async (): Promise<boolean> => {
  try {
    const token = await promptPairDeviceFlow();
    const spinner = ora('Pairing device with Fireblocks').start();
    await hsmAgent.pairDevice(token, uuid());
    spinner.stop();
    console.log(chalk.green(`Great! your device is now paired!`));
    return true;
  } catch (e) {
    logger.error(`Error in pair device`, e);
    return false;
  }
};

const promptPairDeviceFlow = async () => {
  const token = await password({
    message: 'Enter pairing token',
    mask: true,
    validate: (pairingToken) => {
      try {
        const { userId } = jwt.decode(pairingToken);
        return userId.length > 0;
      } catch (e) {
        return false;
      }
    },
  });
  return token;
};

main();
