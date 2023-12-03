/**
 * Pre-start is where we want to place things that must run BEFORE the express
 * server is started. This is useful for environment variables, command-line
 * arguments, and cron-jobs.
 */

// NOTE: DO NOT IMPORT ANY SOURCE CODE HERE
import dotenv from 'dotenv';
import path from 'path';

// Set the env file
const res = dotenv.config({
  path: path.join(__dirname, `../env/${process.env.NODE_ENV}.env`),
});
if (res.error) {
  throw res.error;
}
