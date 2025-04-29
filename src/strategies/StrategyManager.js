const RoundRobinStrategy = require('./RoundRobinStrategy');
const eventBus = require('../core/EventBus');
const logger = require('../utils/Logger');

class StrategyManager {
  constructor(options = {}) {
    this.servers = options.servers || [];
    this.connectionTracker = options.connectionTracker || {
      increment: () => {},
      decrement: () => {},
      getConnections: () => 0
    };
    
    // Available strategies
    this.strategies = {
      'round-robin': new RoundRobinStrategy({ 
        servers: this.servers,
        connectionTracker: this.connectionTracker
      }),
    };
    

    this.currentStrategy = options.defaultStrategy || 'round-robin';
    
    // Listen for server status changes
    eventBus.on(eventBus.Events.SERVER_STATUS_CHANGE, () => {
      this.updateHealthyServers(options.healthChecker.getHealthyServers());
    });

    // Initialize with healthy servers if health checker is provided
    if (options.healthChecker) {
      this.updateHealthyServers(options.healthChecker.getHealthyServers());
    }
  }

  getServer(clientIP) {
    console.log("StrategyManager::getServer:37")
    const strategy = this.strategies[this.currentStrategy];
    
    if (!strategy) {
      logger.error(`Strategy ${this.currentStrategy} not found, falling back to round-robin`);
      return this.strategies['round-robin'].getServer();
    }
    
    // For IP hashing, we need to pass the client IP
    if (this.currentStrategy === 'ip-hash') {
      return strategy.getServer(clientIP);
    }
    
    return strategy.getServer();
  }

  updateHealthyServers(servers) {
    this.servers = servers;
    
    // Update servers in all strategies
    Object.values(this.strategies).forEach(strategy => {
      strategy.updateServers(servers);
    });
    
    logger.debug(`Updated server list in all strategies. Active servers: ${servers.length}`);
  }

  setStrategy(strategyName) {
    if (!this.strategies[strategyName]) {
      throw new Error(`Unknown strategy: ${strategyName}`);
    }
    
    this.currentStrategy = strategyName;
    logger.info(`Load balancing strategy changed to ${strategyName}`);
    
    // Emit event for strategy change
    eventBus.emitStrategyChange({
      strategy: strategyName,
      stats: this.getStrategyStats()
    });
    
    return this.strategies[strategyName];
  }

  getCurrentStrategy() {
    return this.currentStrategy;
  }

  getAvailableStrategies() {
    return Object.keys(this.strategies);
  }

  getStrategyStats() {
    const stats = {};
    
    for (const [name, strategy] of Object.entries(this.strategies)) {
      stats[name] = strategy.getStats();
    }
    
    return {
      current: this.currentStrategy,
      stats
    };
  }
}

module.exports = StrategyManager;