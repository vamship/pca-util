/**
 * @module root.tasks.buildBaselineTemplate
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import { HOST_IMAGES_DIR } from '../consts';
import { IRemoteHostInfo, ITaskDefinition } from '../types';

const checkBuildRequiredCommands = [
    '# ---------- Check if baseline template already exists ----------',
    'qm status 1000 1>/dev/null 2>&1'
];

const ensureWorkingDirectoriesCommands = [
    '# ---------- Ensure that working directories exist ----------',
    `mkdir -p ${HOST_IMAGES_DIR}`
];

const createVmCommands = [
    '# ---------- Create baseline VM ----------',
    [
        'qm create 1000 --name baseline --memory 2048 --cores 1 --socket 1',
        '--net0 virtio,bridge=vmbr300 --ide2 local-lvm:cloudinit',
        '--serial0 socket --vga serial0 --boot c --bootdisk scsi0',
        '--ipconfig0 ip=dhcp'
    ].join(' '),

    '# ---------- Import the disk image into the VM ----------',
    `qm importdisk 1000 ${HOST_IMAGES_DIR}/bionic-server-cloudimg-amd64.img local-lvm`,

    '# ---------- Set the imported image as scsi0 ----------',
    'qm set 1000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-1000-disk-0'
];

const convertToTemplateCommands = [
    '# ---------- Convert VM into a template ----------',
    'qm template 1000'
];

/**
 * Returns a task that can be used to build a baseline template that will serve
 * as the baseline for all other VM images/templates.
 *
 * @param hostInfo Informtation about the remote host against which the task
 *        will be executed.
 *
 * @return ITaskDefinition A task definition that can be used to execute the
 *         task.
 */
export const getTask = (hostInfo: IRemoteHostInfo): ITaskDefinition => {
    return {
        title: 'Build baseline VM template',
        task: () => {
            const logger = _loggerProvider.getLogger(
                'build-baseline-vm-template'
            );
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
                    title: 'Check if baseline template build is required',
                    task: (ctx, task) => {
                        logger.trace(
                            'Check if baseline template build is required'
                        );
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
                    title: 'Create baseline VM',
                    skip,
                    task: () => {
                        logger.trace('Create baseline VM');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(createVmCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error creating baseline VM'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug('Baseline VM created');
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
