import { default as _chai, expect } from 'chai';
import _chaiAsPromised from 'chai-as-promised';
import _sinonChai from 'sinon-chai';
_chai.use(_sinonChai);
_chai.use(_chaiAsPromised);
import 'mocha';

import _rewire from 'rewire';
import _sinon from 'sinon';

import {
    consoleHelper as _consoleHelper,
    ObjectMock,
    testValues as _testValues
} from '@vamship/test-utils';
import { Promise } from 'bluebird';

const _commandModule = _rewire('../../../src/commands/create-templates');

describe('[create-templates command]', () => {
    function _execHandler(args: object = {}, noMute: boolean = false) {
        const host = _testValues.getString('host');
        const port = _testValues.getNumber(100, 22);
        const username = _testValues.getString('username');
        const privateKey = _testValues.getString('privateKey');
        const password = _testValues.getString('password');

        args = Object.assign(
            {
                host,
                port,
                username,
                privateKey,
                password
            },
            args
        );

        if (!noMute) {
            _consoleHelper.mute();
        }
        return Promise.try(() => {
            return _commandModule.handler(args);
        }).finally(() => {
            if (!noMute) {
                _consoleHelper.unmute();
            }
        });
    }

    function _finishCommand(result?: Error) {
        const runMethod = _listrMock.mocks.run;

        if (result instanceof Error) {
            runMethod.reject(result);
        } else {
            runMethod.resolve();
        }
    }

    let _listrMock;
    const _taskMocks = {};

    beforeEach(() => {
        _listrMock = new ObjectMock().addPromiseMock('run');
        [
            'setup-template-environment',
            'build-baseline-vm-template',
            'build-k8s-vm-template',
            'build-developer-vm-template',
            'cleanup-template-environment'
        ].forEach((mockName) => {
            _taskMocks[mockName] = new ObjectMock().addMock('getTask', () => {
                return _taskMocks[mockName].__taskDefinition;
            });
            _taskMocks[mockName].__taskDefinition = {};
        });

        _commandModule.__set__('listr_1', {
            default: _listrMock.ctor
        });
        _commandModule.__set__(
            'setup_template_environment_1',
            _taskMocks['setup-template-environment'].instance
        );
        _commandModule.__set__(
            'build_baseline_vm_template_1',
            _taskMocks['build-baseline-vm-template'].instance
        );
        _commandModule.__set__(
            'build_k8s_vm_template_1',
            _taskMocks['build-k8s-vm-template'].instance
        );
        _commandModule.__set__(
            'build_developer_vm_template_1',
            _taskMocks['build-developer-vm-template'].instance
        );
        _commandModule.__set__(
            'cleanup_template_environment_1',
            _taskMocks['cleanup-template-environment'].instance
        );
    });

    describe('[init]', () => {
        it('should export properties required by the command', () => {
            const expectedCommand = 'create-templates';
            const expectedDescription =
                'Create VM templates for kubernetes nodes and bastion';
            const expectedBuilder = {
                host: {
                    alias: 'h',
                    describe: 'The hostname/ip address of the remote host',
                    type: 'string',
                    demand: true
                },
                username: {
                    alias: 'u',
                    describe:
                        'The username to use to authenticate against the remote host',
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

            expect(_commandModule.command).to.equal(expectedCommand);
            expect(_commandModule.describe).to.equal(expectedDescription);
            expect(_commandModule.builder).to.deep.equal(expectedBuilder);
            expect(_commandModule.handler).to.be.a('function');
        });
    });

    describe('[execution]', () => {
        it('should return a promise when invoked', () => {
            const ret = _execHandler();

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');

            _finishCommand();
            return expect(ret).to.be.fulfilled;
        });

        it('should invoke the getTask() method on each sub task', () => {
            const subTaskMocks = Object.keys(_taskMocks).map(
                (prop) => _taskMocks[prop]
            );

            subTaskMocks.forEach((subTaskMock) => {
                const getTaskMethod = subTaskMock.mocks.getTask;
                expect(getTaskMethod.stub).to.not.have.been.called;
            });

            const hostInfo = {
                host: _testValues.getString('host'),
                port: _testValues.getNumber(100, 22),
                username: _testValues.getString('username'),
                privateKey: _testValues.getString('privateKey'),
                password: _testValues.getString('password')
            };
            const ret = _execHandler(hostInfo);

            _finishCommand();
            return expect(ret).to.be.fulfilled.then(() => {
                subTaskMocks.forEach((subTaskMock) => {
                    const getTaskMethod = subTaskMock.mocks.getTask;
                    expect(getTaskMethod.stub).to.have.been.calledOnce;
                    expect(getTaskMethod.stub.args[0]).to.have.length(1);
                    expect(getTaskMethod.stub.args[0][0]).to.deep.equal(
                        hostInfo
                    );
                });
            });
        });

        it('should instantiate a listr object with a set of tasks', () => {
            expect(_listrMock.ctor).to.not.have.been.called;

            const ret = _execHandler();

            _finishCommand();
            return expect(ret).to.be.fulfilled.then(() => {
                expect(_listrMock.ctor).to.have.been.calledOnce;
                expect(_listrMock.ctor).to.have.been.calledWithNew;
                expect(_listrMock.ctor.args[0]).to.have.length(1);

                const tasks = _listrMock.ctor.args[0][0];
                const subTaskDefinitions = Object.keys(_taskMocks).map(
                    (prop) => _taskMocks[prop].__taskDefinition
                );

                expect(tasks).to.be.an('array');
                expect(tasks).to.have.ordered.members(subTaskDefinitions);
            });
        });

        it('should invoke the run method on the listr object', () => {
            const runMethod = _listrMock.mocks.run;
            expect(runMethod.stub).to.not.have.been.called;

            const ret = _execHandler();
            _finishCommand();

            return expect(ret).to.be.fulfilled.then(() => {
                expect(runMethod.stub).to.have.been.calledOnce;
            });
        });

        it('should reject the promise if the run method fails', () => {
            const error = new Error('something went wrong');

            const ret = _execHandler();

            _finishCommand(error);
            return expect(ret).to.be.rejectedWith(error);
        });

        it('should resolve the promise if the run method succeeds', () => {
            const ret = _execHandler();

            _finishCommand();
            return expect(ret).to.be.fulfilled;
        });
    });
});
