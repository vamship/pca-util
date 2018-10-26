/**
 * @module root.tasks.setupTemplateEnvironment
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const checkImageDownloadRequiredCommands = [
    [
        '# ---------- Check if the VM image already exists on disk ----------',
        'stat ~/_pca_working/images/bionic-server-cloudimg-amd64.img 1>/dev/null 2>&1'
    ].join('\n')
];
const checkTemporarySshKeysRequiredCommands = [
    [
        '# ---------- Check if the VM image already exists on disk ----------',
        'stat ~/.ssh/id_rsa_template 1>/dev/null 2>&1'
    ].join('\n')
];
const downloadImageCommands = [
    [
        '# ---------- Ensure working directory ----------',
        'mkdir -p ~/_pca_working/images'
    ].join('\n'),
    [
        '# ---------- Download the VM image from Ubuntu ----------',
        [
            'wget https://cloud-images.ubuntu.com/bionic/current/bionic-server-cloudimg-amd64.img',
            '-O ~/_pca_working/images/bionic-server-cloudimg-amd64.img'
        ].join(' ')
    ].join('\n')
];
const createTemporarySshKeysCommands = [
    [
        '# ---------- Generate SSH keys for the template ----------',
        "ssh-keygen -t rsa -b 4096 -C 'kube@template' -f ~/.ssh/id_rsa_template -N ''"
    ].join('\n'),
    [
        '# ---------- Ensure working directory ----------',
        'mkdir -p ~/_pca_working/keys'
    ].join('\n'),
    [
        '# ---------- Generate empty ssh key (required to remove ssh keys from cloud init) ----------',
        ["cat <<'EOF' > ~/_pca_working/keys/nokey", '', 'EOF'].join('\n')
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
                    title: 'Check if template image download is required',
                    task: (ctx, task) => {
                        logger.trace(
                            'Check if template image download is required'
                        );
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(checkImageDownloadRequiredCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    logger.debug(
                                        'Template image download required'
                                    );
                                    ctx.skipTemplateImageDownload = false;
                                } else {
                                    logger.warn(
                                        'Template image already downloaded'
                                    );
                                    ctx.skipTemplateImageDownload = true;
                                }
                            });
                    }
                },
                {
                    title: 'Check if temporary SSH keys have to be created',
                    task: (ctx, task) => {
                        logger.trace(
                            'Check if temporary SSH keys have to be created'
                        );
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(checkTemporarySshKeysRequiredCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    logger.debug(
                                        'Temporary SSH keys must be created'
                                    );
                                    ctx.skipTemporaryKeyCreation = false;
                                } else {
                                    logger.warn(
                                        'Temporary SSH keys already exist'
                                    );
                                    ctx.skipTemporaryKeyCreation = true;
                                }
                            });
                    }
                },
                {
                    title: 'Download template image',
                    skip: (ctx) => {
                        if (ctx.skipTemplateImageDownload) {
                            logger.warn('Skipping template image download');
                            return 'Template image already downloaded';
                        }
                        logger.debug('Template image download required');
                        return false;
                    },
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
                    title: 'Create temporary SSH keys',
                    skip: (ctx) => {
                        if (ctx.skipTemporaryKeyCreation) {
                            logger.warn('Skipping temporary SSH key creation');
                            return 'Temporary SSH keys already exist';
                        }
                        logger.debug('Temporary SSH key creation required');
                        return false;
                    },
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
