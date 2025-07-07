import { execSync } from 'child_process';
import BaseMigration from './base-migration.js';
import { NODE_ENVIRONMENTS } from '../constants/constants.js';

class RedisSetupMigration extends BaseMigration {
    async executeMigration() {
        if (
            process.env.NODE_ENV === NODE_ENVIRONMENTS.DEVELOPMENT ||
            process.env.NODE_ENV === NODE_ENVIRONMENTS.TEST
        ) {
            return;
        }

        if (this.isRedisInstalledAndRunning()) {
            this.logger.info('✅ Redis is already installed and running. Skipping installation.');
            return;
        }

        this.run('sudo apt update', 'Updating package list');
        this.run('sudo apt install -y redis-server', 'Installing Redis server');

        // Ensure redis.conf uses systemd
        this.modifyRedisConf(
            /^supervised\s+no/,
            'supervised systemd',
            'Enabling systemd supervision in redis.conf',
        );

        // Enable AOF persistence
        this.modifyRedisConf(/^appendonly\s+no/, 'appendonly yes', 'Enabling AOF persistence');
        this.modifyRedisConf(
            /^#?\s*appendfsync\s+\w+/,
            'appendfsync everysec',
            'Setting AOF fsync to every second',
        );

        // Enforce noeviction policy
        this.modifyRedisConf(
            /^#?\s*maxmemory-policy\s+\w+/,
            'maxmemory-policy noeviction',
            'Setting maxmemory-policy to noeviction',
        );

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
            execSync('which redis-server', { stdio: 'ignore' });
            const serviceStatus = execSync('systemctl is-active redis.service', { stdio: 'pipe' })
                .toString()
                .trim();
            const ping = execSync('redis-cli ping', { stdio: 'pipe' }).toString().trim();
            return serviceStatus === 'active' && ping === 'PONG';
        } catch {
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
            process.exit(1);
        }
    }

    modifyRedisConf(pattern, replacement, description) {
        const sedCommand = `sudo sed -i 's|${pattern.source}|${replacement}|' /etc/redis/redis.conf`;
        this.run(sedCommand, description);
    }
}

export default RedisSetupMigration;
