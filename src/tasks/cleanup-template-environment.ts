/**
 * @module root.tasks.cleanupTemplateEnvironment
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const deleteImageCommands = [
    [
        '# ---------- Delete downloaded VM image ----------',
        'rm -f bionic-server-cloudimg-amd64.img'
    ].join('\n')
];
const deleteTemporarySshKeysCommands = [
    [
        '# ---------- Delete temporary ssh keys ----------',
        'rm -f ~/.ssh/id_rsa_template* ./nokey'
    ].join('\n')
];
const cleanupKnownHostsFileCommands = [
    [
        '# ---------- Clean up known_hosts file ----------',
        'cat /dev/null > ~/.ssh/known_hosts'
    ].join('\n')
];

/**
 * Returns a task that can be used to cleanup a template build environment on the
 * remote host.
 *
 * @param hostInfo Informtation about the remote host against which the task
 *        will be executed.
 *
 * @return ITaskDefinition A task definition that can be used to execute the
 *         task.
 */
export const getTask = (hostInfo: IRemoteHostInfo): ITaskDefinition => {
    return {
        title: 'Cleanup template build environment',
        task: () => {
            const logger = _loggerProvider.getLogger('cleanup-template-env');
            return new Listr([
                {
                    title: 'Delete downloaded template image',
                    task: () => {
                        logger.trace('Delete template image');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(deleteImageCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error deleting template image'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Template image deleted');
                            });
                    }
                },
                {
                    title: 'Delete temporary ssh keys',
                    task: () => {
                        logger.trace('Delete temporary ssh keys');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(deleteTemporarySshKeysCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error deleting temporary ssh keys'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Temporary ssh keys deleted');
                            });
                    }
                },
                {
                    title: 'Clean up entries in known_hosts file',
                    task: () => {
                        logger.trace('Clean up known_hosts file');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(cleanupKnownHostsFileCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error cleaning up known_hosts file'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('known_hosts file cleaned up');
                            });
                    }
                }
            ]);
        }
    };
};
