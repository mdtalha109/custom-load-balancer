const http = require("http");
const https = require("https");
const fs = require("fs");
const url = require("url");
const eventBus = require("./EventBus");
const logger = require("../utils/Logger");

class ConnectionTracker {
  constructor() {
    this.connections = new Map();
  }

  increment(serverId) {
    const current = this.connections.get(serverId) || 0;
    this.connections.set(serverId, current + 1);

    // Emit the connection change event
    eventBus.emitConnectionsChange({
      serverId,
      connections: current + 1,
      allConnections: this.getAllStats(),
    });

    return current + 1;
  }

  decrement(serverId) {
    const current = this.connections.get(serverId) || 0;
    if (current > 0) {
      this.connections.set(serverId, current - 1);

      // Emit the connection change event
      eventBus.emitConnectionsChange({
        serverId,
        connections: current - 1,
        allConnections: this.getAllStats(),
      });

      return current - 1;
    }
    return 0;
  }

  getConnections(serverId) {
    return this.connections.get(serverId) || 0;
  }

  getAllStats() {
    const stats = {};
    for (const [serverId, count] of this.connections.entries()) {
      stats[serverId] = count;
    }
    return stats;
  }
}

class ProxyEngine {
  constructor(options = {}) {
    this.strategyManager = options.strategyManager;
    this.healthChecker = options.healthChecker;
    this.connectionTracker = new ConnectionTracker();
    this.httpServer = null;
    this.httpsServer = null;

    // Default ports
    this.httpPort = options.httpPort || 80;
    this.httpsPort = options.httpsPort || 443;

    // TLS options
    this.tlsEnabled = (options.tls && options.tls.enabled) || false;
    this.tlsOptions = options.tls || {};
  }

  start() {
    this.startHttpServer();

    if (this.tlsEnabled) {
      this.startHttpsServer();
    }

    logger.info(
      `Proxy engine started. HTTP on port ${this.httpPort}, HTTPS ${
        this.tlsEnabled ? "on port " + this.httpsPort : "disabled"
      }`
    );
  }

  stop() {
    return new Promise((resolve) => {
      const closeHttp = new Promise((resolveHttp) => {
        if (this.httpServer) {
          this.httpServer.close(() => resolveHttp());
        } else {
          resolveHttp();
        }
      });

      const closeHttps = new Promise((resolveHttps) => {
        if (this.httpsServer) {
          this.httpsServer.close(() => resolveHttps());
        } else {
          resolveHttps();
        }
      });

      Promise.all([closeHttp, closeHttps]).then(() => {
        logger.info("Proxy engine stopped");
        resolve();
      });
    });
  }

  startHttpServer() {
    this.httpServer = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.httpServer.listen(this.httpPort, () => {
      logger.info(`HTTP server listening on port ${this.httpPort}`);
    });

    this.httpServer.on("error", (err) => {
      logger.error(`HTTP server error: ${err.message}`);
    });
  }

  startHttpsServer() {
    try {
      // Load certificates
      const tlsOptions = {
        key: fs.readFileSync(this.tlsOptions.keyPath),
        cert: fs.readFileSync(this.tlsOptions.certPath),
      };

      this.httpsServer = https.createServer(tlsOptions, (req, res) => {
        this.handleRequest(req, res);
      });

      this.httpsServer.listen(this.httpsPort, () => {
        logger.info(`HTTPS server listening on port ${this.httpsPort}`);
      });

      this.httpsServer.on("error", (err) => {
        logger.error(`HTTPS server error: ${err.message}`);
      });
    } catch (error) {
      logger.error(`Failed to start HTTPS server: ${error.message}`);
    }
  }

  handleRequest(req, res) {
    const clientIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    console.log("clientIP: ", clientIP)

    // Select a backend server using the current strategy
    const server = this.strategyManager.getServer(clientIP);

    if (!server) {
      logger.warn("No healthy backend servers available");
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("Service Unavailable: No backend servers available");
      return;
    }

    logger.debug(`Proxying request to ${server.id}`, {
      path: req.url,
      method: req.method,
      clientIP,
    });

    // Track connection
    this.connectionTracker.increment(server.id);

    // Create proxy request options
    const options = {
      hostname: server.host,
      port: server.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers },
    };

    const protocol = server.protocol === "https" ? https : http;

    // Create proxy request
    const proxyReq = protocol.request(options, (proxyRes) => {
      // Copy response headers
      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      // Pipe the response from backend to client
      proxyRes.pipe(res);

      // Clean up when response ends
      proxyRes.on("end", () => {
        this.connectionTracker.decrement(server.id);
      });
    });

    proxyReq.on("error", (err) => {
      logger.error(`Proxy request error: ${err.message}`, {
        serverId: server.id,
        url: req.url,
      });

      // Decrement connection count
      this.connectionTracker.decrement(server.id);

      // If connection refused, mark server as unhealthy
      if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
        this.healthChecker.check(server);
      }

      // Return error to client if headers not sent
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end("Bad Gateway");
      } else {
        res.end();
      }
    });

    // Pipe the request body to the proxy request
    req.pipe(proxyReq);

    // Handle client request errors
    req.on("error", () => {
      proxyReq.destroy();
      this.connectionTracker.decrement(server.id);
    });
  }

  updateConfig(config) {
    if (config.httpPort && config.httpPort !== this.httpPort) {
      this.httpPort = config.httpPort;
      this.stop().then(() => this.start());
    }
    
    if (config.httpsPort && config.httpsPort !== this.httpsPort) {
      this.httpsPort = config.httpsPort;
      this.stop().then(() => this.start());
    }
    
    if (config.tls) {
      const tlsChanged = 
        config.tls.enabled !== this.tlsEnabled ||
        config.tls.certPath !== this.tlsOptions.certPath ||
        config.tls.keyPath !== this.tlsOptions.keyPath;
        
      if (tlsChanged) {
        this.tlsEnabled = config.tls.enabled;
        this.tlsOptions = config.tls;
        this.stop().then(() => this.start());
      }
    }
    
    logger.info('Proxy engine configuration updated');
  }

  getConnectionTracker() {
    return this.connectionTracker;
  }
}

module.exports = ProxyEngine;
