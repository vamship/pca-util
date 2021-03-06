/**
 * @module root.tasks.buildBaselineTemplate
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import { Promise } from 'bluebird';
import Listr from 'listr';
import { HOST_SSH_KEYS_DIR } from '../consts';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const checkBuildRequiredCommands = [
    '# ---------- Check if baseline template already exists ----------',
    'qm status 1001 1>/dev/null 2>&1'
];

const ensureWorkingDirectoriesCommands = [
    '# ---------- Ensure that working directories exist ----------',
    `mkdir -p ${HOST_SSH_KEYS_DIR}`
];

const cloneBaselineTemplateCommands = [
    '# ---------- Copy the baseline template ----------',
    'qm clone 1000 1001 --name k8s-node',

    '# ---------- Configure the template with ip address and ssh key ----------',
    [
        `qm set 1001 --ciuser kube --sshkey ${HOST_SSH_KEYS_DIR}/id_rsa_template.pub`,
        '--ipconfig0 ip=10.0.0.11/24,gw=10.0.0.1 --nameserver 8.8.8.8'
    ].join(' '),

    '# ---------- Resize disk ----------',
    'qm resize 1001 scsi0 +8G',

    '# ---------- Start an instance of the template ----------',
    'qm start 1001'
];

const installSoftwareCommands = [
    '# ---------- Install docker, kubectl, kubeadm and kubelet ----------',
    [
        `ssh -o 'StrictHostKeyChecking no' -i ${HOST_SSH_KEYS_DIR}/id_rsa_template kube@10.0.0.11 <<'END_SCRIPT'`,
        "sudo su <<'END_SUDO'",
        '',
        '# ---------- Echo commands ----------',
        'set -x',
        '',
        '# ---------- Update APT, install dependencies ----------',
        'apt-get update',
        'apt-get install -y apt-transport-https ca-certificates curl software-properties-common',
        '',
        '# ---------- Install docker ----------',
        'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -',
        [
            'add-apt-repository',
            '"deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"'
        ].join(' '),
        'apt-get update',
        [
            'apt-get install -y docker-ce=$(apt-cache madison docker-ce',
            "| grep 18.06 | head -1 | awk '{print $3}')"
        ].join(' '),
        '',
        '# ---------- Install kubectl, kubeadm and kubelet ----------',
        'curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add -',
        [
            'cat <<EOF >/etc/apt/sources.list.d/kubernetes.list',
            'deb http://apt.kubernetes.io/ kubernetes-xenial main',
            'EOF'
        ].join('\n'),
        'apt-get update',
        'apt-get install -y kubelet kubeadm kubectl',
        'apt-mark hold kubelet kubeadm kubectl',
        '',
        'END_SUDO',
        'END_SCRIPT'
    ].join('\n')
];

const cleanupTemplateCommands = [
    '# ---------- Clean up instance and prep for conversion to template ----------',
    [
        `ssh -o 'StrictHostKeyChecking no' -i ${HOST_SSH_KEYS_DIR}/id_rsa_template kube@10.0.0.11 <<'END_SCRIPT'`,
        "sudo su <<'END_SUDO'",
        '',
        '# ---------- Echo commands ----------',
        'set -x',
        '',
        '# ---------- Clean up apt cache files ----------',
        'apt clean all',
        '',
        '# ---------- Clean up log files ----------',
        'logrotate -f /etc/logrotate.conf',
        'rm -f /var/log/*.gz /var/log/*.1',
        '',
        'rm -f /var/apt/*.xz /var/apt/*.gz',
        'rm -rf /var/log/containers/*',
        'rm -rf /var/log/dist-upgrade/*',
        'rm -rf /var/log/lxd/*',
        'rm -rf /var/log/landscape/*',
        'rm -rf /var/log/journal/*',
        'rm -rf /var/log/pods/*',
        'rm -rf /var/log/unattended-upgrades/*',
        '',
        'cat /dev/null > /var/log/alternatives.log',
        'cat /dev/null > /var/log/auth.log',
        'cat /dev/null > /var/log/btmp',
        'cat /dev/null > /var/log/cloud-init-output.log',
        'cat /dev/null > /var/log/dpkg.log',
        'cat /dev/null > /var/log/kern.log',
        'cat /dev/null > /var/log/lastlog',
        'cat /dev/null > /var/log/syslog',
        'cat /dev/null > /var/log/tallylog',
        'cat /dev/null > /var/log/wtmp',
        '',
        '# ---------- Clean up temp files ----------',
        'rm -rf /tmp/*',
        'rm -rf /var/tmp/*',
        '',
        '# ---------- Clean up SSH keys ----------',
        'rm -f /etc/ssh/*key*',
        '',
        '# ---------- Clean up bash history and SSH keys for the user: kube. ----------',
        'rm -f ~kube/.bash_history',
        'rm -rf ~kube/.ssh/',
        'rm -rf ~kube/.cache/',
        'rm -rf ~kube/.gnupg/',
        'rm -f ~kube/sudo_as_admin_successful',
        '',
        '# ---------- Clean up bash history and SSH keys for the user: root. ----------',
        'rm -f ~root/.bash_history',
        'rm -rf ~root/.ssh/',
        'unset HISTFILE',
        '',
        'END_SUDO',
        'END_SCRIPT'
    ].join('\n'),

    '# ---------- Shutdown the instance ----------',
    'qm shutdown 1001',

    '# ---------- Reset ssh keys and ip configuration for the template ----------',
    `qm set 1001 --sshkeys ${HOST_SSH_KEYS_DIR}/nokey --ipconfig0 ip=dhcp`
];

const convertToTemplateCommands = [
    '# ---------- Convert the VM into a template ----------',
    'qm template 1001'
];

/**
 * Returns a task that can be used to build a template that will serve as
 * as the template for all k8s nodes.
 *
 * @param hostInfo Informtation about the remote host against which the task
 *        will be executed.
 *
 * @return ITaskDefinition A task definition that can be used to execute the
 *         task.
 */
export const getTask = (hostInfo: IRemoteHostInfo): ITaskDefinition => {
    return {
        title: 'Build k8s VM template',
        task: () => {
            const logger = _loggerProvider.getLogger('build-k8s-vm-template');
            function skip(ctx) {
                if (ctx.skipTemplateBuild) {
                    logger.warn('Skipping template build');
                    return 'Template already exists';
                }
                logger.debug('Template build required');
                return false;
            }
            return new Listr([
                {
                    title: 'Check if k8s template build is required',
                    task: (ctx, task) => {
                        logger.trace('Check if k8s template build is required');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(checkBuildRequiredCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    logger.debug('Template build required');
                                    ctx.skipTemplateBuild = false;
                                } else {
                                    logger.warn('Template already exists');
                                    ctx.skipTemplateBuild = true;
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
                    title: 'Clone and configure baseline template',
                    skip,
                    task: () => {
                        logger.trace('Clone and configure baseline template');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(cloneBaselineTemplateCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error cloning baseline into k8s VM'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug(
                                    'Cloned baseline template into k8s VM'
                                );
                            });
                    }
                },
                {
                    title: 'Wait for VM instance to start up',
                    skip,
                    task: () => {
                        return Promise.delay(180000);
                    }
                },
                {
                    title: 'Install docker, kubectl, kubeadm and kubelet',
                    skip,
                    task: () => {
                        logger.trace('Install required software on VM');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(installSoftwareCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error installing required software on VM'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug(
                                    'Required software installed on VM'
                                );
                            });
                    }
                },
                {
                    title: 'Clean up template; prep for conversion to template',
                    skip,
                    task: () => {
                        logger.trace(
                            'Clean up template; prep for conversion to template'
                        );
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(cleanupTemplateCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error cleaning up VM instance'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug(
                                    'VM instance cleaned up for conversion to template'
                                );
                            });
                    }
                },
                {
                    title: 'Convert VM into template',
                    skip,
                    task: () => {
                        logger.trace('Convert VM into template');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(convertToTemplateCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error converting VM into template'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Converted VM into template');
                            });
                    }
                }
            ]);
        }
    };
};
