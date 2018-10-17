import { default as _chai, expect } from 'chai';
import 'mocha';
import _sinon from 'sinon';

import { ObjectMock, testValues as _testValues } from '@vamship/test-utils';
import _rewire from 'rewire';
import { injectSshSubTaskSuite } from '../../utils/test-suite-helper';

const _taskModule = _rewire('../../../src/tasks/configure-nat');

describe('[configure-nat task]', () => {
    function _getTaskDefinition(args: object = {}) {
        const host = _testValues.getString('host');
        const port = _testValues.getNumber(100, 22);
        const username = _testValues.getString('username');
        const privateKey = _testValues.getString('privateKey');
        const password = _testValues.getString('password');

        const hostInfo = Object.assign(
            {
                host,
                port,
                username,
                privateKey,
                password
            },
            args
        );

        return _taskModule.getTask(hostInfo);
    }

    let _listrMock;
    let _sshClientMock;

    beforeEach(() => {
        _listrMock = new ObjectMock().addPromiseMock('run');
        _sshClientMock = new ObjectMock().addPromiseMock('run');

        _taskModule.__set__('listr_1', {
            default: _listrMock.ctor
        });
        _taskModule.__set__('ssh_utils_1', {
            SshClient: _sshClientMock.ctor
        });
    });

    describe('[init]', () => {
        it('should export expected properties', () => {
            expect(_taskModule.getTask).to.be.a('function');
        });
    });

    describe('getTask()', () => {
        const expectedTitle = 'Configure NAT';
        const subTaskList = [
            {
                title: 'Add linux bridge config and NAT settings',
                commandCount: 1,
                eatError: false
            },
            {
                title: 'Restart networking service',
                commandCount: 1,
                eatError: true
            }
        ];

        function _getSubTaskRunner(taskIndex: number) {
            return (args: object = {}): Promise<undefined> => {
                _listrMock.ctor.resetHistory();
                _getTaskDefinition(args).task();
                return _listrMock.ctor.args[0][0][taskIndex].task();
            };
        }

        it('should return a task definition when invoked', () => {
            const taskDefinition = _getTaskDefinition();

            expect(taskDefinition.title).to.equal(expectedTitle);
            expect(taskDefinition.task).to.be.a('function');
        });

        it('should create and return a Listr object when the task is invoked', () => {
            expect(_listrMock.ctor).to.not.have.been.called;

            const ret = _getTaskDefinition().task();

            expect(_listrMock.ctor).to.have.been.calledOnce;
            expect(ret).to.equal(_listrMock.instance);
        });

        it('should define the expected number of sub tasks with correct titles', () => {
            _getTaskDefinition().task();
            expect(_listrMock.ctor.args[0]).to.have.length(1);

            const subTaskArg = _listrMock.ctor.args[0][0];
            expect(subTaskArg).to.be.an('array');

            const subTaskTitles = subTaskList.map((task) => task.title);
            expect(subTaskArg).to.have.length(subTaskTitles.length);

            subTaskTitles.forEach((title, index) => {
                expect(subTaskArg[index]).to.be.an('object');
                expect(subTaskArg[index].title).to.equal(title);
                expect(subTaskArg[index].task).to.be.a('function');
            });
        });

        subTaskList.forEach(({ title, commandCount, eatError }, index) => {
            describe(`[sub task: ${title}]`, () => {
                const execSubTask = _getSubTaskRunner(index);

                injectSshSubTaskSuite(
                    commandCount,
                    eatError,
                    execSubTask,
                    () => _sshClientMock
                );

                if (index === 0) {
                    describe('[skip]', () => {
                        function _execSkip(args: object = {}) {
                            _listrMock.ctor.resetHistory();
                            _getTaskDefinition(args).task();
                            return _listrMock.ctor.args[0][0][index].skip();
                        }

                        function getSshClientMock() {
                            return _sshClientMock;
                        }

                        it('should define a skip function', () => {
                            _getTaskDefinition({}).task();
                            const skip = _listrMock.ctor.args[0][0][index].skip;
                            expect(skip).to.be.a('function');
                        });

                        it('should return a promise when invoked', () => {
                            const ret = _execSkip();

                            expect(ret).to.be.an('object');
                            expect(ret.then).to.be.a('function');
                        });

                        it('should initialize an ssh client with the correct parameters', () => {
                            const sshClientMock = getSshClientMock();
                            const host = _testValues.getString('host');
                            const port = _testValues.getNumber(100, 22);
                            const username = _testValues.getString('username');
                            const privateKey = _testValues.getString(
                                'privateKey'
                            );
                            const password = _testValues.getString('password');

                            sshClientMock.ctor.resetHistory();
                            expect(sshClientMock.ctor).to.not.have.been.called;

                            _execSkip({
                                host,
                                port,
                                username,
                                password,
                                privateKey
                            });

                            expect(sshClientMock.ctor).to.have.been.calledOnce;
                            expect(sshClientMock.ctor).to.have.been
                                .calledWithNew;
                            expect(sshClientMock.ctor.args[0]).to.have.length(
                                1
                            );

                            const clientOptions = sshClientMock.ctor.args[0][0];
                            expect(clientOptions).to.be.an('object');
                            expect(clientOptions.host).to.equal(host);
                            expect(clientOptions.username).to.equal(username);
                            expect(clientOptions.port).to.equal(port);
                            expect(clientOptions.password).to.equal(password);
                            expect(clientOptions.privateKey).to.equal(
                                privateKey
                            );
                        });

                        it('should run the expected number of commands over ssh', () => {
                            const sshClientMock = getSshClientMock();
                            const runMethod = sshClientMock.mocks.run;

                            expect(runMethod.stub).to.not.have.been.called;

                            _execSkip();

                            expect(runMethod.stub).to.have.been.calledOnce;
                            expect(runMethod.stub.args[0]).to.have.length(1);

                            const commands = runMethod.stub.args[0][0];
                            expect(commands).to.be.an('array');
                            expect(commands).to.have.length(1);
                        });

                        it('should resolve the promise with a message if command execution succeeds', () => {
                            const sshClientMock = getSshClientMock();
                            const runMethod = sshClientMock.mocks.run;

                            const ret = _execSkip();
                            runMethod.resolve({
                                commandCount: 1,
                                successCount: 1,
                                failureCount: 0
                            });

                            return expect(ret).to.be.fulfilled.then(
                                (result) => {
                                    expect(result).to.equal(
                                        'Network already configured'
                                    );
                                }
                            );
                        });

                        it('should resolve the promise with false if command execution fails', () => {
                            const sshClientMock = getSshClientMock();
                            const runMethod = sshClientMock.mocks.run;

                            const ret = _execSkip();
                            runMethod.resolve({
                                commandCount: 1,
                                successCount: 0,
                                failureCount: 1
                            });

                            return expect(ret).to.be.fulfilled.then(
                                (result) => {
                                    expect(result).to.be.false;
                                }
                            );
                        });
                    });
                }
            });
        });
    });
});
