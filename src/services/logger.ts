import winston from 'winston';
const { format } = require('winston');
import DailyRotateFile from 'winston-daily-rotate-file';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.json(), winston.format.timestamp()),
  transports: [
    new DailyRotateFile({
      filename: 'info-%DATE%.log',
      level: 'info',
      maxSize: '20m',
      maxFiles: '30d',
      format: winston.format.combine(winston.format.json(), winston.format.timestamp()),
    }),
    new winston.transports.Console({
      format: winston.format.combine(winston.format.json(), winston.format.timestamp(), winston.format.colorize()),
    }),
  ],
});

export default logger;
