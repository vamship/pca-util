/**
 * @module root.tasks.setupTemplateEnvironment
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const downloadImageCommands = [
    [
        '# ---------- Download the VM image from Ubuntu ----------',
        'wget https://cloud-images.ubuntu.com/bionic/current/bionic-server-cloudimg-amd64.img'
    ].join('\n')
];
const createTemporarySshKeysCommands = [
    [
        '# ---------- Generate SSH keys for the template ----------',
        "ssh-keygen -t rsa -b 4096 -C 'kube@template' -f ~/.ssh/id_rsa_template -N ''"
    ].join('\n'),
    [
        '# ---------- Generate empty ssh key (required to remove ssh keys from cloud init) ----------',
        ["cat <<'EOF' > nokey", '', 'EOF'].join('\n')
    ].join('\n')
];

/**
 * Returns a task that can be used to setup a template build environment on the
 * server.
 *
 * @param hostInfo Informtation about the remote host against which the task
 *        will be executed.
 *
 * @return ITaskDefinition A task definition that can be used to execute the
 *         task.
 */
export const getTask = (hostInfo: IRemoteHostInfo): ITaskDefinition => {
    return {
        title: 'Setup template build environment',
        task: () => {
            const logger = _loggerProvider.getLogger('setup-template-env');
            return new Listr([
                {
                    title: 'Download template image',
                    task: () => {
                        logger.trace('Download template image');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(downloadImageCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error downloading template image'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Template image downloaded');
                            });
                    }
                },
                {
                    title: 'Create temporary ssh keys',
                    task: () => {
                        logger.trace('Create temporary ssh keys');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(createTemporarySshKeysCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error creating temporary ssh keys'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Temporary ssh keys created');
                            });
                    }
                }
            ]);
        }
    };
};
