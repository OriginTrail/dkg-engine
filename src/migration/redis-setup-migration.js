import { execSync } from 'child_process';
import BaseMigration from './base-migration.js';
import { NODE_ENVIRONMENTS } from '../constants/constants.js';

class RedisSetupMigration extends BaseMigration {
    async executeMigration() {
        if (
            process.env.NODE_ENV === NODE_ENVIRONMENTS.DEVELOPMENT ||
            process.env.NODE_ENV === NODE_ENVIRONMENTS.TEST
        ) {
            this.logger.info('Skipping Redis setup in development/test environment');
            return;
        }

        if (this.isRedisInstalledAndRunning()) {
            this.logger.info('✅ Redis is already installed and running.');

            // Check if configuration is correct
            if (this.isRedisConfiguredCorrectly()) {
                this.logger.info('✅ Redis is configured correctly. No changes needed.');
                return;
            }

            this.logger.info('⚠️ Redis is installed but configuration needs updating.');
            this.updateRedisConfiguration();
        } else {
            this.logger.info('🔧 Installing Redis...');
            this.installRedis();
        }

        this.verifyRedisInstallation();
    }

    installRedis() {
        this.run('sudo apt update', 'Updating package list');
        this.run('sudo apt install -y redis-server', 'Installing Redis server');

        // Backup original config before modifying
        this.run(
            'sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.backup',
            'Backing up original redis.conf',
        );

        this.updateRedisConfiguration();

        this.run('sudo systemctl restart redis.service', 'Restarting Redis service');
        this.run('sudo systemctl enable redis.service', 'Enabling Redis to start on boot');
        this.run('sudo systemctl status redis.service --no-pager', 'Checking Redis service status');
    }

    updateRedisConfiguration() {
        this.logger.info('🔧 Updating Redis configuration...');

        // Ensure redis.conf uses systemd
        this.modifyRedisConf(/supervised\s+no/, 'supervised', 'Enabling systemd supervision');

        // Enable AOF persistence
        this.modifyRedisConf(/appendonly\s+no/, 'appendonly yes', 'Enabling AOF persistence');
        this.modifyRedisConf(
            /appendfsync\s+\w+/,
            'appendfsync everysec',
            'Setting AOF fsync every second',
        );

        // Enforce noeviction policy
        this.modifyRedisConf(
            /maxmemory-policy\s+\w+/,
            'maxmemory-policy noeviction',
            'Setting noeviction policy',
        );

        // Restart Redis to apply configuration changes
        this.run(
            'sudo systemctl restart redis.service',
            'Restarting Redis service to apply configuration',
        );
    }

    isRedisConfiguredCorrectly() {
        try {
            const configPath = '/etc/redis/redis.conf';
            const configContent = execSync(`sudo cat ${configPath}`, { stdio: 'pipe' }).toString();

            const checks = [
                { pattern: /supervised\s+systemd/, name: 'systemd supervision' },
                { pattern: /appendonly\s+yes/, name: 'AOF persistence' },
                { pattern: /appendfsync\s+everysec/, name: 'AOF fsync every second' },
                { pattern: /maxmemory-policy\s+noeviction/, name: 'noeviction policy' },
            ];

            let allCorrect = true;
            for (const check of checks) {
                if (!check.pattern.test(configContent)) {
                    this.logger.warn(`⚠️ Configuration issue: ${check.name} not set correctly`);
                    allCorrect = false;
                }
            }

            if (allCorrect) {
                this.logger.info('✅ All Redis configuration checks passed');
            } else {
                this.logger.info('⚠️ Some Redis configuration settings need to be updated');
            }

            return allCorrect;
        } catch (err) {
            this.logger.warn(`⚠️ Could not read Redis configuration: ${err.message}`);
            return false;
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

    verifyRedisInstallation() {
        try {
            const ping = execSync('redis-cli ping').toString().trim();
            if (ping === 'PONG') {
                this.logger.info('🎉 Redis is installed and responding: PONG');

                // Final configuration check
                if (this.isRedisConfiguredCorrectly()) {
                    this.logger.info(
                        '🎉 Redis setup completed successfully with correct configuration!',
                    );
                } else {
                    this.logger.error('❌ Redis is running but configuration is still incorrect');
                    process.exit(1);
                }
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
        const configPath = '/etc/redis/redis.conf';

        // Use a simpler approach: comment out lines that contain the pattern (not commented)
        const commentCommand = `sudo sed -i '/^[[:space:]]*[^#].*${pattern.source.replace(
            /\\s/g,
            '.*',
        )}/s/^/# /' ${configPath}`;
        this.run(commentCommand, `Commenting out existing ${description} settings`);

        // Step 2: Add the new setting at the end of the file
        this.run(
            `echo '${replacement}' | sudo tee -a ${configPath}`,
            `Adding ${replacement} to redis.conf`,
        );

        // Step 3: Verify the change was made
        try {
            const grepCheck = `grep -q "^${replacement}$" ${configPath}`;
            execSync(grepCheck, { stdio: 'ignore' });
            this.logger.info(`✅ Successfully updated: ${description}`);
        } catch {
            this.logger.error(`❌ Failed to verify: ${description}`);
            throw new Error(`Failed to update ${description}`);
        }
    }
}

export default RedisSetupMigration;
