const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();

    this.Events = {
      SERVER_STATUS_CHANGE: 'server_status_change',
      STRATEGY_CHANGE: 'strategy_change',
      CONFIG_UPDATE: 'config_update',
    };
  }

  emitServerStatusChange(serverInfo) {
    this.emit(this.Events.SERVER_STATUS_CHANGE, serverInfo);
  }

  emitStrategyChange(strategyInfo) {
    this.emit(this.Events.STRATEGY_CHANGE, strategyInfo);
  }

  emitConfigUpdate(configInfo) {
    this.emit(this.Events.CONFIG_UPDATE, configInfo);
  }

}

const eventBus = new EventBus();
module.exports = eventBus;