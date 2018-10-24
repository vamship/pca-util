import { default as _chai, expect } from 'chai';
import 'mocha';
import _sinon from 'sinon';

import { ObjectMock, testValues as _testValues } from '@vamship/test-utils';
import _rewire from 'rewire';
import { injectSshSubTaskSuite } from '../../utils/test-suite-helper';

const _taskModule = _rewire('../../../src/tasks/build-baseline-vm-template');

describe('[build-baseline-vm-template task]', () => {
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
        const expectedTitle = 'Build baseline VM template';
        const subTaskList = [
            {
                title: 'Check if baseline template build is required',
                commandCount: 1,
                eatError: true
            },
            {
                title: 'Create baseline VM',
                commandCount: 3,
                eatError: false
            },
            {
                title: 'Convert VM into template',
                commandCount: 1,
                eatError: false
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

        subTaskList.forEach(({ title, commandCount, eatError }, index) => {
            describe(`[sub task: ${title}]`, () => {
                const execSubTask = _getSubTaskRunner(index);
                const getSshClientMock = () => _sshClientMock;

                injectSshSubTaskSuite(
                    commandCount,
                    eatError,
                    execSubTask,
                    getSshClientMock
                );

                if (index === 0) {
                    it('should set the ctx.skipTemplateBuild=false if command execution fails', () => {
                        const sshClientMock = getSshClientMock();
                        const runMethod = sshClientMock.mocks.run;
                        const ctx = {
                            skipTemplateBuild: undefined
                        };

                        const ret = execSubTask(undefined, ctx);
                        runMethod.resolve({
                            commandCount,
                            successCount: 0,
                            failureCount: commandCount
                        });

                        return expect(ret).to.be.fulfilled.then(() => {
                            expect(ctx.skipTemplateBuild).to.be.false;
                        });
                    });

                    it('should set the ctx.skipTemplateBuild=true if command execution succeeds', () => {
                        const sshClientMock = getSshClientMock();
                        const runMethod = sshClientMock.mocks.run;
                        const ctx = {
                            skipTemplateBuild: undefined
                        };

                        const ret = execSubTask(undefined, ctx);
                        runMethod.resolve({
                            commandCount,
                            successCount: commandCount,
                            failureCount: 0
                        });

                        return expect(ret).to.be.fulfilled.then(() => {
                            expect(ctx.skipTemplateBuild).to.be.true;
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
                            return _listrMock.ctor.args[0][0][index].skip(ctx);
                        }

                        it('should define a skip function', () => {
                            _getTaskDefinition({}).task();
                            const skip = _listrMock.ctor.args[0][0][index].skip;
                            expect(skip).to.be.a('function');
                        });

                        it('should return false if ctx.skipTemplateBuild === false', () => {
                            const ret = _execSkip(undefined, {
                                skipTemplateBuild: false
                            });
                            expect(ret).to.be.false;
                        });

                        it('should return a message if ctx.skipTemplateBuild === true', () => {
                            const ret = _execSkip(undefined, {
                                skipTemplateBuild: true
                            });
                            expect(ret).to.equal('Template already exists');
                        });
                    });
                }
            });
        });
    });
});
