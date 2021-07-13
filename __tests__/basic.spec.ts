import { Application } from 'spectron';

jest.setTimeout(1000000);
const path = require('path');

const app = new Application({
/*   path: path.join(__dirname, '..', '/node_modules/.bin/electron'),
  args: [path.join(__dirname, '..', '/dist/app/background.js')],
  webdriverOptions: {} */
  path: 'C:\\Users\\Admin\\AppData\\Local\\Programs\\Rancher Desktop\\Rancher Desktop.exe'
});

it('opens the window', async () => {
    await app.start().then(function () {
        // Check if the window is visible
        return app.browserWindow.isVisible()
      }).then(function (isVisible) {
        // Verify the window is visible
        expect(isVisible).toBe(true);
      }).then(function () {
        // Get the window's title
        return app.client.getTitle()
      }).then(function (title) {
        // Verify the window's title
        expect(title).toBe('Rancher Desktopp');
      }).then(function () {
        // Stop the application
        return app.stop()
      }).catch(function (error) {
        // Log any failures
        console.error('Test failed', error.message)
    });
});
