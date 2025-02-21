<router lang="yaml">
  name: Kubernetes Settings
</router>
<template>
  <Notifications :notifications="notificationsList">
    <div class="labeled-input">
      <label>Kubernetes version</label>
      <select class="select-k8s-version" :value="settings.kubernetes.version" @change="onChange($event)">
        <option v-for="item in versions" :key="item" :value="item" :selected="item === settings.kubernetes.version">
          {{ item }}
        </option>
      </select>
    </div>
    <system-preferences
      v-if="hasSystemPreferences"
      :memory-in-g-b="settings.kubernetes.memoryInGB"
      :number-c-p-us="settings.kubernetes.numberCPUs"
      :avail-memory-in-g-b="availMemoryInGB"
      :avail-num-c-p-us="availNumCPUs"
      :reserved-memory-in-g-b="6"
      :reserved-num-c-p-us="1"
      @updateMemory="handleUpdateMemory"
      @updateCPU="handleUpdateCPU"
      @warning="handleWarning"
    />
    <div id="portWrapper" class="labeled-input">
      <LabeledInput :value="settings.kubernetes.port" label="Port" type="number" @input="handleUpdatePort" />
    </div>

    <label>
      <button :disabled="cannotReset" class="btn role-secondary" @click="reset">
        Reset Kubernetes
      </button>
      Resetting Kubernetes to default will delete all workloads and configuration
    </label>
    <Card v-if="hasToolsSymlinks" :show-highlight-border="false" :show-actions="false">
      <template #title>
        <div class="type-title">
          <h3>Supporting Utilities</h3>
        </div>
      </template>
      <template #body>
        <Checkbox
          label="Link to /usr/local/bin/kubectl"
          :description="symlinkBlockers['kubectl']"
          :disabled="symlinks.kubectl === null"
          :value="symlinks.kubectl"
          class="mb-10"
          @input="value => handleCheckbox(value, 'kubectl')"
        />
        <Checkbox
          label="Link to /usr/local/bin/helm"
          :description="symlinkBlockers['helm']"
          :disabled="symlinks.helm === null"
          :value="symlinks.helm"
          class="mb-10"
          @input="value => handleCheckbox(value, 'helm')"
        />
        <Checkbox
          label="Link to /usr/local/bin/kim"
          :description="symlinkBlockers['kim']"
          :disabled="symlinks.kim === null"
          :value="symlinks.kim"
          class="mb-10"
          @input="value => handleCheckbox(value, 'kim')"
        />
      </template>
    </Card>
  </Notifications>
</template>

<script>
import Card from '@/components/Card.vue';
import Checkbox from '@/components/form/Checkbox.vue';
import LabeledInput from '@/components/form/LabeledInput.vue';
import Notifications from '@/components/Notifications.vue';
import SystemPreferences from '@/components/SystemPreferences.vue';
const os = require('os');

const { ipcRenderer } = require('electron');
const semver = require('semver');
const K8s = require('../k8s-engine/k8s');

/** @typedef { import("../config/settings").Settings } Settings */

const NotificationLevels = ['error', 'warning', 'info', 'success'];

export default {
  name:       'K8s',
  title:      'Kubernetes Settings',
  components: {
    Card,
    Checkbox,
    LabeledInput,
    Notifications,
    SystemPreferences
  },
  data() {
    return {
      /** @type {{ key: string, message: string, level: string }} */
      notifications: { },
      state:         ipcRenderer.sendSync('k8s-state'),
      currentPort:   0,
      /** @type Settings */
      settings:      ipcRenderer.sendSync('settings-read'),
      /** @type {string[]} */
      versions:      [],
      symlinks:      {
        helm:    null,
        kim:     null,
        kubectl: null,
      },
      symlinkBlockers: {
        helm:    '',
        kim:     '',
        kubectl: '',
      },
      progress: {
        current: 0,
        max:     0,
      }
    };
  },

  computed: {
    hasSystemPreferences() {
      return !os.platform().startsWith('win');
    },
    hasToolsSymlinks() {
      return os.platform() === 'darwin';
    },
    availMemoryInGB() {
      return os.totalmem() / 2 ** 30;
    },
    availNumCPUs() {
      return os.cpus().length;
    },
    cannotReset() {
      return ![K8s.State.STARTED, K8s.State.ERROR].includes(this.state);
    },
    notificationsList() {
      return Object.keys(this.notifications).map(key => ({
        key,
        message: this.notifications[key].message,
        color:   this.notifications[key].level,
      })).sort((left, right) => {
        return NotificationLevels.indexOf(left.color) - NotificationLevels.indexOf(right.color);
      });
    },
  },

  created() {
    if (this.hasSystemPreferences) {
      // We don't configure WSL metrics, so don't bother making these checks on Windows.
      if (this.settings.kubernetes.memoryInGB > this.availMemoryInGB) {
        alert(`Reducing memory size from ${ this.settings.kubernetes.memoryInGB } to ${ this.availMemoryInGB }`);
        this.settings.kubernetes.memoryInGB = this.availMemoryInGB;
      }
      if (this.settings.kubernetes.numberCPUs > this.availNumCPUs) {
        alert(`Reducing # of CPUs from ${ this.settings.kubernetes.numberCPUs } to ${ this.availNumCPUs }`);
        this.settings.kubernetes.numberCPUs = this.availNumCPUs;
      }
    }
  },

  mounted() {
    const that = this;

    ipcRenderer.on('k8s-check-state', (event, stt) => {
      that.$data.state = stt;
    });
    ipcRenderer.on('k8s-current-port', (event, port) => {
      this.currentPort = port;
    });
    ipcRenderer.on('k8s-restart-required', (event, required) => {
      console.log(`restart-required-all`, required);
      for (const key in required) {
        console.log(`restart-required`, key, required[key]);
        if (required[key].length > 0) {
          const message = `The cluster must be reset for ${ key } change from ${ required[key][0] } to ${ required[key][1] }.`;

          this.handleNotification('info', `restart-${ key }`, message);
        } else {
          this.handleNotification('info', `restart-${ key }`, '');
        }
      }
    });
    ipcRenderer.on('k8s-versions', (event, versions) => {
      this.$data.versions = versions;
    });
    ipcRenderer.on('settings-update', (event, settings) => {
      // TODO: put in a status bar
      console.log('settings have been updated');
      this.$data.settings = settings;
    });
    ipcRenderer.on('install-state', (event, name, state, blocker) => {
      console.log(`install state changed for ${ name }: ${ state }`);
      this.$data.symlinks[name] = state;
      this.$data.symlinkBlockers[name] = blocker;
    });
    ipcRenderer.send('k8s-restart-required');
    ipcRenderer.send('k8s-versions');
    ipcRenderer.send('install-state', 'helm');
    ipcRenderer.send('install-state', 'kim');
    ipcRenderer.send('install-state', 'kubectl');
  },

  methods: {
    // Reset a Kubernetes cluster to default at the same version
    reset() {
      if (confirm('Resetting Kubernetes will delete all workloads. Do you want to proceed?')) {
        const oldState = this.state;

        this.state = K8s.State.STOPPING;
        if (oldState === K8s.State.STARTED) {
          ipcRenderer.send('k8s-reset', 'fast');
        } else {
          ipcRenderer.send('k8s-reset', 'slow');
        }
      }
    },
    restart() {
      this.state = K8s.State.STOPPING;
      ipcRenderer.send('k8s-restart', 'Restart Kubernetes');
    },
    onChange(event) {
      if (event.target.value !== this.settings.kubernetes.version) {
        let confirmationMessage = '';

        if (this.settings.kubernetes.port !== this.currentPort) {
          confirmationMessage = `Changing versions will require a full reset of Kubernetes (loss of workloads) because the desired port has also changed (from ${ this.currentPort } to ${ this.settings.kubernetes.port })`;
        } else if (semver.lt(event.target.value, this.settings.kubernetes.version)) {
          confirmationMessage = `Changing from version ${ this.settings.kubernetes.version } to ${ event.target.value } will reset Kubernetes.`;
        } else {
          confirmationMessage = `Changing from version ${ this.settings.kubernetes.version } to ${ event.target.value } will upgrade Kubernetes`;
        }
        confirmationMessage += ' Do you want to proceed?';
        if (confirm(confirmationMessage)) {
          ipcRenderer.invoke('settings-write', { kubernetes: { version: event.target.value } })
            .then(() => this.restart());
        } else {
          alert('The Kubernetes version was not changed');
        }
      }
    },
    handleCheckbox(value, name) {
      ipcRenderer.send('install-set', name, value);
    },
    handleUpdateMemory(value) {
      this.settings.kubernetes.memoryInGB = value;
      ipcRenderer.invoke('settings-write',
        { kubernetes: { memoryInGB: value } });
    },
    handleUpdateCPU(value) {
      this.settings.kubernetes.numberCPUs = value;
      ipcRenderer.invoke('settings-write',
        { kubernetes: { numberCPUs: value } });
    },
    handleUpdatePort(value) {
      this.settings.kubernetes.port = value;
      ipcRenderer.invoke('settings-write',
        { kubernetes: { port: value } });
    },
    handleNotification(level, key, message) {
      if (message) {
        this.$set(this.notifications, key, {
          key, level, message
        });
      } else {
        this.$delete(this.notifications, key);
      }
    },
    handleWarning(key, message) {
      this.handleNotification('warning', key, message);
    },
  },
};
</script>

<style scoped>
.contents > *:not(hr) {
  max-width: calc(100% - 20px);
}
.select-k8s-version {
  width: inherit;
  display: inline-block;
}
</style>
