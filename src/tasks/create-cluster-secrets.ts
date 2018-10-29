/**
 * @module root.tasks.createClusterSecrets
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import { HOST_CERTS_DIR, HOST_TEMP_DIR } from '../consts';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const ensureWorkingDirectoriesCommands = [
    '# ---------- Ensure that working directories exist ----------',
    `mkdir -p ${HOST_CERTS_DIR}`,
    `mkdir -p ${HOST_TEMP_DIR}`
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

    '# ---------- Copy CA cert and key from master ----------',
    `scp k8s-master:certs/ca.crt ${HOST_CERTS_DIR}`,
    `scp k8s-master:certs/ca.key ${HOST_CERTS_DIR}`,

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

const generateK8sClientCredentialsCommands = [
    '# ---------- Generate client key pair ----------',
    `openssl genrsa -out ${HOST_CERTS_DIR}/k8s-client.key.pem 4096`,

    '# ---------- Generte CSR using client key pair ----------',
    [
        'openssl req',
        '-new',
        '-sha256',
        `-key ${HOST_CERTS_DIR}/k8s-client.key.pem`,
        `-out ${HOST_CERTS_DIR}/k8s-client.csr.pem`,
        '-days 1095',
        "-subj '/C=US/ST=Massachusetts/L=Boston/O=system:masters/CN=k8s-client'"
    ].join(' '),

    '# ---------- Create client certificate ----------',
    [
        'openssl x509',
        '-req',
        `-CA ${HOST_CERTS_DIR}/ca.crt`,
        `-CAkey ${HOST_CERTS_DIR}/ca.key`,
        '-CAcreateserial',
        `-in ${HOST_CERTS_DIR}/k8s-client.csr.pem`,
        `-out ${HOST_CERTS_DIR}/k8s-client.cert.pem`
    ].join(' ')
];

const generateKubeconfigFileCommands = [
    '# ---------- Generate kubeconfig file ----------',
    [
        `cat > ${HOST_TEMP_DIR}/kubeconfig << EOF`,
        'apiVersion: v1',
        'kind: Config',
        'preferences: {}',
        'clusters:',
        '- cluster:',
        '    server: https://10.0.0.64:6443',
        `    certificate-authority-data: $(openssl base64 -in ${HOST_CERTS_DIR}/ca.crt| tr -d '\n')`,
        '  name: kubernetes',
        'users:',
        '- name: k8s-client',
        '  user:',
        `    client-certificate-data: $(openssl base64 -in ${HOST_CERTS_DIR}/k8s-client.cert.pem|tr -d '\n')`,
        `    client-key-data: $(openssl base64 -in ${HOST_CERTS_DIR}/k8s-client.key.pem|tr -d '\n')`,
        'contexts:',
        '- context:',
        '    cluster: kubernetes',
        '    user: k8s-client',
        '  name: k8s-client@kubernetes',
        'current-context: k8s-client@kubernetes',
        'EOF'
    ].join('\n')
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
    `scp ${HOST_TEMP_DIR}/kubeconfig k8s-master:secrets/`,
    `scp ${HOST_CERTS_DIR}/helm-ca.cert.pem k8s-master:secrets/`,
    `scp ${HOST_CERTS_DIR}/helm.cert.pem k8s-master:secrets/`,
    `scp ${HOST_CERTS_DIR}/helm.key.pem k8s-master:secrets/`,
    `scp ${HOST_CERTS_DIR}/tiller.cert.pem k8s-master:secrets/`,
    `scp ${HOST_CERTS_DIR}/tiller.key.pem k8s-master:secrets/`
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
                },
                {
                    title: 'Generate credentials for kubernetes access',
                    task: () => {
                        logger.trace(
                            'Generate credentials for kubernetes access'
                        );
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(generateK8sClientCredentialsCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error generating client credentials'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Client credentials generated');
                            });
                    }
                },
                {
                    title: 'Generate kubeconfig file using client credentials',
                    task: () => {
                        logger.trace(
                            'Generate kubeconfig file using client credentials'
                        );
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(generateKubeconfigFileCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error generating kubeconfig file'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Kubeconfig file generated');
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
                }
            ]);
        }
    };
};
