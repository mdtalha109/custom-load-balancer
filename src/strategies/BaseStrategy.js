/**
 * Base strategy class that all load balancing strategies must extend
 */
class BaseStrategy {
    constructor(options = {}) {
      this.name = 'base';
      this.servers = options.servers || [];
      this.connectionTracker = options.connectionTracker || {
        increment: () => {},
        decrement: () => {},
        getConnections: () => 0
      };
    }
  
    /**
     * Get the next server according to the strategy
     * @returns {Object|null} Selected server or null if no servers available
     */
    getServer() {
      throw new Error('getServer method must be implemented by derived strategies');
    }
  
    /**
     * Update the list of available servers
     * @param {Array} servers - New list of available servers
     */
    updateServers(servers) {
      this.servers = servers;
    }
  
    /**
     * Get the name of the strategy
     * @returns {string} Strategy name
     */
    getName() {
      return this.name;
    }
  
    /**
     * Get statistics about this strategy
     * @returns {Object} Strategy stats
     */
    getStats() {
      return {
        name: this.name,
        serverCount: this.servers.length
      };
    }
  }
  
  module.exports = BaseStrategy;