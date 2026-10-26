USE [QNHDB];
GO
-- READ ONLY. Check whether a recipient is missing entirely, inactive, or lacks settings.
SELECT ids.portal_user_id, portal.USER_CODE, portal.USER_NAME, portal.IS_ACTIVE AS portal_is_active,
       access.is_active AS taskhub_is_active,
       CASE WHEN settings.portal_user_id IS NULL THEN 0 ELSE 1 END AS has_user_settings,
       CASE WHEN userEmail.owner_user_id IS NULL THEN 0 ELSE 1 END AS has_email_settings,
       CASE WHEN NULLIF(LTRIM(RTRIM(portal.email)), N'') IS NULL THEN 0 ELSE 1 END AS has_portal_email,
       (SELECT COUNT(*) FROM dbo.TM_notifications n
        WHERE n.owner_user_id = ids.portal_user_id AND n.email_processed_at_utc IS NULL) AS pending_email_notifications
FROM (VALUES (575), (293), (686), (288), (349)) AS ids(portal_user_id)
LEFT JOIN dbo.users portal ON portal.USER_ID = ids.portal_user_id
LEFT JOIN dbo.TM_user_access access ON access.portal_user_id = ids.portal_user_id
LEFT JOIN dbo.TM_user_settings settings ON settings.portal_user_id = ids.portal_user_id
LEFT JOIN dbo.TM_user_email_settings userEmail ON userEmail.owner_user_id = ids.portal_user_id
ORDER BY ids.portal_user_id;
