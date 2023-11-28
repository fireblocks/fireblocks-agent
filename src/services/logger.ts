export const log = (msg: string) => {
  console.log(msg);
};

export const error = (msg: string, e? : Error) => {
  console.error(msg, e);
};
