import { execSync } from 'child_process';
import BaseMigration from './base-migration.js';
import { NODE_ENVIRONMENTS } from '../constants/constants.js';

class RedisSetupMigration extends BaseMigration {
    async executeMigration() {
        if (
            process.env.NODE_ENV === NODE_ENVIRONMENTS.DEVELOPMENT &&
            process.env.NODE_ENV === NODE_ENVIRONMENTS.TEST
        ) {
            return;
        }

        // Check if Redis is already installed and running
        if (this.isRedisInstalledAndRunning()) {
            this.logger.info('✅ Redis is already installed and running. Skipping installation.');
            return;
        }

        this.run('sudo apt update', 'Updating package list');

        this.run('sudo apt install -y redis-server', 'Installing Redis server');

        // Modify redis.conf only if supervised is still 'no'
        try {
            const config = execSync('sudo grep "^supervised" /etc/redis/redis.conf')
                .toString()
                .trim();
            if (config === 'supervised no') {
                this.run(
                    "sudo sed -i 's/^supervised no/supervised systemd/' /etc/redis/redis.conf",
                    'Enabling systemd supervision in redis.conf',
                );
            } else {
                this.logger.info('✅ Redis already configured for systemd supervision.');
            }
        } catch (err) {
            this.logger.warn('⚠️ Could not verify redis.conf, continuing...');
        }

        this.run('sudo systemctl restart redis.service', 'Restarting Redis service');
        this.run('sudo systemctl enable redis.service', 'Enabling Redis to start on boot');

        this.run('sudo systemctl status redis.service --no-pager', 'Checking Redis service status');

        try {
            const ping = execSync('redis-cli ping').toString().trim();
            if (ping === 'PONG') {
                this.logger.info('🎉 Redis is installed and responding: PONG');
            } else {
                this.logger.error('❌ Redis did not respond with PONG');
                process.exit(1);
            }
        } catch (err) {
            this.logger.error('❌ Redis ping failed');
            this.logger.error(err.message);
            process.exit(1);
        }
    }

    isRedisInstalledAndRunning() {
        try {
            // Check if redis-server is installed
            execSync('which redis-server', { stdio: 'ignore' });

            // Check if redis service is running
            const serviceStatus = execSync('systemctl is-active redis.service', { stdio: 'pipe' })
                .toString()
                .trim();

            if (serviceStatus === 'active') {
                // Double-check with a ping test
                const ping = execSync('redis-cli ping', { stdio: 'pipe' }).toString().trim();

                return ping === 'PONG';
            }

            return false;
        } catch (err) {
            // Redis is not installed or not running
            return false;
        }
    }

    run(cmd, description) {
        this.logger.info(`🔧 ${description}...`);
        try {
            const output = execSync(cmd, { stdio: 'inherit' });
            return output?.toString().trim();
        } catch (err) {
            this.logger.error(`❌ Failed: ${description}`);
            this.logger.error(err.message);
            process.exit(1); // stop if a critical step fails
        }
    }
}

export default RedisSetupMigration;
