/**
 * @module root.tasks.createClusterSecrets
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import { HOST_CERTS_DIR, HOST_TEMP_DIR } from '../consts';
import { IServerInfo, ITaskDefinition } from '../types';

const ensureWorkingDirectoriesCommands = [
    '# ---------- Ensure that working directories exist ----------',
    `mkdir -p ${HOST_CERTS_DIR}`,
    `mkdir -p ${HOST_TEMP_DIR}`
];

const generateHelmCredentialsCommands = [
    '# ---------- Create keys pairs for CA and certificates ----------',
    `openssl genrsa -out ${HOST_CERTS_DIR}/helm-ca.key.pem 4096`,
    `openssl genrsa -out ${HOST_CERTS_DIR}/helm.key.pem 4096`,
    `openssl genrsa -out ${HOST_CERTS_DIR}/tiller.key.pem 4096`,

    '# ---------- Generate helm CA certificate ----------',
    [
        'openssl req',
        `-key ${HOST_CERTS_DIR}/helm-ca.key.pem`,
        '-new -x509',
        '-days 7300',
        '-sha256',
        `-out ${HOST_CERTS_DIR}/helm-ca.cert.pem`,
        '-extensions v3_ca',
        "-subj '/C=US/ST=Massachusetts/L=Boston/CN=Helm CA'"
    ].join(' '),

    '# ---------- Generate CSRs for helm and tiller ----------',
    [
        'openssl req',
        '-new',
        '-sha256',
        `-key ${HOST_CERTS_DIR}/helm.key.pem`,
        `-out ${HOST_CERTS_DIR}/helm.csr.pem`,
        '-days 1095',
        "-subj '/C=US/ST=Massachusetts/L=Boston/CN=Helm'"
    ].join(' '),
    [
        'openssl req',
        '-new',
        '-sha256',
        `-key ${HOST_CERTS_DIR}/tiller.key.pem`,
        `-out ${HOST_CERTS_DIR}/tiller.csr.pem`,
        '-days 1095',
        "-subj '/C=US/ST=Massachusetts/L=Boston/CN=Tiller'"
    ].join(' '),

    '# ---------- Create helm and tiller certificates ----------',
    [
        'openssl x509',
        '-req',
        `-CA ${HOST_CERTS_DIR}/helm-ca.cert.pem`,
        `-CAkey ${HOST_CERTS_DIR}/helm-ca.key.pem`,
        '-CAcreateserial',
        `-in ${HOST_CERTS_DIR}/helm.csr.pem`,
        `-out ${HOST_CERTS_DIR}/helm.cert.pem`
    ].join(' '),
    [
        'openssl x509',
        '-req',
        `-CA ${HOST_CERTS_DIR}/helm-ca.cert.pem`,
        `-CAkey ${HOST_CERTS_DIR}/helm-ca.key.pem`,
        '-CAcreateserial',
        `-in ${HOST_CERTS_DIR}/tiller.csr.pem`,
        `-out ${HOST_CERTS_DIR}/tiller.cert.pem`
    ].join(' ')
];

const copyCredentialsToMasterCommands = [
    '# ---------- Create temporary directory on master ----------',
    [
        "ssh k8s-master <<'END_SCRIPT'",

        '# ---------- Echo commands ----------',
        'set -x',

        '# ---------- Create temporary directory in $HOME ----------',
        'mkdir -p $HOME/secrets',

        'END_SCRIPT'
    ].join('\n'),
    '# ---------- Copy kubeconfig and helm secrets to master ----------',
    `scp ${HOST_CERTS_DIR}/helm-ca.cert.pem k8s-master:secrets/`,
    `scp ${HOST_CERTS_DIR}/helm-ca.key.pem k8s-master:secrets/`,
    `scp ${HOST_CERTS_DIR}/helm.cert.pem k8s-master:secrets/`,
    `scp ${HOST_CERTS_DIR}/helm.key.pem k8s-master:secrets/`,
    `scp ${HOST_CERTS_DIR}/tiller.cert.pem k8s-master:secrets/`,
    `scp ${HOST_CERTS_DIR}/tiller.key.pem k8s-master:secrets/`
];

const createHelmSecretsCommand = [
    '# ---------- Create helm and tiller secrets ----------',
    [
        "ssh k8s-master <<'END_SCRIPT'",

        '# ---------- Echo commands ----------',
        'set -x',

        '# ---------- Create helm secret ----------',
        [
            'kubectl create secret tls svm-helm-certificate --namespace kube-system',
            `--cert /home/kube/secrets/helm.cert.pem`,
            `--key /home/kube/secrets/helm.key.pem`
        ].join(' '),

        '# ---------- Create tiller secret ----------',
        [
            'kubectl create secret tls svm-tiller-certificate --namespace kube-system',
            `--cert /home/kube/secrets/tiller.cert.pem`,
            `--key /home/kube/secrets/tiller.key.pem`
        ].join(' '),

        '# ---------- Create helm CA secret ----------',
        [
            'kubectl create secret tls svm-helm-ca-certificate --namespace kube-system',
            `--cert /home/kube/secrets/helm-ca.cert.pem`,
            `--key /home/kube/secrets/helm-ca.key.pem`
        ].join(' '),

        'END_SCRIPT'
    ].join('\n')
];

const deleteTemporaryFilesFromMasterCommands = [
    '# ---------- Delete temporary files from master ----------',
    [
        "ssh k8s-master <<'END_SCRIPT'",

        '# ---------- Echo commands ----------',
        'set -x',

        '# ---------- Delete temporary directory in $HOME ----------',
        'rm -rf $HOME/secrets',

        'END_SCRIPT'
    ].join('\n')
];

function _getCreateServerManagerSecretCommands(serverId, serverKey) {
    return [
        '# ---------- Create server manager secret ----------',
        [
            "ssh k8s-master <<'END_SCRIPT'",

            '# ---------- Echo commands ----------',
            'set -x',

            '# ---------- Create kubernetes secret object ----------',
            [
                'kubectl create secret generic svm-server-identity --namespace kube-system',
                `--from-literal serverId=${serverId}`,
                `--from-literal serverKey=${serverKey}`
            ].join(' '),

            'END_SCRIPT'
        ].join('\n')
    ];
}

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
export const getTask = (hostInfo: IServerInfo): ITaskDefinition => {
    return {
        title: 'Create core secrets required for the server manager agent',
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
                    title: 'Generate helm/tiller certificates',
                    task: () => {
                        logger.trace('Generate helm/tiller certificates');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(generateHelmCredentialsCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error generating helm credentials'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Helm credentials generated');
                            });
                    }
                },
                {
                    title: 'Copy credentials to master',
                    task: () => {
                        logger.trace('Copy credentials to master');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(copyCredentialsToMasterCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error copying credentials to master'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Credentials copied to master');
                            });
                    }
                },
                {
                    title: 'Create server manager secret',
                    task: () => {
                        logger.trace('Create server manager secret');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(
                                _getCreateServerManagerSecretCommands(
                                    hostInfo.serverId,
                                    hostInfo.serverSecret
                                )
                            )
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error creating server manager secret'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Server manager secret created');
                            });
                    }
                },
                {
                    title: 'Create helm secrets',
                    task: () => {
                        logger.trace('Create helm secrets');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(createHelmSecretsCommand)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error creating helm secrets'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Helm secrets created');
                            });
                    }
                },
                {
                    title: 'Delete temporary files from master',
                    task: () => {
                        logger.trace('Delete temporary files from master');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(deleteTemporaryFilesFromMasterCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error deleting temporary files from master'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug(
                                    'Temporary files deleted from master'
                                );
                            });
                    }
                }
            ]);
        }
    };
};
