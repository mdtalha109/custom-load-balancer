const BaseStrategy = require('./BaseStrategy');

class RoundRobinStrategy extends BaseStrategy {
  constructor(options = {}) {
    super(options);
    this.name = 'round-robin';
    this.currentIndex = 0;
  }

  getServer() {
    if (this.servers.length === 0) {
      return null;
    }
    
    const server = this.servers[this.currentIndex];
    console.log("server: ", server);
    
    this.currentIndex = (this.currentIndex + 1) % this.servers.length;
    
    return server;
  }

  getStats() {
    return {
      ...super.getStats(),
      currentIndex: this.currentIndex
    };
  }
}

module.exports = RoundRobinStrategy;