/**
 * @module root.tasks.configureNat
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const checkConfigRequiredCommands = [
    '# ---------- Check if NAT/port forwarding has already been configured ----------',
    'grep -iq "vmbr300" /etc/network/interfaces'
];

const configureNatCommands = [
    '# ---------- Add a new bridge with both NAT and port forwarding  ----------',
    [
        "cat <<'EOF' >> /etc/network/interfaces",
        'auto vmbr300',
        'iface vmbr300 inet static',
        '    address 10.0.0.1',
        '    netmask 255.255.255.0',
        '    bridge_ports vmbr0',
        '    bridge_stp off',
        '    bridge_fd 0',
        '    post-up echo 1 > /proc/sys/net/ipv4/ip_forward',
        "    post-up   iptables -t nat -A POSTROUTING -s '10.0.0.0/24' -o vmbr0 -j MASQUERADE",
        "    post-down iptables -t nat -D POSTROUTING -s '10.0.0.0/24' -o vmbr0 -j MASQUERADE",
        '    post-up iptables -t nat -A PREROUTING -i vmbr0 -p tcp--dport 2222 -j DNAT --to 10.0.0.32:22',
        '    post-down iptables -t nat -D PREROUTING -i vmbr0 -p tcp --dport 2222 -j DNAT --to 10.0.0.32:22',
        'EOF'
    ].join('\n')
];

const restartNetworkingServiceCommands = [
    '# ---------- Restart networking service ----------',
    'systemctl restart networking.service'
];

/**
 * Returns a task that can be used to configure the host network and NAT. Note
 * that this task works by writing configuration into the
 * `/etc/network/interfaces` file. A preliminary check is made to ensure that
 * the configuration update is necessary, but the test is fairly basic - it
 * ensures that no duplicate records are written, but cannot correct existing
 * config if it is partial or incorrect.
 *
 * @param hostInfo Informtation about the remote host against which the task
 *        will be executed.
 *
 * @return ITaskDefinition A task definition that can be used to execute the
 *         task.
 */
export const getTask = (hostInfo: IRemoteHostInfo): ITaskDefinition => {
    return {
        title: 'Configure NAT',
        task: () => {
            const logger = _loggerProvider.getLogger('configure-nat');
            function skip(ctx) {
                if (ctx.skipNatConfig) {
                    logger.warn('Skipping NAT configuration');
                    return 'NAT already configured';
                }
                logger.debug('NAT configuration required');
                return false;
            }

            return new Listr([
                {
                    title: 'Check if NAT configuration is required',
                    task: (ctx, task) => {
                        logger.trace('Check if NAT configuration is required');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(checkConfigRequiredCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    logger.debug('NAT configuration required');
                                    ctx.skipNatConfig = false;
                                } else {
                                    logger.warn('NAT already configured');
                                    ctx.skipNatConfig = true;
                                }
                            });
                    }
                },
                {
                    title: 'Add linux bridge config and NAT settings',
                    skip,
                    task: () => {
                        logger.trace('Configure NAT');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(configureNatCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error configuring NAT on host'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('NAT configuration completed');
                            });
                    }
                },
                {
                    title: 'Restart networking service',
                    skip,
                    task: () => {
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(restartNetworkingServiceCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    logger.warn(
                                        'Networking service restart returned an error. Ignoring.'
                                    );
                                } else {
                                    logger.debug('Network service restarted');
                                }
                            });
                    }
                }
            ]);
        }
    };
};
