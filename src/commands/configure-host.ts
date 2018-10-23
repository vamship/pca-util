/**
 * @module root.commands.configureHost
 */
import Listr from 'listr';
import { getTask as _getConfigureDhcpTask } from '../tasks/configure-dhcp';
import { getTask as _getConfigureNatTask } from '../tasks/configure-nat';
import { getTask as _getUpdateHostTask } from '../tasks/update-host';
import { IRemoteHostInfo } from '../types';

export const command = 'configure-host';
export const describe = "Configure remote host's software and network";
export const builder = {
    host: {
        alias: 'h',
        describe: 'The hostname/ip address of the remote host',
        type: 'string',
        demand: true
    },
    username: {
        alias: 'u',
        describe: 'The username to use to authenticate against the remote host',
        type: 'string',
        demand: true
    },
    port: {
        alias: 'o',
        describe: 'The port on which to connect to the host',
        type: 'number',
        default: 22
    },
    password: {
        alias: 'p',
        describe: [
            'The password to use to authenticate against the remote host.',
            'If a private key is specified, then the password will be used',
            'to unlock the private key'
        ].join(' '),
        type: 'string',
        default: undefined
    },
    'private-key': {
        alias: 'k',
        describe: 'The path to the ssh private key',
        type: 'string',
        default: undefined
    }
};
export const handler = (argv) => {
    const { host, username, port, password, privateKey } = argv;
    const hostInfo: IRemoteHostInfo = {
        host,
        username,
        port,
        password,
        privateKey
    };

    return new Listr([
        _getUpdateHostTask(hostInfo),
        _getConfigureNatTask(hostInfo),
        _getConfigureDhcpTask(hostInfo)
    ]).run();
};
