import { describe, expect, it } from 'vitest';
import { taskTagsFilterSql, taskTagsSelectSql } from '../../src/modules/tags/task-tags.sql.js';

describe('Task tags SQL contract', () => {
  it('returns only active tag metadata, never image bytes', () => {
    expect(taskTagsSelectSql).toContain('tag.is_active=1');
    expect(taskTagsSelectSql).toContain('FOR JSON PATH');
    expect(taskTagsSelectSql).not.toMatch(/icon_data|icon_mime/i);
  });
  it('filters ANY, ALL, and UNTAGGED against active assignments only', () => {
    for (const mode of ['ANY', 'ALL', 'UNTAGGED']) {
      expect(taskTagsFilterSql).toContain(`@tagMatch='${mode}'`);
    }
    expect(taskTagsFilterSql.match(/tag\.is_active=1/g)).toHaveLength(3);
    expect(taskTagsFilterSql).toContain('STRING_SPLIT(@tagIds');
    expect(taskTagsFilterSql).toContain('NOT EXISTS');
  });
});
