/**
 * @module root.tasks.setupTemplateEnvironment
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import { Promise } from 'bluebird';
import Listr from 'listr';
import { HOST_CERTS_DIR, HOST_TEMP_DIR } from '../consts';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const ensureWorkingDirectoriesCommands = [
    '# ---------- Ensure that working directories exist ----------',
    `mkdir -p ${HOST_CERTS_DIR}`,
    `mkdir -p ${HOST_TEMP_DIR}`
];

const createCACertCommands = [
    '# ---------- Create key pair for CA certs ----------',
    `openssl genrsa -out ${HOST_CERTS_DIR}/ca.key 4096`,

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
];

// const prepareClusterCreationCommands = [
//     '# ---------- Get cluster join token ----------',
//     `ssh k8s-master 'kubeadm token generate' > ${HOST_TEMP_DIR}/join-token`,

//     '# ---------- Get CA cert hash ----------',
//     [
//         `openssl x509 -in ${HOST_CERTS_DIR}/ca.crt -noout -pubkey|`,
//         'openssl rsa -pubin -outform DER 2>/dev/null | sha256sum |',
//         'cut -d'` -f1 > ${HOST_TEMP_DIR}/ca-cert-hash`
//     ].join(' ')
// ];

// const configureMasterCommands = [
//     '# ---------- Copy CA certs and other files to master node ----------',
//     `ssh k8s-master 'mkdir -p k8s-setup'`,
//     `scp -r ${HOST_CERTS_DIR} k8s-master:k8s-setup/`,
//     `scp ${HOST_TEMP_DIR}/join-token k8s-master:k8s-setup/`,
//     `scp ${HOST_TEMP_DIR}/ca-cert-hash k8s-master:k8s-setup/`,
//     [
//         '# ---------- Initialize the master using flannel ----------',
//         "ssh k8s-master <<'END_SCRIPT'",

//         '# ---------- Echo commands ----------',
//         'set -x',

//         '# ---------- Initialize the master and configure credentials for kubectl ----------',
//         [
//             'sudo kubeadm init --pod-network-cidr=10.244.0.0/16',
//             '--cert-dir /home/kube/k8s-setup/certs',
//             '--token $(cat /home/kube/k8s-setup/join-token)'
//         ].join(' '),

//         '# ---------- Configure pod network add on (flannel) ----------',
//         'kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/v0.10.0/Documentation/kube-flannel.yml',

//         'END_SCRIPT'
//     ].join('\n')
// ];

// function _getConfigureNodeCommands(nodeName: string): string[] {
//     return [
//         `# ---------- Copy join token and ca hash to node ${nodeName} ----------`,
//         `ssh k8s-${nodeName} 'mkdir -p k8s-setup'`,
//         `scp ${HOST_TEMP_DIR}/join-token k8s-master:k8s-setup/`,
//         `scp ${HOST_TEMP_DIR}/ca-cert-hash k8s-master:k8s-setup/`,

//         `# ---------- Join node ${nodeName} to the cluster ----------`,
//         [
//             'kubeadm join 10.0.0.64:6443',
//             '--token $(cat /home/kube/k8s-setup/join-token)',
//             '--discovery-token-ca-cert-hash sha256:$(cat /home/kube/k8s-setup/ca-cert-hash)'
//         ].join(' ')
//     ];
// }

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
