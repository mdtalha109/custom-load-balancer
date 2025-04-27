class Logger {
    constructor(options = {}) {
      this.level = options.level || 'info';
      this.levels = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
      };
      this.colors = {
        error: 'red', // red
        warn: 'yellow',  // yellow
        info: 'cyan',  // cyan
        debug: 'gray', // gray
      };
    }
  
    shouldLog(level) {
      return this.levels[level] <= this.levels[this.level];
    }
  
    formatMessage(level, message, context = {}) {
      const timestamp = new Date().toISOString();
      const color = this.colors[level];
      const reset = this.colors.reset;
      const contextStr = Object.keys(context).length ? 
        ` ${JSON.stringify(context)}` : '';
      
      return `${color}[${timestamp}] [${level.toUpperCase()}]${reset} ${message}${contextStr}`;
    }
  
    log(level, message, context) {
      if (this.shouldLog(level)) {
        console.log(this.formatMessage(level, message, context));
      }
    }
  
    error(message, context) {
      this.log('error', message, context);
    }
  
    warn(message, context) {
      this.log('warn', message, context);
    }
  
    info(message, context) {
      this.log('info', message, context);
    }
  
    debug(message, context) {
      this.log('debug', message, context);
    }
  
    setLevel(level) {
      if (this.levels[level] !== undefined) {
        this.level = level;
      }
    }
  }
  
  const logger = new Logger();
  module.exports = logger;