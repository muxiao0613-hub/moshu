import { expect, it } from 'vitest';
import fixtures from './fixtures/contracts.json';
import type { AppError, Commands, DocumentSession, DocumentView, Project, SaveReceipt, Task } from '../src/contracts';

it('两端共用 UUID、空值、枚举及保存回执 fixture', () => {
  const session: DocumentSession = fixtures.documentSession;
  expect(session).toEqual(fixtures.documentSession);
  const task: Task = {...fixtures.task,status:'inProgress',priority:'high'};
  const document: DocumentView = {...fixtures.document,blocks:[]};
  expect(document).toEqual(fixtures.document);
  expect(task).toEqual(fixtures.task);
  expect(task.dueDate).toBe('2026-10-11');
  const project: Project = { ...fixtures.project, status: 'archived' };
  const error: AppError = { ...fixtures.error, code: 'CONFLICT' };
  const receipt: SaveReceipt = fixtures.receipt;
  const create: Commands['create_note']['input'] = fixtures.createNote;
  expect(project).toEqual(fixtures.project);
  expect(error).toEqual(fixtures.error);
  expect(project.deletedAt).toBeNull(); expect(project.revision).toBe(2);
  expect(error.details?.currentRevision).toBe(receipt.savedRevision);
  expect(create.projectId).toBeNull();
});
