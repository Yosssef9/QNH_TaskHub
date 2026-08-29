SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_tasks', N'U') IS NULL
        THROW 50301, 'TaskHub task table does not exist. Apply migration 001 first.', 1;

    IF OBJECT_ID(N'dbo.TM_kpis', N'U') IS NULL
        THROW 50302, 'TaskHub KPI table does not exist. Apply migration 001 first.', 1;

    IF OBJECT_ID(N'dbo.TM_holidays', N'U') IS NULL
        THROW 50303, 'TaskHub holidays table does not exist. Apply migration 001 first.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_tasks')
          AND name = N'CK_TM_tasks_reference_requires_due_date'
    )
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM dbo.TM_tasks AS task
            INNER JOIN dbo.TM_kpis AS kpi
                ON kpi.id = task.kpi_id
               AND kpi.owner_user_id = task.owner_user_id
            WHERE kpi.calculation_method = 'ON_TIME_RATE'
              AND task.reference_date IS NULL
        )
            THROW 50304, 'An ON_TIME_RATE KPI task is missing its reference date. Fix the data before applying migration 003.', 1;

        DECLARE @TaskId BIGINT;
        DECLARE @ReferenceDate DATE;
        DECLARE @BusinessDayOffset INT;
        DECLARE @DeadlineDirection VARCHAR(10);
        DECLARE @DueDate DATE;
        DECLARE @Step INT;
        DECLARE @Remaining INT;

        DECLARE OnTimeTaskCursor CURSOR LOCAL FAST_FORWARD FOR
            SELECT
                task.id,
                task.reference_date,
                kpi.business_day_offset,
                kpi.deadline_direction
            FROM dbo.TM_tasks AS task
            INNER JOIN dbo.TM_kpis AS kpi
                ON kpi.id = task.kpi_id
               AND kpi.owner_user_id = task.owner_user_id
            WHERE kpi.calculation_method = 'ON_TIME_RATE';

        OPEN OnTimeTaskCursor;

        FETCH NEXT FROM OnTimeTaskCursor
        INTO @TaskId, @ReferenceDate, @BusinessDayOffset, @DeadlineDirection;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @DueDate = @ReferenceDate;
            SET @Step = CASE WHEN @DeadlineDirection = 'BEFORE' THEN -1 ELSE 1 END;
            SET @Remaining = @BusinessDayOffset;

            WHILE @Remaining > 0
            BEGIN
                SET @DueDate = DATEADD(DAY, @Step, @DueDate);

                IF (
                    ((DATEDIFF(DAY, CONVERT(date, '19000101', 112), @DueDate) % 7) + 7) % 7
                    NOT IN (4, 5)
                    AND NOT EXISTS (
                        SELECT 1
                        FROM dbo.TM_holidays AS holiday
                        WHERE holiday.is_active = 1
                          AND holiday.holiday_date = @DueDate
                    )
                )
                    SET @Remaining -= 1;
            END;

            UPDATE dbo.TM_tasks
            SET
                due_date = @DueDate,
                updated_at_utc = SYSUTCDATETIME()
            WHERE id = @TaskId;

            FETCH NEXT FROM OnTimeTaskCursor
            INTO @TaskId, @ReferenceDate, @BusinessDayOffset, @DeadlineDirection;
        END;

        CLOSE OnTimeTaskCursor;
        DEALLOCATE OnTimeTaskCursor;

        IF EXISTS (
            SELECT 1
            FROM sys.check_constraints
            WHERE parent_object_id = OBJECT_ID(N'dbo.TM_tasks')
              AND name = N'CK_TM_tasks_kpi_due_date'
        )
        BEGIN
            ALTER TABLE dbo.TM_tasks
            DROP CONSTRAINT CK_TM_tasks_kpi_due_date;
        END;

        ALTER TABLE dbo.TM_tasks WITH CHECK
        ADD CONSTRAINT CK_TM_tasks_reference_requires_due_date
            CHECK (reference_date IS NULL OR due_date IS NOT NULL);

        ALTER TABLE dbo.TM_tasks
        CHECK CONSTRAINT CK_TM_tasks_reference_requires_due_date;
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF CURSOR_STATUS('local', 'OnTimeTaskCursor') >= 0
        CLOSE OnTimeTaskCursor;

    IF CURSOR_STATUS('local', 'OnTimeTaskCursor') > -3
        DEALLOCATE OnTimeTaskCursor;

    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
