import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import service from './messages.service';
import serverApi from './server.api';
import { messageBuilder, serverApiDriver } from './server.api.test';

const c = new Chance();
describe('messages service', () => {
  beforeEach(() => {});

  it('should ack message upon receving ', async () => {
    serverApi.ackMessage = jest.fn();
    const aMessage = messageBuilder.aMessage({ msgId: c.guid() });
    const accessToken = serverApiDriver.given.accessToken();

    await service.handleMessage(aMessage, accessToken);

    expect(serverApi.ackMessage).toHaveBeenCalledWith(
      { msgId: aMessage.msgId },
      accessToken,
    );
  });
});

const driver = {
  given: {},
};
