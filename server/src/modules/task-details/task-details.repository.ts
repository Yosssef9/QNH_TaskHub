import { getDatabasePool, sql } from "../../database/sql.js";
import type { DatabaseTransaction } from "../../database/types.js";
import type { ActivityRecord, AttachmentRecord, SubtaskRecord } from "./task-details.types.js";

interface IdRecord {
  id: number;
}

export const taskDetailsRepository = {
  async listSubtasks(ownerUserId: number, taskId: number, transaction?: DatabaseTransaction) {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    const result = await request
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .query<SubtaskRecord>(`SELECT id, task_id AS taskId, title, is_completed AS isCompleted,
        due_date AS dueDate, display_order AS displayOrder, created_at_utc AS createdAtUtc,
        updated_at_utc AS updatedAtUtc, completed_at_utc AS completedAtUtc
        FROM dbo.TM_subtasks WHERE owner_user_id=@ownerUserId AND task_id=@taskId
        AND deleted_at_utc IS NULL ORDER BY display_order, id;`);
    return result.recordset;
  },

  async listAttachments(ownerUserId: number, taskId: number) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .query<AttachmentRecord>(`SELECT attachment.id, attachment.task_id AS taskId,
        attachment.subtask_id AS subtaskId, attachment.original_file_name AS originalFileName,
        attachment.storage_key AS storageKey, attachment.mime_type AS mimeType,
        attachment.file_extension AS fileExtension, attachment.size_bytes AS sizeBytes,
        attachment.uploaded_at_utc AS uploadedAtUtc FROM dbo.TM_attachments AS attachment
        LEFT JOIN dbo.TM_subtasks AS subtask ON subtask.id=attachment.subtask_id
          AND subtask.owner_user_id=attachment.owner_user_id
        WHERE attachment.owner_user_id=@ownerUserId AND attachment.deleted_at_utc IS NULL
          AND (attachment.task_id=@taskId OR (subtask.task_id=@taskId AND subtask.deleted_at_utc IS NULL))
        ORDER BY attachment.uploaded_at_utc DESC;`);
    return result.recordset;
  },

  async listActivity(ownerUserId: number, taskId: number) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .query<ActivityRecord>(`SELECT id, activity_type AS activityType, event_data_json AS eventDataJson,
        created_at_utc AS createdAtUtc FROM dbo.TM_task_activity
        WHERE owner_user_id=@ownerUserId AND task_id=@taskId ORDER BY created_at_utc DESC, id DESC;`);
    return result.recordset;
  },

  async findSubtask(ownerUserId: number, subtaskId: number, transaction?: DatabaseTransaction) {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    const result = await request
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("subtaskId", sql.BigInt, subtaskId)
      .query<SubtaskRecord>(`SELECT TOP(1) subtask.id, subtask.task_id AS taskId, subtask.title,
        subtask.is_completed AS isCompleted, subtask.due_date AS dueDate,
        subtask.display_order AS displayOrder, subtask.created_at_utc AS createdAtUtc,
        subtask.updated_at_utc AS updatedAtUtc, subtask.completed_at_utc AS completedAtUtc
        FROM dbo.TM_subtasks AS subtask ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
        INNER JOIN dbo.TM_tasks AS task ON task.id=subtask.task_id AND task.owner_user_id=subtask.owner_user_id
        WHERE subtask.id=@subtaskId AND subtask.owner_user_id=@ownerUserId
          AND subtask.deleted_at_utc IS NULL AND task.deleted_at_utc IS NULL;`);
    return result.recordset[0] ?? null;
  },

  async createSubtask(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    taskId: number,
    title: string,
    dueDate: string | null,
  ) {
    const result = await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .input("title", sql.NVarChar(1000), title)
      .input("dueDate", sql.Date, dueDate)
      .query<IdRecord>(`INSERT dbo.TM_subtasks(task_id,owner_user_id,title,due_date,display_order)
        OUTPUT inserted.id SELECT @taskId,@ownerUserId,@title,@dueDate,ISNULL(MAX(display_order),0)+1
        FROM dbo.TM_subtasks WHERE owner_user_id=@ownerUserId AND task_id=@taskId AND deleted_at_utc IS NULL;`);
    return result.recordset[0]?.id ?? null;
  },

  async updateSubtask(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    subtaskId: number,
    title: string,
    dueDate: string | null,
  ) {
    await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("subtaskId", sql.BigInt, subtaskId)
      .input("title", sql.NVarChar(1000), title)
      .input("dueDate", sql.Date, dueDate).query(`UPDATE dbo.TM_subtasks
        SET title=@title,due_date=@dueDate,updated_at_utc=SYSUTCDATETIME()
        WHERE id=@subtaskId AND owner_user_id=@ownerUserId AND deleted_at_utc IS NULL;`);
  },

  async completeSubtask(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    subtaskId: number,
    completed: boolean,
  ) {
    await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("subtaskId", sql.BigInt, subtaskId)
      .input("completed", sql.Bit, completed)
      .query(`UPDATE dbo.TM_subtasks SET is_completed=@completed,
        completed_at_utc=CASE WHEN @completed=1 THEN SYSUTCDATETIME() ELSE NULL END,
        updated_at_utc=SYSUTCDATETIME() WHERE id=@subtaskId AND owner_user_id=@ownerUserId AND deleted_at_utc IS NULL;`);
  },

  async deleteSubtask(transaction: DatabaseTransaction, ownerUserId: number, subtaskId: number) {
    await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("subtaskId", sql.BigInt, subtaskId)
      .query(`UPDATE dbo.TM_subtasks SET deleted_at_utc=SYSUTCDATETIME(),updated_at_utc=SYSUTCDATETIME()
        WHERE id=@subtaskId AND owner_user_id=@ownerUserId AND deleted_at_utc IS NULL;`);
  },

  async reorderSubtasks(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    taskId: number,
    ids: number[],
  ) {
    for (const [index, id] of ids.entries()) {
      await transaction
        .request()
        .input("ownerUserId", sql.Int, ownerUserId)
        .input("taskId", sql.BigInt, taskId)
        .input("subtaskId", sql.BigInt, id)
        .input("displayOrder", sql.Int, index + 1)
        .query(`UPDATE dbo.TM_subtasks SET display_order=@displayOrder,updated_at_utc=SYSUTCDATETIME()
          WHERE id=@subtaskId AND task_id=@taskId AND owner_user_id=@ownerUserId AND deleted_at_utc IS NULL;`);
    }
  },

  async createAttachment(
    transaction: DatabaseTransaction,
    values: {
      ownerUserId: number;
      taskId: number | null;
      subtaskId: number | null;
      name: string;
      key: string;
      mime: string;
      extension: string;
      size: number;
    },
  ) {
    const result = await transaction
      .request()
      .input("ownerUserId", sql.Int, values.ownerUserId)
      .input("taskId", sql.BigInt, values.taskId)
      .input("subtaskId", sql.BigInt, values.subtaskId)
      .input("name", sql.NVarChar(260), values.name)
      .input("key", sql.VarChar(500), values.key)
      .input("mime", sql.VarChar(255), values.mime)
      .input("extension", sql.VarChar(20), values.extension)
      .input("size", sql.BigInt, values.size).query<AttachmentRecord>(`INSERT dbo.TM_attachments
        (owner_user_id,task_id,subtask_id,original_file_name,storage_key,mime_type,file_extension,size_bytes)
        OUTPUT inserted.id,inserted.task_id AS taskId,inserted.subtask_id AS subtaskId,
        inserted.original_file_name AS originalFileName,inserted.storage_key AS storageKey,
        inserted.mime_type AS mimeType,inserted.file_extension AS fileExtension,
        inserted.size_bytes AS sizeBytes,inserted.uploaded_at_utc AS uploadedAtUtc
        VALUES(@ownerUserId,@taskId,@subtaskId,@name,@key,@mime,@extension,@size);`);
    return result.recordset[0] ?? null;
  },

  async findAttachment(ownerUserId: number, id: string, transaction?: DatabaseTransaction) {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    const result = await request
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("id", sql.UniqueIdentifier, id)
      .query<AttachmentRecord>(`SELECT TOP(1) attachment.id,attachment.task_id AS taskId,
        attachment.subtask_id AS subtaskId,attachment.original_file_name AS originalFileName,
        attachment.storage_key AS storageKey,attachment.mime_type AS mimeType,
        attachment.file_extension AS fileExtension,attachment.size_bytes AS sizeBytes,
        attachment.uploaded_at_utc AS uploadedAtUtc FROM dbo.TM_attachments AS attachment
        LEFT JOIN dbo.TM_tasks AS directTask ON directTask.id=attachment.task_id AND directTask.owner_user_id=attachment.owner_user_id
        LEFT JOIN dbo.TM_subtasks AS subtask ON subtask.id=attachment.subtask_id AND subtask.owner_user_id=attachment.owner_user_id
        LEFT JOIN dbo.TM_tasks AS subtaskTask ON subtaskTask.id=subtask.task_id AND subtaskTask.owner_user_id=subtask.owner_user_id
        WHERE attachment.id=@id AND attachment.owner_user_id=@ownerUserId AND attachment.deleted_at_utc IS NULL
          AND ((directTask.id IS NOT NULL AND directTask.deleted_at_utc IS NULL) OR
            (subtask.id IS NOT NULL AND subtaskTask.id IS NOT NULL AND subtask.deleted_at_utc IS NULL
              AND subtaskTask.deleted_at_utc IS NULL));`);
    return result.recordset[0] ?? null;
  },

  async deleteAttachment(transaction: DatabaseTransaction, ownerUserId: number, id: string) {
    await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`UPDATE dbo.TM_attachments SET deleted_at_utc=SYSUTCDATETIME()
        WHERE id=@id AND owner_user_id=@ownerUserId AND deleted_at_utc IS NULL;`);
  },
};
