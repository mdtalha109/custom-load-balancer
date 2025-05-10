const LoadBalancer = require("./core/LoadBalancer");
const logger = require("./utils/Logger");
const path = require("path");

async function main() {
  try {
    const args = process.argv.slice(2);
    const configPath =
      args.length > 0
        ? path.resolve(args[0])
        : path.join(process.cwd(), "config.json");

    logger.info(`Starting load balancer with config: ${configPath}`);

    const loadBalancer = new LoadBalancer({ configPath });

    // Start the load balancer
    const success = await loadBalancer.start();

    if (!success) {
      process.exit(1);
    }

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down...");
      await loadBalancer.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down...");
      await loadBalancer.stop();
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error(`Uncaught exception: ${error.message}`);
      logger.error(error.stack);
    });

    process.on("unhandledRejection", (reason, promise) => {
      logger.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
    });

    logger.info("Load balancer is running");
  } catch (err) {
    logger.error(`Failed to start load balancer: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}
if (require.main === module) {
  main();
}
