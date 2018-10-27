/**
 * @module root.tasks.updateHost
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import _waitOn from 'wait-on';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const updateAptSourceListCommands = [
    '# ---------- Remove existing sources ----------',
    'rm -f /etc/apt/sources.list.d/*',

    '# ---------- Configure the no subscription source ----------',
    [
        'echo',
        '"deb http://download.proxmox.com/debian/pve stretch pve-no-subscription"',
        '> /etc/apt/sources.list.d/pve-install-repo.list'
    ].join(' ')
];

const downloadProxmoxCommands = [
    '# ---------- Get GPG key ----------',
    [
        'wget http://download.proxmox.com/debian/proxmox-ve-release-5.x.gpg',
        '-O /etc/apt/trusted.gpg.d/proxmox-ve-release-5.x.gpg'
    ].join(' ')
];

const updateHostCommands = [
    '# ---------- Update apt ----------',
    'apt update',

    '# ---------- Upgrade host ----------',
    'apt -y dist-upgrade'
];

const rebootCommands = ['# ---------- Reboot ----------', 'reboot now'];

/**
 * Returns a task that can be used to perform system updates on the remote host.
 * @param hostInfo Informtation about the remote host against which the task
 *        will be executed.
 *
 * @return ITaskDefinition A task definition that can be used to execute the
 *         task.
 */
export const getTask = (hostInfo: IRemoteHostInfo): ITaskDefinition => {
    return {
        title: 'Update host system',
        task: () => {
            const logger = _loggerProvider.getLogger('update-host');
            return new Listr([
                {
                    title: 'Update apt source list',
                    task: () => {
                        logger.debug('Updating apt source list');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(updateAptSourceListCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error updating apt source list'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Source list updated');
                            });
                    }
                },
                {
                    title: 'Download proxmox gpg key',
                    task: () => {
                        logger.debug('Downloading proxmox GPG key');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(downloadProxmoxCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error downloading proxmox GPG key'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Proxmox GPG key downloaded');
                            });
                    }
                },
                {
                    title: 'Upgrade host system',
                    task: () => {
                        const sshClient = new SshClient(hostInfo);
                        logger.debug('Upgrading host system');
                        return sshClient
                            .run(updateHostCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error upgrading host system'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Host system upgraded');
                            });
                    }
                },
                {
                    title: 'Request system reboot',
                    task: () => {
                        const sshClient = new SshClient(hostInfo);
                        logger.debug('Requesting system reboot');
                        return sshClient.run(rebootCommands).then((results) => {
                            logger.trace(results);
                            if (results.failureCount > 0) {
                                logger.warn(
                                    'System reboot request returned an error. Ignoring.'
                                );
                            } else {
                                logger.debug('System reboot requested');
                            }
                        });
                    }
                },
                {
                    title: 'Wait for system restart',
                    task: () => {
                        const { host, port } = hostInfo;
                        logger.debug('Waiting for server to restart');
                        return _waitOn({
                            resources: [`tcp:${host}:${port}`],
                            delay: 5000,
                            interval: 1000,
                            timeout: 180000
                        }).then(
                            (results) => {
                                logger.debug('Server is now reachable');
                                logger.trace({ results });
                            },
                            (err) => {
                                logger.error(
                                    err,
                                    'Timeout waiting for server to come up'
                                );
                                throw err;
                            }
                        );
                    }
                }
            ]);
        }
    };
};
