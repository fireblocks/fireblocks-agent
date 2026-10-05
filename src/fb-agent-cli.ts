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

export async function main(httpsAgent: https.Agent) {
  console.log(chalk.blue(figlet.textSync('FIREBLOCKS', { horizontalLayout: 'full' })));
  console.log(chalk.blue('Welcome to the Fireblocks Agent'));

  // Unpaired with no terminal to prompt on: @inquirer's prompt never settles without a TTY, so
  // this would hang here forever - the container stays Ready and the agent silently does nothing.
  // Exit instead, so an unpaired deployment restarts visibly rather than looking healthy.
  if (!deviceService.isPaired() && !process.stdin.isTTY) {
    logger.error('Not paired and no interactive terminal available - set FB_DEVICE_DATA. Exiting.');
    process.exit(1);
  }

  while (!deviceService.isPaired()) {
    await pairDevice();
  }

  const { userId, deviceId } = deviceService.getDeviceData();
  console.log(
    `Fireblocks Agent info:\n\tversion: ${AGENT_VERSION}\n\tuserId: ${userId}\n\tdeviceId: ${deviceId}\n\tFireblocks URL: ${MOBILE_GATEWAY_URL}\n\tCustomer server URL: ${CUSTOMER_SERVER_URL}\n\tSSL Cert Path: ${SSL_CERT_PATH}`,
  );
  fbAgent.runAgentMainLoop(httpsAgent);
}

export const pairDevice = async (): Promise<boolean> => {
  // Typed so the compiler enforces the guard below; untyped it infers `any`.
  let spinner: ReturnType<typeof ora> | undefined;
  // Held outside the try so the catch can scrub it from anything it reports.
  let token: string | undefined;
  try {
    token = await promptPairingToken();
    spinner = ora('Pairing device with Fireblocks').start();
    await fbAgent.pairDevice(token);
    spinner.succeed(chalk.green(`Great! your device is now paired!`));
    return true;
  } catch (e) {
    // The token is a bearer credential and this error comes from a call that was given it, so
    // neither the terminal nor the log gets the raw text.
    const redact = (text: string) => (token ? text.split(token).join('[redacted]') : text);
    const message = chalk.red(`Couldn't pair device, got error: "${redact(String(e?.message ?? e))}"`);
    // promptPairingToken() can reject before the spinner exists (Ctrl+C), and
    // an unguarded spinner.fail() would throw a TypeError over the real error. Starting the
    // spinner earlier is not the fix - it would animate over the password prompt.
    if (spinner) {
      spinner.fail(message);
    } else {
      console.log(message);
    }
    logger.error(`Error in pair device ${redact(String(e))}`);
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
