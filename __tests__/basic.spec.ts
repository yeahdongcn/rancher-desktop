import path from 'path';
import util from 'util';

import Electron from 'electron';
import { Application } from 'spectron';

jest.setTimeout(1_000_000);

const app = new Application({
  path: Electron as any,
  args: [path.join(__dirname, '..')],
  chromeDriverArgs: ['--disable-extensions'],
  env: {
    SPECTRON: true,
    NODE_ENV: 'test',
  },
});

it('opens the window', async () => {
  try {
    await app.start();
    console.log('App started');
    await app.client.waitUntilWindowLoaded();
    console.log('Browser loaded');
    expect(await app.client.getTitle()).toBe('Rancher Desktopp');
  } finally {
    try {
      if (app.isRunning()) {
        await app.stop();
      }
    } catch (error) {
      console.error(error);
      // Don't propagate the error.
    }
  }
});
