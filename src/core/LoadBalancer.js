const ConfigManager = require('../utils/ConfigManager');
const HealthChecker = require('../health/HealthChecker');
const StrategyManager = require('../strategies/StrategyManager');
const ProxyEngine = require('./ProxyEngine');
const eventBus = require('./EventBus');
const logger = require('../utils/Logger');

class LoadBalancer {
  constructor(options = {}) {
    // Initialize configuration
    this.configManager = new ConfigManager(options.configPath);
    
    // Components will be initialized after config is loaded
    this.healthChecker = null;
    this.strategyManager = null;
    this.proxyEngine = null;
    this.webSocketServer = null;
    this.apiServer = null;
    
    // Register config update handler
    eventBus.on(eventBus.Events.CONFIG_UPDATE, this.handleConfigUpdate.bind(this));
  }

  async start() {
    try {
      // Load configuration
      await this.configManager.load();
      logger.info('Configuration loaded');
      
      // Set log level from config
      if (this.configManager.get('logLevel')) {
        logger.setLevel(this.configManager.get('logLevel'));
      }
      
      // Initialize components
      this.initializeComponents();
      
      // Start services
      this.healthChecker.start();
      this.proxyEngine.start();
      
      logger.info('Load balancer started successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to start load balancer: ${error.message}`);
      return false;
    }
  }

  async stop() {
    logger.info('Stopping load balancer...');
    
    // Stop components in reverse order
    await this.proxyEngine?.stop();
    this.healthChecker?.stop();
    
    logger.info('Load balancer stopped');
  }

  initializeComponents() {
    const config = this.configManager.config;
    
    this.healthChecker = new HealthChecker({
      servers: config.servers,
      interval: config.healthCheck?.interval || 5000,
      path: config.healthCheck?.path || '/health',
      timeout: config.healthCheck?.timeout || 2000
    });
    
    const proxyEngine = new ProxyEngine({
      httpPort: config.ports?.http || 80,
      httpsPort: config.ports?.https || 443,
      tls: config.tls,
      healthChecker: this.healthChecker
    });
    
    // Get connection tracker for strategy manager
    const connectionTracker = proxyEngine.getConnectionTracker();
    
    // Initialize strategy manager
    this.strategyManager = new StrategyManager({
      servers: [],
      defaultStrategy: config.strategy || 'round-robin',
      healthChecker: this.healthChecker,
      connectionTracker
    });
    
    // Set proxy engine's strategy manager
    proxyEngine.strategyManager = this.strategyManager;
    this.proxyEngine = proxyEngine;
  
  }

  handleConfigUpdate({ key, value }) {
    logger.debug(`Config updated: ${key} = ${JSON.stringify(value)}`);
    
    if (key.startsWith('healthCheck')) {
      if (this.healthChecker) {
        this.healthChecker.updateConfig(this.configManager.get('healthCheck'));
      }
    } else if (key === 'strategy') {
      if (this.strategyManager) {
        this.strategyManager.setStrategy(value);
      }
    } else if (key.startsWith('ports')) {
      const ports = this.configManager.get('ports');
      
      if (key === 'ports.http' || key === 'ports.https') {
        if (this.proxyEngine) {
          this.proxyEngine.updateConfig({
            httpPort: ports.http,
            httpsPort: ports.https
          });
        }
      }
    } else if (key.startsWith('tls')) {
      if (this.proxyEngine) {
        this.proxyEngine.updateConfig({
          tls: this.configManager.get('tls')
        });
      }
    } else if (key === 'servers') {
      if (this.healthChecker) {
        this.healthChecker.updateConfig({ servers: value });
      }
    } else if (key === 'logLevel') {
      logger.setLevel(value);
    }
  }

  // Getters for accessing services
  getHealthChecker() {
    return this.healthChecker;
  }

  getStrategyManager() {
    return this.strategyManager;
  }

  getProxyEngine() {
    return this.proxyEngine;
  }

  getWebSocketServer() {
    return this.webSocketServer;
  }

  getApiServer() {
    return this.apiServer;
  }

  getConfigManager() {
    return this.configManager;
  }
}

module.exports = LoadBalancer;