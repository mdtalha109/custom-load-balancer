const fs = require('fs').promises;
const path = require('path');
const eventBus = require('../core/EventBus');

class ConfigManager {
  constructor(configPath = path.join(process.cwd(), 'config.json')) {
    this.configPath = configPath;
    this.config = {
      servers: [],
      strategy: 'round-robin',
      healthCheck: {
        interval: 5000,
        path: '/health',
        timeout: 2000
      },
      tls: {
        enabled: false,
        certPath: '',
        keyPath: ''
      },
      ports: {
        http: 80,
        https: 443,
        dashboard: 8080
      }
    };
  }

  async load() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(data);
      return this.config;
    } catch (error) {
      // If file doesn't exist, create it with default config
      if (error.code === 'ENOENT') {
        await this.save();
      } else {
        throw error;
      }
      return this.config;
    }
  }

  async save() {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    return this.config;
  }

  get(key) {
    const keys = key.split('.');
    let result = this.config;
    
    for (const k of keys) {
      if (result[k] === undefined) return undefined;
      result = result[k];
    }
    
    return result;
  }

  async set(key, value) {
    const keys = key.split('.');
    let target = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (target[k] === undefined) {
        target[k] = {};
      }
      target = target[k];
    }
    
    target[keys[keys.length - 1]] = value;
    
    await this.save();
    
    // now emit the event to notify the core
    eventBus.emitConfigUpdate({ key, value });
    
    return value;
  }
}

module.exports = ConfigManager;