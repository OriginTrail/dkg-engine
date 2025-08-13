import awilix from 'awilix';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DependencyInjection {
    static async initialize() {
        console.log('[DI] Starting dependency injection initialization...');

        const container = awilix.createContainer({
            injectionMode: awilix.InjectionMode.PROXY,
        });

        console.log('[DI] Container created with PROXY injection mode');

        // Get the package root directory (two levels up from this file)
        const packageRoot = path.resolve(__dirname, '..', '..');
        console.log('[DI] Package root directory:', packageRoot);

        const modulePatterns = [
            path.join(packageRoot, 'src/controllers/**/*.js'),
            path.join(packageRoot, 'src/service/*.js'),
            path.join(packageRoot, 'src/commands/**/**/**/*.js'),
            path.join(packageRoot, 'src/commands/*.js'),
            path.join(packageRoot, 'src/modules/base-module-manager.js'),
            path.join(packageRoot, 'src/modules/**/*module-manager.js'),
        ];

        console.log('[DI] Loading modules with patterns:', modulePatterns);

        try {
            await container.loadModules(modulePatterns, {
                esModules: true,
                formatName: 'camelCase',
                resolverOptions: {
                    lifetime: awilix.Lifetime.SINGLETON,
                    register: awilix.asClass,
                },
            });

            console.log('[DI] Modules loaded successfully');
            console.log('[DI] Registered modules:', Object.keys(container.registrations));

            // Log specific module managers
            const moduleManagers = Object.keys(container.registrations).filter((name) =>
                name.includes('ModuleManager'),
            );
            console.log('[DI] Module managers found:', moduleManagers);

            // Check for autoUpdaterModuleManager specifically
            if (container.registrations.autoUpdaterModuleManager) {
                console.log('[DI] ✓ autoUpdaterModuleManager is registered');
            } else {
                console.log('[DI] ✗ autoUpdaterModuleManager is NOT registered');
            }

            // Test resolving some key modules
            const testModules = [
                'config',
                'logger',
                'autoUpdaterModuleManager',
                'blockchainModuleManager',
            ];
            for (const moduleName of testModules) {
                try {
                    console.log(`[DI] ✓ Successfully resolved: ${moduleName}`);
                } catch (error) {
                    console.log(`[DI] ✗ Failed to resolve ${moduleName}: ${error.message}`);
                }
            }
        } catch (error) {
            console.error('[DI] Error loading modules:', error);
            throw error;
        }

        console.log('[DI] Dependency injection initialization completed');
        return container;
    }

    static registerValue(container, valueName, value) {
        console.log(`[DI] Registering value: ${valueName}`);
        container.register({
            [valueName]: awilix.asValue(value),
        });
        console.log(`[DI] ✓ Registered: ${valueName}`);
    }
}

export default DependencyInjection;
