import { default as _chai, expect } from 'chai';
import 'mocha';
import _sinon from 'sinon';

import { ObjectMock, testValues as _testValues } from '@vamship/test-utils';
import _rewire from 'rewire';
import { injectSshSubTaskSuite } from '../../utils/test-suite-helper';

const _taskModule = _rewire('../../../src/tasks/init-k8s-instances');

describe('[init-k8s-instances task]', () => {
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
    let _promiseMock;
    const VM_STARTUP_WAIT_TIME = 180000;

    beforeEach(() => {
        _listrMock = new ObjectMock().addPromiseMock('run');
        _sshClientMock = new ObjectMock().addPromiseMock('run');
        _promiseMock = new ObjectMock().addMock('delay', () => {
            return _promiseMock.__delayPromise;
        });
        _promiseMock.__delayPromise = {
            then: () => true
        };

        _taskModule.__set__('listr_1', {
            default: _listrMock.ctor
        });
        _taskModule.__set__('ssh_utils_1', {
            SshClient: _sshClientMock.ctor
        });
        _taskModule.__set__('bluebird_1', {
            Promise: _promiseMock.instance
        });
    });

    describe('[init]', () => {
        it('should export expected properties', () => {
            expect(_taskModule.getTask).to.be.a('function');
        });
    });

    describe('getTask()', () => {
        const expectedTitle = 'Initialize instances for k8s cluster';
        const subTaskList = [
            {
                title: 'Check if instances have to be created',
                commandCount: 2,
                eatError: true
            },
            {
                title: 'Ensure that working directories exist',
                commandCount: 2,
                eatError: false
            },
            {
                title: 'Create SSH keys for instances',
                commandCount: 5,
                eatError: false
            },
            {
                title: 'Create SSH config for easy SSH to instances',
                commandCount: 2,
                eatError: false
            },
            {
                title: 'Create master and node instances',
                commandCount: 15,
                eatError: false
            },
            {
                title: 'Wait for instances to startup',
                commandCount: -1,
                nonSshTask: true,
                eatError: true
            }
        ];

        function _getSubTaskRunner(taskIndex: number) {
            return (
                args: object = {},
                ctx: object = {},
                task: object = {}
            ): Promise<undefined> => {
                _listrMock.ctor.resetHistory();
                _getTaskDefinition(args).task();
                return _listrMock.ctor.args[0][0][taskIndex].task(ctx, task);
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

        subTaskList.forEach(
            ({ title, commandCount, eatError, nonSshTask }, index) => {
                describe(`[sub task: ${title}]`, () => {
                    const execSubTask = _getSubTaskRunner(index);
                    const getSshClientMock = () => _sshClientMock;
                    const skipFlag = 'skipInstanceCreation';

                    if (!nonSshTask) {
                        injectSshSubTaskSuite(
                            commandCount,
                            eatError,
                            execSubTask,
                            getSshClientMock
                        );
                    } else if (index === 4) {
                        it('should return a promise when invoked', () => {
                            const ret = execSubTask();

                            expect(ret).to.be.an('object');
                            expect(ret.then).to.be.a('function');
                        });

                        it('should invoke the delay method to introduce a delay', () => {
                            const delayMethod = _promiseMock.mocks.delay;

                            expect(delayMethod.stub).to.not.have.been.called;

                            execSubTask();

                            expect(delayMethod.stub).to.have.been.calledOnce;
                            expect(delayMethod.stub).to.have.been.calledWith(
                                VM_STARTUP_WAIT_TIME
                            );
                        });

                        it('should return the promise from the delay method', () => {
                            const ret = execSubTask();
                            expect(ret).to.equal(_promiseMock.__delayPromise);
                        });
                    }

                    if (index === 0) {
                        it('should set the ctx.${skipFlag}=false if command execution fails', () => {
                            const sshClientMock = getSshClientMock();
                            const runMethod = sshClientMock.mocks.run;
                            const ctx = {
                                [skipFlag]: undefined
                            };

                            const ret = execSubTask(undefined, ctx);
                            runMethod.resolve({
                                commandCount,
                                successCount: 0,
                                failureCount: commandCount
                            });

                            return expect(ret).to.be.fulfilled.then(() => {
                                expect(ctx[skipFlag]).to.be.false;
                            });
                        });

                        it('should set the ctx.${skipFlag}=true if command execution succeeds', () => {
                            const sshClientMock = getSshClientMock();
                            const runMethod = sshClientMock.mocks.run;
                            const ctx = {
                                [skipFlag]: undefined
                            };

                            const ret = execSubTask(undefined, ctx);
                            runMethod.resolve({
                                commandCount,
                                successCount: commandCount,
                                failureCount: 0
                            });

                            return expect(ret).to.be.fulfilled.then(() => {
                                expect(ctx[skipFlag]).to.be.true;
                            });
                        });
                    } else {
                        describe('[skip]', () => {
                            function _execSkip(
                                args: object = {},
                                ctx: object = {}
                            ) {
                                _listrMock.ctor.resetHistory();
                                _getTaskDefinition(args).task();
                                return _listrMock.ctor.args[0][0][index].skip(
                                    ctx
                                );
                            }

                            it('should define a skip function', () => {
                                _getTaskDefinition({}).task();
                                const skip =
                                    _listrMock.ctor.args[0][0][index].skip;
                                expect(skip).to.be.a('function');
                            });

                            it(`should return false if ctx.${skipFlag} === false`, () => {
                                const ret = _execSkip(undefined, {
                                    [skipFlag]: false
                                });
                                expect(ret).to.be.false;
                            });

                            it(`should return a message if ctx.${skipFlag} === true`, () => {
                                const ret = _execSkip(undefined, {
                                    [skipFlag]: true
                                });
                                expect(ret).to.equal(
                                    'One or more instances already exist'
                                );
                            });
                        });
                    }
                });
            }
        );
    });
});
