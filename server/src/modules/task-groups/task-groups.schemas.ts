import { taskListQuerySchema } from '../tasks/tasks.schemas.js';
import { z } from 'zod';

export const groupListParamsSchema = z.object({listId:z.coerce.number().int().positive()});
export const groupParamsSchema = groupListParamsSchema.extend({groupId:z.coerce.number().int().positive()});
export const taskGroupTaskParamsSchema = z.object({taskId:z.coerce.number().int().positive()});
export const createGroupBodySchema = z.object({
  name:z.string().trim().min(1).max(150),
  parentGroupId:z.number().int().positive().nullable().default(null),
});
export const updateGroupBodySchema = z.object({
  name:z.string().trim().min(1).max(150).optional(),
  parentGroupId:z.number().int().positive().nullable().optional(),
  displayOrder:z.number().int().min(0).optional(),
}).refine(v=>Object.keys(v).length>0,{message:'A group change is required.'});
export const moveTaskGroupBodySchema = z.object({groupId:z.number().int().positive().nullable()});

export const reorderGroupsBodySchema = z.object({parentGroupId:z.number().int().positive().nullable(),groupIds:z.array(z.number().int().positive()).min(1).max(2000)});

export const bulkMoveTasksBodySchema=z.object({groupId:z.number().int().positive().nullable(),taskIds:z.array(z.number().int().positive()).min(1).max(100).refine(v=>new Set(v).size===v.length,'Duplicate Task IDs.')});

/** Reuse the normal Task List filters so Group counts match its task results. */
export const taskGroupListQuerySchema = taskListQuerySchema.pick({
  search: true, status: true, priority: true, taskType: true,
  tagIds: true, tagMatch: true, due: true,
});
export type TaskGroupListQuery = z.infer<typeof taskGroupListQuerySchema>;
