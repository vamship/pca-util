/**
 * @module root.tasks.configureDhcp
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const checkConfigRequiredCommands = [
    '# ---------- Check if dhcp server has already been configured ----------',
    'grep -iq "vmbr300" /etc/default/isc-dhcp-server'
];

const installDhcpServerCommands = [
    '# ---------- Update apt ----------',
    'apt update',

    '# ---------- Install DHCP server ----------',
    'apt install -y isc-dhcp-server'
];

const configureDhcpServerCommands = [
    '# ---------- Update dhcp server defaults - only provide dhcp over vbmr300 ----------',
    [
        "cat <<'EOF' >> /etc/default/isc-dhcp-server",
        'INTERFACESv4="vmbr300"',
        'INTERFACESv6=""',
        '',
        'DHCPDv4_CONF=/etc/dhcp/dhcpd.conf',
        '#DHCPDv6_CONF=/etc/dhcp/dhcpd6.conf',
        'EOF'
    ].join('\n')
];

const configureDhcpDaemonCommands = [
    '# ---------- Setup DHCP subnet for internal IP addresses ----------',
    [
        "cat <<'EOF' >> /etc/dhcp/dhcpd.conf",
        'default-lease-time          3600;',
        'max-lease-time              7200;',
        '',
        'subnet 10.0.0.0 netmask 255.255.255.0 {',
        '    range 10.0.0.128 10.0.0.254;',
        '    option routers              10.0.0.1;',
        '    option subnet-mask          255.255.255.0;',
        '    option broadcast-address    10.0.0.255;',
        '    option domain-name-servers  8.8.8.8;',
        '}',
        'EOF'
    ].join('\n')
];

const restartDhcpServiceCommands = [
    '# ---------- Restart DHCP service ----------',
    'systemctl restart isc-dhcp-server.service'
];

/**
 * Returns a task that can be used to configure a DHCP server for the host.
 * This task works by installing isc-dhcp-server and writing configuration
 * data into `/etc/default/isc-dhcp-server` and to `/etc/dhcp/dhcpd.conf`.
 * A preliminary check is made to ensure that the configuration update is
 * necessary, but the test is fairly basic - it ensures that no duplicate
 * records are written, but cannot correct existing config if it is partial or
 * incorrect.
 *
 * @param hostInfo Informtation about the remote host against which the task
 *        will be executed.
 *
 * @return ITaskDefinition A task definition that can be used to execute the
 *         task.
 */
export const getTask = (hostInfo: IRemoteHostInfo): ITaskDefinition => {
    return {
        title: 'Configure DHCP',
        task: () => {
            const logger = _loggerProvider.getLogger('configure-dhcp');
            function skip(ctx) {
                if (ctx.skipDhcpConfig) {
                    logger.warn('Skipping DHCP configuration');
                    return 'DHCP already configured';
                }
                logger.debug('DHCP configuration required');
                return false;
            }

            return new Listr([
                {
                    title: 'Check if DHCP configuration is required',
                    task: (ctx, task) => {
                        logger.trace(
                            'Checking if DHCP configuration is required'
                        );
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(checkConfigRequiredCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    logger.debug('DHCP configuration required');
                                    ctx.skipDhcpConfig = false;
                                } else {
                                    logger.warn('DHCP already configured');
                                    ctx.skipDhcpConfig = true;
                                }
                            });
                    }
                },
                {
                    title: 'Install DHCP server',
                    skip,
                    task: () => {
                        logger.trace('Install DHCP server');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(installDhcpServerCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error installing DHCP server'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('DHCP server installed');
                            });
                    }
                },
                {
                    title: 'Configure DHCP server defaults',
                    skip,
                    task: () => {
                        logger.trace('Configure DHCP server defaults');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(configureDhcpServerCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error configuring DHCP server defaults'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('DHCP server configured');
                            });
                    }
                },
                {
                    title: 'Configure DHCP daemon',
                    skip,
                    task: () => {
                        logger.trace('Configure DHCP daemon');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(configureDhcpDaemonCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error configuring DHCP daemon'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('DHCP daemon configured');
                            });
                    }
                },
                {
                    title: 'Restart DHCP service',
                    skip,
                    task: () => {
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(restartDhcpServiceCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    logger.warn(
                                        'DHCP service restart returned an error. Ignoring.'
                                    );
                                } else {
                                    logger.debug('DHCP service restarted');
                                }
                            });
                    }
                }
            ]);
        }
    };
};
