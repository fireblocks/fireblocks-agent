import fs from 'fs';
import { MOBILE_GATEWAY_URL } from './constants';
import fbAgent from './services/fireblocks-agent';
import logger from './services/logger';
import { describeRoute } from './services/proxy';

// Non-interactive pairing, for a one-time job (for example a Kubernetes Job) rather than a person
// at a terminal:
//
//   PAIRING_TOKEN_FILE=/run/secrets/pairing-token DEVICE_DATA_OUTPUT_FILE=/scratch/device-data \
//     node dist/pair.js
//
// Reads the pairing token from a file, pairs with Fireblocks, writes {userId, deviceId,
// refreshToken} as JSON to the output file, and exits. Start the Agent afterwards with that file as
// FB_DEVICE_DATA_FILE. Nothing is written to TOKEN_PATH, and neither the token nor the refresh token
// is logged. A pairing token is valid for one hour after it is issued.
//
// Exit status: 0 paired, 1 pairing failed, 2 a setting or file is wrong (nothing was sent).

export const EXIT_PAIRED = 0;
export const EXIT_PAIRING_FAILED = 1;
export const EXIT_BAD_INPUT = 2;

export async function runPairing(env: Record<string, string | undefined>): Promise<number> {
  const tokenFile = env.PAIRING_TOKEN_FILE?.trim();
  const outputFile = env.DEVICE_DATA_OUTPUT_FILE?.trim();
  if (!tokenFile || !outputFile) {
    logger.error('Pairing mode needs PAIRING_TOKEN_FILE and DEVICE_DATA_OUTPUT_FILE');
    return EXIT_BAD_INPUT;
  }

  let token: string;
  try {
    token = fs.readFileSync(tokenFile, 'utf8').trim();
  } catch (e) {
    logger.error(`PAIRING_TOKEN_FILE could not be read (${tokenFile}): ${e?.code ?? 'error'}`);
    return EXIT_BAD_INPUT;
  }
  if (!fbAgent.isValidPairingToken(token)) {
    logger.error(`PAIRING_TOKEN_FILE (${tokenFile}) does not hold a pairing token in JWT format`);
    return EXIT_BAD_INPUT;
  }

  // Claim the output file before pairing: a token is spent by a successful pairing, so finding out
  // afterwards that the result cannot be written would waste it. 'wx' also refuses to overwrite.
  let fd: number;
  try {
    fd = fs.openSync(outputFile, 'wx', 0o600);
  } catch (e) {
    logger.error(`DEVICE_DATA_OUTPUT_FILE cannot be created (${outputFile}): ${e?.code ?? 'error'}`);
    return EXIT_BAD_INPUT;
  }

  const redact = (text: string) => text.split(token).join('[redacted]');
  let deviceData: Awaited<ReturnType<typeof fbAgent.requestDeviceData>>;
  try {
    logger.info(`Pairing with Fireblocks at ${MOBILE_GATEWAY_URL}, ${describeRoute(MOBILE_GATEWAY_URL)}`);
    deviceData = await fbAgent.requestDeviceData(token);
  } catch (e) {
    fs.closeSync(fd);
    fs.rmSync(outputFile, { force: true });
    logger.error(`Pairing failed: ${redact(String(e?.message ?? e))}`);
    return EXIT_PAIRING_FAILED;
  }
  try {
    fs.writeSync(fd, JSON.stringify(deviceData));
    fs.closeSync(fd);
  } catch (e) {
    fs.closeSync(fd);
    fs.rmSync(outputFile, { force: true });
    // The token is spent: pairing again needs a new one.
    logger.error(
      `Paired (userId ${deviceData.userId}, deviceId ${
        deviceData.deviceId
      }), but the device data could not be written to ${outputFile}: ${
        e?.code ?? 'error'
      }. Issue a new pairing token and pair again.`,
    );
    return EXIT_PAIRING_FAILED;
  }
  logger.info(
    `Paired: userId ${deviceData.userId}, deviceId ${deviceData.deviceId}; device data written to ${outputFile}`,
  );
  return EXIT_PAIRED;
}

if (require.main === module) {
  runPairing(process.env).then((code) => process.exit(code));
}
