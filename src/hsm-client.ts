import password from '@inquirer/password';
import chalk from 'chalk';
import figlet from 'figlet';
import jwt from 'jsonwebtoken';
// import { oraPromise } from 'ora';
import { v4 as uuid } from 'uuid';
import deviceService from './services/device.service';
import hsmAgent from './services/hsm-agent';

async function main() {
  console.clear();
  console.log(
    chalk.blue(figlet.textSync('FIREBLOCKS', { horizontalLayout: 'full' })),
  );
  console.log(chalk.blue('Welcome to the Fireblocks HSM Agent'));

  if (!deviceService.isPaired()) {
    const token = await promptPairDeviceFlow();

    // await oraPromise(hsmAgent.pairDevice(token, uuid()));
    await hsmAgent.pairDevice(token, uuid());
    console.log(chalk.green(`Great! your device is now paired!`));
  } else {
    console.log('TBD: main loop');
  }
}

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
