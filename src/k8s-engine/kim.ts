import { spawn } from 'child_process';
import { Console } from 'console';
import { EventEmitter } from 'events';
import path from 'path';
import timers from 'timers';

import Logging from '../utils/logging';
import resources from '../resources';

const IMAGE_RETRIEVAL_TIMEOUT = 5 * 1000;
const MAX_PROCESS_RUNTIME = 10 * 1000; // Kill hanging/runaway processes

const console = new Console(Logging.kim.stream);

interface childResultType {
  stdout: string;
  stderr: string;
  code: number;
  signal?: string;
}

interface imageType {
  imageName: string,
  tag: string,
  imageID: string,
  size: string,
}

export default class Kim extends EventEmitter {
  private showedStderr = false;
  private imageRefreshHandle: ReturnType<typeof timers.setTimeout> | undefined;
  // During startup `kim images` repeatedly fires the same error message. Instead,
  // keep track of the current error and give a count instead.
  private lastErrorMessage = '';
  private sameErrorMessageCount = 0;
  private images: imageType[] = [];
  private _isReady = false;
  private _requestToStop = false;

  start() {
    this.stop();
    this.wrapRefreshImages();
  }

  wrapRefreshImages() {
    this.refreshImages().catch((err) => {
      console.log(`Error refreshing images: ${ err }`);
    });
  }

  stop() {
    //TODO: Delete this function?
    console.log(`QQQ: Got a request to stop getting images`);
    this._requestToStop = true;
    if (this.imageRefreshHandle) {
      timers.clearTimeout(this.imageRefreshHandle);
      this.imageRefreshHandle = undefined;
    }
  }

  get isReady() {
    return this._isReady;
  }

  async runCommand(args: string[], sendNotifications = true): Promise<childResultType> {
    console.log(`QQQ: runCommand: run kim ${ args.join(' ')}`);
    const child = spawn(resources.executable('kim'), args);
    const result = { stdout: '', stderr: '' };
    let processReaperHandle: NodeJS.Timeout | null = args[0] === 'images' ? timers.setTimeout(() => {
      processReaperHandle = null;
      console.log(`QQQ: processReaperHandler fired, result of killing child for cmd [${ args.join(' ') }] is: ${ child.kill() }`);
      //      child.kill();
    }, MAX_PROCESS_RUNTIME) : null;

    return await new Promise((resolve, reject) => {
      child.stdout.on('data', (data: Buffer) => {
        const dataString = data.toString();

        if (sendNotifications) {
          this.emit('kim-process-output', dataString, false);
        }
        result.stdout += dataString;
      });
      child.stderr.on('data', (data: Buffer) => {
        const dataString = data.toString();

        result.stderr += dataString;
        if (sendNotifications) {
          this.emit('kim-process-output', dataString, true);
        }
      });
      child.on('exit', (code, signal) => {
        if (processReaperHandle) {
          console.log(`QQQ: command exited : clearing processReaperHandle ${ processReaperHandle[Symbol.toPrimitive]() }`);
          clearTimeout(processReaperHandle);
          processReaperHandle = null;
        } else if (args[0] === 'images') {
          console.log(`QQQ: are we handling an exit after running the process-reaper timeout handler?`);
        }
        if (result.stderr) {
          const timeLessMessage = result.stderr.replace(/\btime=".*?"/g, '');

          if (this.lastErrorMessage !== timeLessMessage) {
            this.lastErrorMessage = timeLessMessage;
            this.sameErrorMessageCount = 1;
            console.log(result.stderr.replace(/(?!<\r)\n/g, '\r\n'));
          } else {
            const m = /(Error: .*)/.exec(this.lastErrorMessage);

            this.sameErrorMessageCount += 1;
            console.log(`kim ${args[0]}: ${m ? m[1] : 'same error message'} #${this.sameErrorMessageCount}\r`);
          }
          if (args[0] === 'images' && !this._requestToStop) {
            console.log(`QQQ: kim scheduling next images check in ${ (IMAGE_RETRIEVAL_TIMEOUT + 500 * this.sameErrorMessageCount) / 1000 } secs`);
            this.imageRefreshHandle = timers.setTimeout(() => {
              this.wrapRefreshImages();
            }, IMAGE_RETRIEVAL_TIMEOUT + 500 * this.sameErrorMessageCount);
          } else {
            console.log(`QQQ: not scheduling another run with stderr: (args[0] === [${ args[0] }] && this._requestToStop = ${ this._requestToStop}`);
          }
        } else {
          console.log(`QQQ: not scheduling another run with no stderr: args[0] === [${ args[0] }]`);
        }
        if (code === 0) {
          resolve({ ...result, code });
        } else if (signal) {
          reject({
            ...result, code: -1, signal
          });
        } else {
          reject({ ...result, code });
        }
      });
    });
  }

  async runRefreshableCommand(args: Array<string>): Promise<childResultType> {
    const resultCode = await this.runCommand(args);

    this.wrapRefreshImages();

    return resultCode;
  }

  async buildImage(dirPart: string, filePart: string, taggedImageName: string): Promise<childResultType> {
    const args = ['build'];

    args.push('--file');
    args.push(path.join(dirPart, filePart));
    args.push('--tag');
    args.push(taggedImageName);
    args.push(dirPart);

    return await this.runRefreshableCommand(args);
  }

  async deleteImage(imageID: string): Promise<childResultType> {
    return await this.runRefreshableCommand(['rmi', imageID]);
  }

  async pullImage(taggedImageName: string): Promise<childResultType> {
    return await this.runRefreshableCommand(['pull', taggedImageName, '--debug']);
  }

  async pushImage(taggedImageName: string): Promise<childResultType> {
    return await this.runRefreshableCommand(['push', taggedImageName, '--debug']);
  }

  async getImages(): Promise<childResultType> {
    return await this.runCommand(['images', '--all'], false);
  }

  parse(data: string): imageType[] {
    const results = data.trimEnd().split(/\r?\n/).slice(1).map((line) => {
      const [imageName, tag, imageID, size] = line.split(/\s+/);

      return {
        imageName, tag, imageID, size
      };
    });

    return results;
  }

  listImages(): imageType[] {
    return this.images;
  }

  async refreshImages() {
    this._requestToStop = false;
    try {
      const result: childResultType = await this.getImages();

      if (result.stderr) {
        if (!this.showedStderr) {
          console.log(`kim images: ${ result.stderr } `);
          this.showedStderr = true;
        }
      } else {
        this.showedStderr = false;
      }
      this.images = this.parse(result.stdout);
      if (!this._isReady) {
        this._isReady = true;
        this.emit('readiness-changed', true);
      }
      this.emit('images-changed', this.images);
    } catch (err) {
      if (!this.showedStderr) {
        if (err.stderr && !err.stdout && !err.signal) {
          console.log(err.stderr);
        } else {
          console.log(err);
        }
      }
      this.showedStderr = true;
      if ('code' in err && this._isReady) {
        this._isReady = false;
        this.emit('readiness-changed', false);
      }
    }
  }
}
