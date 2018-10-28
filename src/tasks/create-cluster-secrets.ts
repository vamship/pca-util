/**
 * @module root.tasks.createClusterSecrets
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import { HOST_CERTS_DIR } from '../consts';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const ensureWorkingDirectoriesCommands = [
    '# ---------- Ensure that working directories exist ----------',
    `mkdir -p ${HOST_CERTS_DIR}`
];

const copyCaCertsCommands = [
    '# ---------- Create temporary CA cert copies on master ----------',
    [
        "ssh k8s-master <<'END_SCRIPT'",

        '# ---------- Echo commands ----------',
        'set -x',

        '# ---------- Create temporary directory in $HOME ----------',
        'mkdir -p $HOME/certs',

        '# ---------- Copy CA certs from /etc/kubernetes/pki ----------',
        'sudo cp -i /etc/kubernetes/pki/ca.crt $HOME/certs/ca.crt',
        'sudo cp -i /etc/kubernetes/pki/ca.key $HOME/certs/ca.key',

        '# ---------- Change ownership of the CA cert and key ----------',
        'sudo chown $(id -u):$(id -g) $HOME/certs/ca.crt',
        'sudo chown $(id -u):$(id -g) $HOME/certs/ca.key',

        'END_SCRIPT'
    ].join('\n'),

    '# ---------- Copy CA cert from master ----------',
    `scp -r k8s-master:certs/ ${HOST_CERTS_DIR}`,

    '# ---------- Clean up temporary copy of CA certs on master ----------',
    [
        "ssh k8s-master <<'END_SCRIPT'",

        '# ---------- Echo commands ----------',
        'set -x',

        '# ---------- Cleanup temporary CA certs directory ----------',
        'rm -rf $HOME/certs',

        'END_SCRIPT'
    ].join('\n')
];

/**
 * Returns a task that can be used to create instances for the kubernetes
 * cluster. This task creates both master and regular nodes. A preliminary check
 * is performed to see if the master node already exists, and if it does, all
 * further processing is skipped.
 *
 * @param hostInfo Informtation about the remote host against which the task
 *        will be executed.
 *
 * @return ITaskDefinition A task definition that can be used to execute the
 *         task.
 */
export const getTask = (hostInfo: IRemoteHostInfo): ITaskDefinition => {
    return {
        title: 'Create core secrets required for deploying apps on the cluster',
        task: () => {
            const logger = _loggerProvider.getLogger('configure-k8s-cluster');
            return new Listr([
                {
                    title: 'Ensure that working directories exist',
                    task: () => {
                        logger.trace('Ensuring that working directories exist');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(ensureWorkingDirectoriesCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error ensuring working directories'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug(
                                    'Working directories created (or already exist)'
                                );
                            });
                    }
                },
                {
                    title: 'Copy CA certs from master',
                    task: () => {
                        logger.trace('Copy CA certs from master');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(copyCaCertsCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error copying CA certs from master'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('CA certs copied from master');
                            });
                    }
                }
            ]);
        }
    };
};
