import figlet from 'figlet';
import chalk from 'chalk';

async function main() {
  console.clear();
  console.log(
    chalk.blue(figlet.textSync('FIREBLOCKS', { horizontalLayout: 'full' })),
  );
  console.log(chalk.blue('Welcome to the Fireblocks HSM Agent'));
}

async function verifyPairedDevice() {}

export const sum = (x, y) => x + y;

// main();
