let uri: string = '';
export const getMongoUri = async () => {
  if (uri) {
    return uri;
  }
  uri = `mongodb://customer-database:27017`;
  return uri;
};
