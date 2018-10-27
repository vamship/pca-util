/**
 * @module root.tasks.setupTemplateEnvironment
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import { Promise } from 'bluebird';
import Listr from 'listr';
import { HOST_SSH_KEYS_DIR } from '../consts';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const checkInstancesRequiredCommands = [
    '# ---------- Check if the any of the kubernetes nodes have been created ----------',
    'qm status 401 1>/dev/null 2>&1'
];

const ensureWorkingDirectoriesCommands = [
    '# ---------- Ensure that working directories exist ----------',
    `mkdir -p ${HOST_SSH_KEYS_DIR}`
];

const createSshKeysCommands = [
    '# ---------- Generate SSH key for master and nodes ----------',

    `ssh-keygen -t rsa -b 4096 -C 'kube@k8s' -f ${HOST_SSH_KEYS_DIR}/id_rsa_k8s_master -N ''`,
    `ssh-keygen -t rsa -b 4096 -C 'kube@k8s' -f ${HOST_SSH_KEYS_DIR}/id_rsa_k8s_node_1 -N ''`,
    `ssh-keygen -t rsa -b 4096 -C 'kube@k8s' -f ${HOST_SSH_KEYS_DIR}/id_rsa_k8s_node_2 -N ''`,
    `ssh-keygen -t rsa -b 4096 -C 'kube@k8s' -f ${HOST_SSH_KEYS_DIR}/id_rsa_k8s_node_3 -N ''`
];

const createSshConfigCommands = [
    '# ---------- Create SSH config for easy SSH into the cluster ----------',
    [
        "cat <<'EOF' >> ~/.ssh/config",
        'Host k8s-master',
        '    HostName 10.0.0.64',
        '    Port 22',
        '    User kube',
        `    IdentityFile ${HOST_SSH_KEYS_DIR}/id_rsa_k8s_master`,
        '    StrictHostKeyChecking no',
        '',
        'Host k8s-node-1',
        '    HostName 10.0.0.65',
        '    Port 22',
        '    User kube',
        `    IdentityFile ${HOST_SSH_KEYS_DIR}/id_rsa_k8s_node_1`,
        '    StrictHostKeyChecking no',
        '',
        'Host k8s-node-2',
        '    HostName 10.0.0.65',
        '    Port 22',
        '    User kube',
        `    IdentityFile ${HOST_SSH_KEYS_DIR}/id_rsa_k8s_node_2`,
        '    StrictHostKeyChecking no',
        '',
        'Host k8s-node-3',
        '    HostName 10.0.0.65',
        '    Port 22',
        '    User kube',
        `    IdentityFile ${HOST_SSH_KEYS_DIR}/id_rsa_k8snode_3`,
        '    StrictHostKeyChecking no',
        '',
        'EOF'
    ].join('\n')
];

const createMasterAndNodeInstancesCommands = [
    '# ---------- Create the master and node instances ----------',
    'qm clone 1001 401 --name k8s-master',
    'qm clone 1001 402 --name k8s-node-1',
    'qm clone 1001 403 --name k8s-node-2',
    'qm clone 1001 404 --name k8s-node-3',

    '# ---------- Set cloud init parameters on the master (default user, ssh keys, static ip) ----------',
    [
        `qm set 401 --sshkey ${HOST_SSH_KEYS_DIR}/id_rsa_k8s_master.pub`,
        '--ipconfig0 ip=10.0.0.64/24,gw=10.0.0.1 --nameserver 8.8.8.8',
        '--memory 6144 --cores 2'
    ].join(' '),
    [
        `qm set 402 --sshkey ${HOST_SSH_KEYS_DIR}/id_rsa_k8s_node_1.pub`,
        '--ipconfig0 ip=10.0.0.65/24,gw=10.0.0.1 --nameserver 8.8.8.8',
        '--memory 6144 --cores 2'
    ].join(' '),
    [
        `qm set 403 --sshkey ${HOST_SSH_KEYS_DIR}/id_rsa_k8s_node_2.pub`,
        '--ipconfig0 ip=10.0.0.66/24,gw=10.0.0.1 --nameserver 8.8.8.8',
        '--memory 6144 --cores 2'
    ].join(' '),
    [
        `qm set 404 --sshkey ${HOST_SSH_KEYS_DIR}/id_rsa_k8s_node_3.pub`,
        '--ipconfig0 ip=10.0.0.67/24,gw=10.0.0.1 --nameserver 8.8.8.8',
        '--memory 6144 --cores 1'
    ].join(' '),

    '# ---------- Start the instances ----------',
    'qm start 401',
    'qm start 402',
    'qm start 403',
    'qm start 404'
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
        title: 'Initialize instances for k8s cluster',
        task: () => {
            const logger = _loggerProvider.getLogger('init-k8s-instances');
            function skip(ctx) {
                if (ctx.skipInstanceCreation) {
                    logger.warn('Skipping instance creation');
                    return 'One or more instances already exist';
                }
                logger.debug('Instance creation required');
                return false;
            }
            return new Listr([
                {
                    title: 'Check if instances have to be created',
                    task: (ctx, task) => {
                        logger.trace('Check if instance creation is required');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(checkInstancesRequiredCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    logger.debug('Instance creation required');
                                    ctx.skipInstanceCreation = false;
                                } else {
                                    logger.warn(
                                        'One or more instances already exist'
                                    );
                                    ctx.skipInstanceCreation = true;
                                }
                            });
                    }
                },
                {
                    title: 'Ensure that working directories exist',
                    skip,
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
                    title: 'Create SSH keys for instances',
                    skip,
                    task: () => {
                        logger.trace('Create SSH keys for instances');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(createSshKeysCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error creating SSH keys'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Instance SSH keys created');
                            });
                    }
                },
                {
                    title: 'Create SSH config for easy SSH to instances',
                    skip,
                    task: () => {
                        logger.trace(
                            'Create SSH config for easy SSH to instances'
                        );
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(createSshConfigCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error creating SSH config'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('SSH config created');
                            });
                    }
                },
                {
                    title: 'Create master and node instances',
                    skip,
                    task: () => {
                        logger.trace('Create master and node instances');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(createMasterAndNodeInstancesCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error creating master and/or node instances'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug(
                                    'Master and node instances created'
                                );
                            });
                    }
                },
                {
                    title: 'Wait for instances to startup',
                    skip,
                    task: () => {
                        return Promise.delay(180000);
                    }
                }
            ]);
        }
    };
};
