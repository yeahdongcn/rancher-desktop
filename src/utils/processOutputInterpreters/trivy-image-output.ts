const LineSplitter = /\r?\n/;
const dateHeader = /^[-\d]+T[-:.\d]+Z?\s+\033\[\d+m([A-Z]+)\033\[\d+m\s+(.*)$/;
const borderPattern = /^\+(?:-+\+){6}\s*$/;
const internalBorderPattern = /^\+(?:(?:-+|\s+)\+){6}\s*$/;
const rowPattern = /^(?:\|[^|]+){6}\|\s*$/;

const CVEKeys = ['Package', 'VulnerabilityID', 'Severity', 'Title', 'InstalledVersion', 'FixedVersion', 'Description', 'PrimaryURL'];
const severityRatings: Record<string, number> = {
  LOW:      1,
  MEDIUM:   2,
  HIGH:     3,
  CRITICAL: 4
};

type finalVulType = Record<string, string>;

export default class TrivyScanImageOutputCuller {
  prelimLines: Array<string>;
  JSONLines: Array<string>;
  inJSON = false;

  constructor() {
    this.prelimLines = [];
    this.JSONLines = [];
  }

  fixLines(lines: Array<string>) {
    // "key": "value with an escaped \' single quote isn't valid json"
    return lines.map(line => line.replace(/\\'/g, "'"));
  }

  addData(data: string): void {
    if (this.inJSON) {
      this.JSONLines.push(data.replace(/\\'/g, "'"));

      return;
    }
    const lines = data.split(LineSplitter);
    const jsonStartIndex = lines.indexOf('[');

    if (jsonStartIndex >= 0) {
      this.prelimLines = this.prelimLines.concat(lines.slice(0, jsonStartIndex));
      this.inJSON = true;
      this.JSONLines = this.fixLines(lines.slice(jsonStartIndex));
    } else {
      this.prelimLines = this.prelimLines.concat(lines);
    }
  }

  getProcessedData() {
    const prelimLines = this.prelimLines.map(line => line.replace(dateHeader, '$1 $2'));

    if (!this.inJSON) {
      // No JSON, just so return the lines we have
      return prelimLines.join('\n');
    }
    let core;

    try {
      core = JSON.parse(this.JSONLines.join(''));
    } catch (e) {
      console.log(`Error json parsing ${ this.JSONLines.join('') }`);

      return prelimLines.join('\n');
    }
    const detailLines: Array<string> = [];

    core.forEach((targetWithVuls: { [x: string]: any; }) => {
      const target = targetWithVuls['Target'];
      const sourceVulnerabilities = targetWithVuls['Vulnerabilities'];

      if (!sourceVulnerabilities.length) {
        return;
      }
      detailLines.push(`Target: ${ target }`, '');

      const processedVulnerabilities: Array<finalVulType> = sourceVulnerabilities.map((v: any) => {
        const record: finalVulType = {};

        CVEKeys.forEach((key) => {
          if (v[key]) {
            record[key] = v[key];
          }
        });

        return record;
      });

      processedVulnerabilities.sort();
      processedVulnerabilities.sort((a, b) => {
        return severityRatings[b['Severity']] - severityRatings[a['Severity']];
      });

      processedVulnerabilities.forEach((vul) => {
        CVEKeys.forEach((key) => {
          if (key in vul) {
            detailLines.push(`${ key }: ${ vul[key] }`);
          }
        });
        detailLines.push('');
      });
    });

    return prelimLines.concat(detailLines).join('\n');
  }
}
