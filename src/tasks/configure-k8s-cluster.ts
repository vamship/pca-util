/**
 * @module root.tasks.configureK8sCluster
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import { HOST_TEMP_DIR } from '../consts';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const ensureWorkingDirectoriesCommands = [
    '# ---------- Ensure that working directories exist ----------',
    `mkdir -p ${HOST_TEMP_DIR}`
];

const configureMasterCommands = [
    '# ---------- Initialize the master using flannel ----------',
    [
        "ssh k8s-master <<'END_SCRIPT'",

        '# ---------- Echo commands ----------',
        'set -x',

        '# ---------- Initialize the master and configure credentials for kubectl ----------',
        'sudo kubeadm init --pod-network-cidr=10.244.0.0/16',

        '# ---------- Copy credentials to home directory ----------',
        'mkdir -p $HOME/.kube',
        'sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config',
        'sudo chown $(id -u):$(id -g) $HOME/.kube/config',

        '# ---------- Configure pod network add on (flannel) ----------',
        // See https://github.com/coreos/flannel/issues/1044
        // This pull request has been merged, but not published as part of a new
        // release. Using the original pull request reference is the safest way
        // to ensure that this configuration is applied consistently
        [
            'kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/',
            'bc79dd1505b0c8681ece4de4c0d86c5cd2643275/Documentation/kube-flannel.yml'
        ].join(''),

        'END_SCRIPT'
    ].join('\n')
];

const getJoinCommand = [
    '# ---------- Get cluster join token ----------',
    `ssh k8s-master 'kubeadm token create --print-join-command'> ${HOST_TEMP_DIR}/join-command`
];

function _getConfigureNodeCommands(nodeName: string): string[] {
    return [
        `# ---------- Join node ${nodeName} to the cluster ----------`,
        `ssh k8s-${nodeName} "sudo $(cat ${HOST_TEMP_DIR}/join-command)"`
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
export const getTask = (hostInfo: IRemoteHostInfo): ITaskDefinition => {
    return {
        title: 'Configure a kubernetes cluster on existing instances',
        task: () => {
            const logger = _loggerProvider.getLogger('configure-k8s-cluster');
            function getNodeConfigTask(
                nodeNumber: number
            ): { title: string; task: () => Promise<any> } {
                return {
                    title: `Configure node ${nodeNumber}`,
                    task: () => {
                        logger.trace(`Configure node ${nodeNumber}`);
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(
                                _getConfigureNodeCommands(`node-${nodeNumber}`)
                            )
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        `Error configuring node ${nodeNumber}`
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug(`Node ${nodeNumber} configured`);
                            });
                    }
                };
            }
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
                    title: 'Configure cluster master',
                    task: () => {
                        logger.trace('Configure cluster master');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(configureMasterCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error configuring cluster master'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Cluster master configured');
                            });
                    }
                },
                {
                    title: 'Obtain join command from master',
                    task: () => {
                        logger.trace('Obtain join command from master');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient.run(getJoinCommand).then((results) => {
                            logger.trace(results);
                            if (results.failureCount > 0) {
                                const err = new Error(
                                    'Error obtaining join command from master'
                                );
                                logger.error(err);
                                throw err;
                            }
                            logger.debug('Join command obtained from master');
                        });
                    }
                },
                getNodeConfigTask(1),
                getNodeConfigTask(2),
                getNodeConfigTask(3)
            ]);
        }
    };
};
