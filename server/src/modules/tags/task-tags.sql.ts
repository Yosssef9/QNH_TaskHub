/** Metadata only. Tag images never enter task list payloads. */
export const taskTagsSelectSql = `(SELECT tag.id, tag.name, tag.scope,
  tag.icon_kind AS iconKind, tag.icon_key AS iconKey, tag.color
  FROM dbo.TM_task_tags AS tt
  JOIN dbo.TM_tags AS tag ON tag.id=tt.tag_id AND tag.is_active=1
  WHERE tt.task_id=task.id
  ORDER BY tag.name,tag.id FOR JSON PATH) AS taskTagsJson`;

/** Every query using this condition binds @tagIds (CSV) and @tagMatch. */
export const taskTagsFilterSql = `(
  (@tagMatch='ANY' AND (@tagIds IS NULL OR EXISTS(
    SELECT 1 FROM dbo.TM_task_tags tt JOIN dbo.TM_tags tag ON tag.id=tt.tag_id AND tag.is_active=1
    WHERE tt.task_id=task.id
      AND tt.tag_id IN (SELECT TRY_CONVERT(BIGINT,value) FROM STRING_SPLIT(@tagIds,',')))))
  OR (@tagMatch='ALL' AND (@tagIds IS NULL OR NOT EXISTS(
    SELECT 1 FROM STRING_SPLIT(@tagIds,',') selected
    WHERE NOT EXISTS (SELECT 1 FROM dbo.TM_task_tags tt JOIN dbo.TM_tags tag
      ON tag.id=tt.tag_id AND tag.is_active=1
      WHERE tt.task_id=task.id AND tt.tag_id=TRY_CONVERT(BIGINT,selected.value)))))
  OR (@tagMatch='UNTAGGED' AND NOT EXISTS(
    SELECT 1 FROM dbo.TM_task_tags tt JOIN dbo.TM_tags tag ON tag.id=tt.tag_id AND tag.is_active=1
    WHERE tt.task_id=task.id))
)`;
