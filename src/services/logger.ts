import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// Log files go to LOG_DIR (default: the working directory). Set LOG_TO_FILE=false to log
// to the console only, for example in a container with a read-only root filesystem whose logs are
// collected from stdout. Read from the environment directly: the logger can load before the .env
// file, and both are deployment settings rather than .env defaults.
export const logToFile = (raw: string | undefined): boolean =>
  !['false', '0', 'no', 'off'].includes((raw ?? '').trim().toLowerCase());

const transports: winston.transport[] = [];
if (logToFile(process.env.LOG_TO_FILE)) {
  transports.push(
    new DailyRotateFile({
      filename: path.join(process.env.LOG_DIR?.trim() || '.', 'info-%DATE%.log'),
      level: 'info',
      maxSize: '20m',
      maxFiles: '30d',
      format: winston.format.combine(winston.format.json(), winston.format.timestamp()),
    }),
  );
}
transports.push(
  new winston.transports.Console({
    format: winston.format.combine(winston.format.json(), winston.format.timestamp(), winston.format.colorize()),
  }),
);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.json(), winston.format.timestamp()),
  transports,
});

export default logger;
