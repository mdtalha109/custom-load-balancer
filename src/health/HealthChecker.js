const http = require('http');
const https = require('https');
const eventBus = require('../core/EventBus');
const logger = require('../utils/Logger');

class HealthChecker {
  constructor(options = {}) {
    this.servers = options.servers || [];
    this.interval = options.interval || 5000;
    this.path = options.path || '/health';
    this.timeout = options.timeout || 2000;
    this.healthyServers = new Map();
    this.checkIntervalId = null;
  }

  start() {
    this.checkAll();
    this.checkIntervalId = setInterval(() => this.checkAll(), this.interval);
    logger.info(`Health checker started with interval ${this.interval}ms`);
  }

  stop() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
      logger.info('Health checker stopped');
    }
  }

  addServer(server) {
    if (!this.servers.some(s => s.id === server.id)) {
      this.servers.push(server);
      this.check(server);
      logger.info(`Added server for health checking: ${server.id}`);
    }
  }

  removeServer(serverId) {
    const index = this.servers.findIndex(s => s.id === serverId);
    if (index !== -1) {
      this.servers.splice(index, 1);
      this.healthyServers.delete(serverId);
      logger.info(`Removed server from health checking: ${serverId}`);
    }
  }

  getHealthyServers() {
    return Array.from(this.healthyServers.values());
  }

  isHealthy(serverId) {
    return this.healthyServers.has(serverId);
  }

  async checkAll() {
    logger.debug('Running health check on all servers');
    for (const server of this.servers) {
      await this.check(server);
    }
  }

  async check(server) {
    const wasHealthy = this.healthyServers.has(server.id);
    
    try {
      const isHealthy = await this.performHealthCheck(server);
      
      if (isHealthy && !wasHealthy) {
        // Server became healthy
        this.healthyServers.set(server.id, server);
        logger.info(`Server ${server.id} is healthy`, { url: `${server.protocol}://${server.host}:${server.port}` });
        eventBus.emitServerStatusChange({ serverId: server.id, status: 'healthy' });
      } else if (!isHealthy && wasHealthy) {
        // Server became unhealthy
        this.healthyServers.delete(server.id);
        logger.warn(`Server ${server.id} is unhealthy`, { url: `${server.protocol}://${server.host}:${server.port}` });
        eventBus.emitServerStatusChange({ serverId: server.id, status: 'unhealthy' });
      }
      
      return isHealthy;
    } catch (error) {
      if (wasHealthy) {
        this.healthyServers.delete(server.id);
        logger.warn(`Server ${server.id} is unhealthy: ${error.message}`);
        eventBus.emitServerStatusChange({ serverId: server.id, status: 'unhealthy' });
      }
      return false;
    }
  }

  performHealthCheck(server) {
    return new Promise((resolve) => {
      const protocol = server.protocol === 'https' ? https : http;
      const request = protocol.request({
        host: server.host,
        port: server.port,
        path: this.path,
        method: 'GET',
        timeout: this.timeout
      }, (response) => {
        // Check if status code is 2xx
        const isHealthy = response.statusCode >= 200 && response.statusCode < 300;
        resolve(isHealthy);
      });

      request.on('error', () => {
        resolve(false);
      });

      request.on('timeout', () => {
        request.destroy();
        resolve(false);
      });

      request.end();
    });
  }

  updateConfig(options) {
    if (options.interval && typeof options.interval === 'number') {
      this.interval = options.interval;
      // Restart with new interval
      this.stop();
      this.start();
    }
    
    if (options.path) {
      this.path = options.path;
    }
    
    if (options.timeout && typeof options.timeout === 'number') {
      this.timeout = options.timeout;
    }
    
    if (options.servers) {
      this.servers = options.servers;
      // Reset healthy servers and recheck
      this.healthyServers.clear();
      this.checkAll();
    }
    
    logger.info('Health checker configuration updated');
  }
}

module.exports = HealthChecker;