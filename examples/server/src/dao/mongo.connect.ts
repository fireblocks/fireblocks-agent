import { MongoMemoryServer } from 'mongodb-memory-server';

let uri: string = '';
export const getMongoUri = async () => {
  if (uri) {
    return uri;
  }
  // This will create an new instance of "MongoMemoryServer" and automatically start it
  const mongod = await MongoMemoryServer.create();
  uri = mongod.getUri();
  return uri;
};

