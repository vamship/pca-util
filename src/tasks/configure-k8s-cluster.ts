/**
 * @module root.tasks.setupTemplateEnvironment
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import { Promise } from 'bluebird';
import Listr from 'listr';
import { HOST_CERTS_DIR } from '../consts';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const ensureWorkingDirectoriesCommands = [
    [
        '# ---------- Ensure that working directories exist ----------',
        `mkdir -p ${HOST_CERTS_DIR}`
    ].join('\n')
];

const createCACertCommands = [
    [
        '# ---------- Create key pair for CA certs ----------',
        `openssl genrsa -out ${HOST_CERTS_DIR}/ca.key 4096`
    ].join('\n'),
    [
        '# ---------- Generate CA cert from key pair ----------',
        [
            'openssl req',
            `-key ${HOST_CERTS_DIR}/ca.key`,
            `-out ${HOST_CERTS_DIR}/ca.crt`,
            '-new -x509',
            '-days 7300',
            '-sha256',
            '-extensions v3_ca',
            "-subj '/C=US/ST=Massachusetts/L=Boston/CN=K8S CA'"
        ].join(' ')
    ].join('\n')
];

// const configureMasterCommands = [
//     [
//         '# ---------- Copy CA certs to master node ----------',
//         'scp -r ~/certs k8s-master:'
//     ].join('\n'),
//     [
//         '# ---------- Get cluster join token ----------',
//         "ssh k8s-master 'kubeadm token generate'"
//     ].join('\n')
// ];

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
        title: 'Configure a kubernetes cluster on existing instances',
        task: () => {
            const logger = _loggerProvider.getLogger('configure-k8s-cluster');
            logger.trace(Promise);
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
                    title: 'Create CA certs for the cluster',
                    task: () => {
                        logger.trace('Create CA certs for the cluster');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(createCACertCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error creating CA cert'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug(
                                    'Cluster CA certs for the cluster'
                                );
                            });
                    }
                }
            ]);
        }
    };
};
