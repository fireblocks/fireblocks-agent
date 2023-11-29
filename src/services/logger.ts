export default {
  error: (msg: string, e?: Error) => {
    console.error(msg, e);
  },
  log: (msg: string) => {
    console.log(msg);
  },
};
